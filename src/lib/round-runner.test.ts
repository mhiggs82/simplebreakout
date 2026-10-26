import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { planSpeedRound } from "@/lib/matchmaking/rounds"
import type { Candidate } from "@/lib/matchmaking/types"
import { decode } from "@/lib/messages"
import { RoundRunner, type RunnerState } from "./round-runner"
import { createMockZoomClient } from "./zoom-client"

const self = { screenName: "Host", participantId: "0", participantUUID: "self", role: "host" }
const people: Candidate[] = Array.from({ length: 6 }, (_, i) => ({ uuid: `u${i}`, name: `P${i}`, tags: {} }))

function setup(overrides: Partial<ConstructorParameters<typeof RoundRunner>[0]> = {}) {
  const client = createMockZoomClient(self, false, { closeDelayMs: 2000 })
  const sent: ReturnType<typeof decode>[] = []
  const original = client.sendMessage.bind(client)
  client.sendMessage = vi.fn(async (options) => {
    sent.push(decode(options.payload))
    return original(options)
  })
  const states: RunnerState[] = []
  const runner = new RoundRunner({
    client,
    activity: "speed",
    rounds: 3,
    minutes: 3,
    settings: { countDown: 2 },
    plan: (_round, history) => planSpeedRound(people, 2, history),
    prompt: (round) => `Prompt ${round + 1}`,
    selfUuid: "self",
    onChange: (state) => states.push(state),
    closePollMs: 500,
    ...overrides,
  })
  return { client, runner, sent, states }
}

// Lets mock SDK calls (which use timers) settle.
const settle = () => vi.advanceTimersByTimeAsync(5_000)

describe("RoundRunner", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("runs every round, warns before closing and ends", async () => {
    const { runner, sent } = setup()
    void runner.start()
    await settle()
    expect(runner.current.phase).toBe("open")
    expect(runner.current.round).toBe(0)
    expect(sent.find((m) => m?.type === "round")).toMatchObject({ round: { number: 1, total: 3, prompt: "Prompt 1" } })

    await vi.advanceTimersByTimeAsync(2 * 60_000 + 1_000) // past the 60 s warning
    expect(sent.some((m) => m?.type === "warning")).toBe(true)

    await vi.advanceTimersByTimeAsync(60_000) // round 1 closes
    await settle()
    expect(runner.current.round).toBe(1)
    expect(runner.current.phase).toBe("open")

    await vi.advanceTimersByTimeAsync(2 * (3 * 60_000 + 10_000))
    expect(runner.current.phase).toBe("done")
    expect(sent.filter((m) => m?.type === "round").map((m) => m?.type === "round" && m.round.number)).toEqual([1, 2, 3])
    expect(sent.at(-1)).toEqual({ type: "ended" })
  })

  it("posts each task to the Zoom chat before rooms open, then welcomes everyone back", async () => {
    const { client, runner } = setup({ chat: true, rounds: 2 })
    const chat: string[] = []
    client.sendMessageToChat = vi.fn(async ({ message }) => {
      chat.push(message)
      return { result: [] }
    })
    void runner.start()
    await settle()
    expect(chat).toEqual(["Round 1 of 2 · 3 min: Prompt 1"])
    await vi.advanceTimersByTimeAsync(2 * (3 * 60_000 + 10_000))
    expect(runner.current.phase).toBe("done")
    expect(chat).toEqual(["Round 1 of 2 · 3 min: Prompt 1", "Round 2 of 2 · 3 min: Prompt 2", "Welcome back to the main room."])
  })

  it("stays out of the chat unless asked", async () => {
    const { client, runner } = setup()
    client.sendMessageToChat = vi.fn(async () => ({ result: [] }))
    void runner.start()
    await settle()
    expect(client.sendMessageToChat).not.toHaveBeenCalled()
  })

  it("pauses, resumes with the time that was left, and extends", async () => {
    const { runner } = setup()
    void runner.start()
    await settle()
    const endsAt = runner.current.endsAt!
    await vi.advanceTimersByTimeAsync(60_000)
    runner.pause()
    expect(runner.current.phase).toBe("paused")
    const remaining = runner.current.remainingMs!
    expect(remaining).toBeGreaterThan(110_000)

    await vi.advanceTimersByTimeAsync(10 * 60_000) // paused: nothing closes
    expect(runner.current.phase).toBe("paused")

    runner.resume()
    expect(runner.current.endsAt! - Date.now()).toBe(remaining)
    runner.extend(2)
    expect(runner.current.endsAt! - Date.now()).toBe(remaining + 120_000)
    expect(runner.current.endsAt).toBeGreaterThan(endsAt)
  })

  it("skips to the next round and stops on end()", async () => {
    const { runner, client } = setup()
    void runner.start()
    await settle()
    runner.skip()
    await settle()
    expect(runner.current.round).toBe(1)
    expect(runner.current.phase).toBe("open")

    await runner.end()
    await settle()
    expect(runner.current.phase).toBe("done")
    expect((await client.getBreakoutRoomList()).state).toBe("closed")
  })

  it("seats pinned hosts: joins directly for itself, messages others", async () => {
    const { runner, client, sent } = setup({
      seats: () => [
        { participantUUID: "self", roomName: "Room 1" },
        { participantUUID: "cohost", roomName: "Room 2" },
      ],
    })
    const join = vi.spyOn(client, "changeBreakoutRoom")
    void runner.start()
    await settle()
    expect(join).toHaveBeenCalledWith({ action: "join", uuid: "room-1" })
    expect(sent).toContainEqual({ type: "seat", participantUUID: "cohost", roomUuid: "room-2", roomName: "Room 2" })
  })

  it("reports an error when there is nobody to match", async () => {
    const { runner } = setup({ plan: () => ({ rooms: [], warnings: ["Nobody here."] }) })
    await runner.start()
    expect(runner.current).toMatchObject({ phase: "error", error: "Nobody here." })
  })

  it("runs main-room steps without rooms and builds on the previous rooms step", async () => {
    const seenPrevious: (string | null)[] = []
    const { runner, client, sent } = setup({
      rounds: 3,
      minutes: (round) => [1, 2, 4][round],
      kind: (round) => (round === 0 ? "main" : "rooms"),
      label: (round) => ["On your own", "Pairs", "Fours"][round],
      harvest: (round) => round === 2,
      plan: (_round, history, previous) => {
        seenPrevious.push(previous ? previous.rooms.map((r) => r.name).join() : null)
        return planSpeedRound(people, 2, history)
      },
    })
    const create = vi.spyOn(client, "createBreakoutRooms")
    void runner.start()
    await settle()
    expect(runner.current).toMatchObject({ phase: "open", kind: "main", label: "On your own", roomIds: {} })
    expect(create).not.toHaveBeenCalled()
    expect(runner.current.endsAt! - Date.now()).toBeLessThanOrEqual(60_000)

    runner.skip()
    await settle()
    expect(runner.current).toMatchObject({ round: 1, kind: "rooms", label: "Pairs" })
    expect(Object.keys(runner.current.roomIds)).toHaveLength(3)

    runner.skip()
    await settle()
    expect(runner.current).toMatchObject({ round: 2, label: "Fours" })
    expect(seenPrevious).toEqual([null, "Room 1,Room 2,Room 3"])
    const lastRound = sent.filter((m) => m?.type === "round").at(-1)
    expect(lastRound).toMatchObject({ round: { kind: "rooms", label: "Fours", harvest: true } })
  })

  it("waits for rooms from an ended run to finish closing before starting again", async () => {
    const { runner, client } = setup()
    void runner.start()
    await settle()
    await runner.end() // rooms now in their closing countdown
    void runner.start()
    await vi.advanceTimersByTimeAsync(500)
    expect(runner.current.phase).toBe("preparing")
    expect(runner.current.label).toBe("Waiting for earlier rooms to close")
    await settle()
    expect(runner.current.phase).toBe("open")
    expect((await client.getBreakoutRoomList()).state).toBe("open")
  })
})
