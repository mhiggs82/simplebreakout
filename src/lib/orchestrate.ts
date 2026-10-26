import type { ConfigureBreakoutRoomsOptions } from "@zoom/appssdk"

import { reconcilePlan } from "@/lib/matchmaking/engine"
import type { Candidate, MatchPlan } from "@/lib/matchmaking/types"
import type { ZoomClient } from "@/lib/zoom-client"

export type OrchestrationStep = "checking" | "creating" | "configuring" | "assigning" | "opening" | "done"

export interface OrchestrationProgress {
  step: OrchestrationStep
  assigned: number
  total: number
  /** Rough seconds left while assigning, once there's enough to estimate from. */
  secondsLeft?: number
}

/** People moved at the same time. Big meetings would take minutes one by one. */
export const ASSIGN_CONCURRENCY = 8

export interface AssignmentFailure {
  uuid: string
  name: string
  room: string
  error: string
}

export interface OrchestrationResult {
  assigned: number
  failures: AssignmentFailure[]
  /** Room name → Zoom breakout room id, for people who join a room themselves. */
  roomIds: Record<string, string>
}

export class OrchestrationError extends Error {}

/** "Moving people: 340 of 1,000 · about 1 min left" */
export function movingText(progress: OrchestrationProgress): string {
  const { assigned, total, secondsLeft } = progress
  const left =
    secondsLeft === undefined || secondsLeft < 5
      ? ""
      : secondsLeft < 90
        ? ` · about ${Math.max(5, Math.round(secondsLeft / 5) * 5)} seconds left`
        : ` · about ${Math.round(secondsLeft / 60)} min left`
  return `Moving people: ${assigned.toLocaleString()} of ${total.toLocaleString()}${left}`
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "object" && err && "message" in err) return String(err.message)
  return String(err)
}

type Pending = { uuid: string | undefined; room: string; member: Candidate }

/**
 * Move each person into their room, a few at a time, then give failures one
 * more try: brief network blips and people rejoining with a new connection
 * often succeed the second time.
 */
async function assignEach(
  client: ZoomClient,
  pending: Pending[],
  onProgress: (assigned: number, secondsLeft: number | undefined) => void,
  retryDelayMs: number,
): Promise<{ assigned: number; failures: AssignmentFailure[] }> {
  const total = pending.length
  const started = Date.now()
  let failures: AssignmentFailure[] = []
  let assigned = 0
  let done = 0
  const secondsLeft = () =>
    done < ASSIGN_CONCURRENCY ? undefined : Math.ceil((((Date.now() - started) / done) * (total - done)) / 1000)
  for (let attempt = 0; attempt < 2 && pending.length > 0; attempt++) {
    if (attempt > 0) await sleep(retryDelayMs)
    failures = []
    const queue = pending.splice(0)
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        try {
          if (!item.uuid) throw new Error("Room was not created")
          await client.assignParticipantToBreakoutRoom({ uuid: item.uuid, participantUUID: item.member.uuid })
          assigned++
        } catch (err) {
          pending.push(item)
          failures.push({ uuid: item.member.uuid, name: item.member.name, room: item.room, error: describe(err) })
        }
        if (attempt === 0) done++
        onProgress(assigned, secondsLeft())
      }
    }
    await Promise.all(Array.from({ length: Math.min(ASSIGN_CONCURRENCY, queue.length) }, worker))
  }
  return { assigned, failures }
}

/**
 * Rooms are already open: put people who aren't in a room yet (late
 * arrivals, or people who couldn't be moved) into the smallest rooms.
 * Returns the updated plan so the host's room list stays right.
 */
/** The plan minus people who couldn't be moved: who is really in each room. */
export function withoutFailures(plan: MatchPlan, failures: AssignmentFailure[]): MatchPlan {
  const failed = new Set(failures.map((f) => f.uuid))
  return { ...plan, rooms: plan.rooms.map((r) => ({ ...r, members: r.members.filter((m) => !failed.has(m.uuid)) })) }
}

export async function placeLateArrivals(
  client: ZoomClient,
  plan: MatchPlan,
  roomIds: Record<string, string>,
  people: Candidate[],
  retryDelayMs = 600,
): Promise<{ plan: MatchPlan; placed: number; failures: AssignmentFailure[] }> {
  const before = new Set(plan.rooms.flatMap((r) => r.members.map((m) => m.uuid)))
  const next = reconcilePlan(plan, people).plan
  const pending: Pending[] = next.rooms.flatMap((room) =>
    room.members
      .filter((m) => !before.has(m.uuid))
      .map((member) => ({ uuid: roomIds[room.name], room: room.name, member })),
  )
  const { assigned, failures } = await assignEach(client, pending, () => {}, retryDelayMs)
  return { plan: next, placed: assigned, failures }
}

/**
 * Turns a match plan into live Zoom breakout rooms:
 * create rooms → apply settings → assign each person → open.
 *
 * Assignment is one SDK call per participant, a few at a time, so a single
 * failure (for example someone who just left) is recorded and the rest continue.
 */
export async function orchestrate(
  client: ZoomClient,
  plan: MatchPlan,
  settings: ConfigureBreakoutRoomsOptions,
  onProgress: (progress: OrchestrationProgress) => void = () => {},
  retryDelayMs = 600,
): Promise<OrchestrationResult> {
  const total = plan.rooms.reduce((sum, room) => sum + room.members.length, 0)
  if (plan.rooms.length === 0) throw new OrchestrationError("There are no rooms to create.")

  onProgress({ step: "checking", assigned: 0, total })
  const current = await client.getBreakoutRoomList().catch(() => null)
  if (current?.state === "open") {
    throw new OrchestrationError("Breakout rooms are already open. Close them before matching again.")
  }

  onProgress({ step: "creating", assigned: 0, total })
  const created = await client.createBreakoutRooms({
    numberOfRooms: plan.rooms.length,
    assign: "manually",
    names: plan.rooms.map((room) => room.name),
  })
  const idByName = new Map(created.rooms.map((room) => [room.name, room.breakoutRoomId]))

  onProgress({ step: "configuring", assigned: 0, total })
  await client.configureBreakoutRooms(settings)

  const pending: Pending[] = plan.rooms.flatMap((room, index) => {
    // Fall back to position if the client normalised a room name.
    const uuid = idByName.get(room.name) ?? created.rooms[index]?.breakoutRoomId
    return room.members.map((member) => ({ uuid, room: room.name, member }))
  })
  onProgress({ step: "assigning", assigned: 0, total })

  const { assigned, failures } = await assignEach(
    client,
    pending,
    (assigned, secondsLeft) => onProgress({ step: "assigning", assigned, total, secondsLeft }),
    retryDelayMs,
  )

  onProgress({ step: "opening", assigned, total })
  await client.openBreakoutRooms()
  onProgress({ step: "done", assigned, total })

  const roomIds = Object.fromEntries(
    plan.rooms.flatMap((room, index) => {
      const uuid = idByName.get(room.name) ?? created.rooms[index]?.breakoutRoomId
      return uuid ? [[room.name, uuid]] : []
    }),
  )
  return { assigned, failures, roomIds }
}
