import type { ConfigureBreakoutRoomsOptions } from "@zoom/appssdk"

import { emptyHistory, recordRound, type History } from "@/lib/matchmaking/rounds"
import type { MatchPlan } from "@/lib/matchmaking/types"
import { encode, type Message, type RoundInfo } from "@/lib/messages"
import { orchestrate, type AssignmentFailure } from "@/lib/orchestrate"
import type { ZoomClient } from "@/lib/zoom-client"

export type RunnerPhase = "idle" | "preparing" | "open" | "paused" | "closing" | "done" | "error"

export interface RunnerState {
  phase: RunnerPhase
  /** 0-based index of the current round. */
  round: number
  total: number
  /** Epoch ms when the current round closes; null unless open. */
  endsAt: number | null
  /** Time left when paused. */
  remainingMs: number | null
  prompt?: string
  plan: MatchPlan | null
  failures: AssignmentFailure[]
  /** People who couldn't be seated in their pinned room. */
  seatErrors: string[]
  error?: string
}

/** A host or co-host pinned to a room; they join it from their own app. */
export interface Seat {
  participantUUID: string
  roomName: string
}

export interface RoundRunnerOptions {
  client: ZoomClient
  activity: RoundInfo["activity"]
  rounds: number
  minutes: number
  settings: ConfigureBreakoutRoomsOptions
  /** Builds the next round from the people currently in the meeting. */
  plan: (round: number, history: History) => MatchPlan
  prompt: (round: number) => string | undefined
  /** Pinned people the SDK can't assign (hosts / co-hosts), seated via their own app. */
  seats?: (round: number) => Seat[]
  selfUuid: string
  onChange: (state: RunnerState) => void
  /** Warn this many seconds before a round closes. */
  warningSeconds?: number
  closePollMs?: number
  closeTimeoutMs?: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "object" && err && "message" in err) return String(err.message)
  return String(err)
}

/**
 * Runs timed rounds: plan → open rooms → count down (pausable) → close →
 * wait until Zoom has closed them → record who met → next round.
 */
export class RoundRunner {
  private state: RunnerState
  private history: History = emptyHistory()
  private timers: ReturnType<typeof setTimeout>[] = []
  /** Bumped on end() so in-flight async work from an old run stops. */
  private generation = 0
  private readonly opts: Required<Pick<RoundRunnerOptions, "warningSeconds" | "closePollMs" | "closeTimeoutMs">> &
    RoundRunnerOptions

  constructor(options: RoundRunnerOptions) {
    this.opts = { warningSeconds: 60, closePollMs: 1000, closeTimeoutMs: 120_000, ...options }
    this.state = {
      phase: "idle",
      round: 0,
      total: options.rounds,
      endsAt: null,
      remainingMs: null,
      plan: null,
      failures: [],
      seatErrors: [],
    }
  }

  get current(): RunnerState {
    return this.state
  }

  private set(patch: Partial<RunnerState>) {
    this.state = { ...this.state, ...patch }
    this.opts.onChange(this.state)
  }

  private broadcast(message: Message) {
    void this.opts.client.sendMessage({ payload: encode(message) }).catch(() => {})
  }

  private broadcastRound() {
    this.broadcast({
      type: "round",
      round: {
        activity: this.opts.activity,
        number: this.state.round + 1,
        total: this.state.total,
        prompt: this.state.prompt,
        endsAt: this.state.phase === "open" ? this.state.endsAt : null,
      },
    })
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout)
    this.timers = []
  }

  private schedule(endsAt: number) {
    this.clearTimers()
    const left = endsAt - Date.now()
    const warnAt = left - this.opts.warningSeconds * 1000
    // Only warn if the round is long enough for the warning to mean something.
    if (warnAt > 0 && left > this.opts.warningSeconds * 1500) {
      this.timers.push(
        setTimeout(() => this.broadcast({ type: "warning", secondsLeft: this.opts.warningSeconds }), warnAt),
      )
    }
    this.timers.push(setTimeout(() => void this.closeRound(), Math.max(0, left)))
  }

  async start(): Promise<void> {
    if (this.state.phase !== "idle" && this.state.phase !== "done" && this.state.phase !== "error") return
    this.history = emptyHistory()
    this.set({ round: 0, failures: [], seatErrors: [], error: undefined })
    await this.runRound(0)
  }

  private async runRound(round: number) {
    const generation = this.generation
    const prompt = this.opts.prompt(round)
    this.set({ phase: "preparing", round, prompt, endsAt: null, remainingMs: null })
    try {
      const plan = this.opts.plan(round, this.history)
      this.set({ plan })
      if (plan.rooms.length === 0) throw new Error(plan.warnings[0] ?? "There is nobody to match.")

      const result = await orchestrate(this.opts.client, plan, this.opts.settings)
      if (generation !== this.generation) {
        // Ended while rooms were being set up: don't leave them open.
        await this.opts.client.closeBreakoutRooms().catch(() => {})
        return
      }

      const seatErrors = await this.seatPinned(round, result.roomIds)
      const endsAt = Date.now() + this.opts.minutes * 60_000
      this.set({
        phase: "open",
        endsAt,
        failures: [...this.state.failures, ...result.failures],
        seatErrors,
      })
      this.broadcastRound()
      this.schedule(endsAt)
    } catch (err) {
      if (generation === this.generation) this.set({ phase: "error", error: describe(err) })
    }
  }

  private async seatPinned(round: number, roomIds: Record<string, string>): Promise<string[]> {
    const errors: string[] = []
    for (const seat of this.opts.seats?.(round) ?? []) {
      const roomUuid = roomIds[seat.roomName]
      if (!roomUuid) continue
      if (seat.participantUUID === this.opts.selfUuid) {
        // Our own app is the one running: join directly.
        await this.opts.client
          .changeBreakoutRoom({ action: "join", uuid: roomUuid })
          .catch((err) => errors.push(`You couldn't join ${seat.roomName}: ${describe(err)}`))
      } else {
        this.broadcast({ type: "seat", participantUUID: seat.participantUUID, roomUuid, roomName: seat.roomName })
      }
    }
    return errors
  }

  pause() {
    if (this.state.phase !== "open" || this.state.endsAt === null) return
    this.clearTimers()
    this.set({ phase: "paused", remainingMs: Math.max(0, this.state.endsAt - Date.now()), endsAt: null })
    this.broadcastRound()
  }

  resume() {
    if (this.state.phase !== "paused" || this.state.remainingMs === null) return
    const endsAt = Date.now() + this.state.remainingMs
    this.set({ phase: "open", endsAt, remainingMs: null })
    this.broadcastRound()
    this.schedule(endsAt)
  }

  extend(minutes: number) {
    const ms = minutes * 60_000
    if (this.state.phase === "paused" && this.state.remainingMs !== null) {
      this.set({ remainingMs: this.state.remainingMs + ms })
    } else if (this.state.phase === "open" && this.state.endsAt !== null) {
      const endsAt = this.state.endsAt + ms
      this.set({ endsAt })
      this.broadcastRound()
      this.schedule(endsAt)
    }
  }

  /** Close the current round now and move on. */
  skip() {
    if (this.state.phase === "open" || this.state.phase === "paused") void this.closeRound()
  }

  /** Stop after closing any open rooms. */
  async end() {
    const wasRunning = this.state.phase === "open" || this.state.phase === "paused"
    this.generation++
    this.clearTimers()
    if (wasRunning) {
      this.set({ phase: "closing", endsAt: null })
      await this.opts.client.closeBreakoutRooms().catch(() => {})
    }
    this.set({ phase: "done", endsAt: null, remainingMs: null })
    this.broadcast({ type: "ended" })
  }

  private async closeRound() {
    const generation = this.generation
    this.clearTimers()
    this.set({ phase: "closing", endsAt: null, remainingMs: null })
    try {
      await this.opts.client.closeBreakoutRooms().catch((err) => {
        // Rooms may already have been closed from Zoom's own controls.
        if (!/not open/i.test(describe(err))) throw err
      })
      await this.waitUntilClosed(generation)
      if (generation !== this.generation) return
      if (this.state.plan) recordRound(this.history, this.state.plan)

      const next = this.state.round + 1
      if (next < this.state.total) {
        await this.runRound(next)
      } else {
        this.set({ phase: "done" })
        this.broadcast({ type: "ended" })
      }
    } catch (err) {
      if (generation === this.generation) this.set({ phase: "error", error: describe(err) })
    }
  }

  private async waitUntilClosed(generation: number) {
    const deadline = Date.now() + this.opts.closeTimeoutMs
    while (generation === this.generation) {
      const list = await this.opts.client.getBreakoutRoomList().catch(() => null)
      if (list?.state === "closed") return
      if (Date.now() > deadline) throw new Error("Rooms didn't close in time. Close them in Zoom, then skip ahead.")
      await sleep(this.opts.closePollMs)
    }
  }

  dispose() {
    this.generation++
    this.clearTimers()
  }
}
