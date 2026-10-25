import { describe, expect, it, vi } from "vitest"

import type { MatchPlan } from "@/lib/matchmaking/types"
import { ASSIGN_CONCURRENCY, orchestrate, OrchestrationError, placeLateArrivals } from "./orchestrate"
import { createMockZoomClient } from "./zoom-client"

const self = { screenName: "Host", participantId: "0", participantUUID: "self", role: "host" }

const plan: MatchPlan = {
  warnings: [],
  rooms: [
    { name: "Room 1", members: [{ uuid: "mock-1", name: "A", tags: {} }, { uuid: "mock-2", name: "B", tags: {} }] },
    { name: "Room 2", members: [{ uuid: "mock-3", name: "C", tags: {} }, { uuid: "mock-4", name: "D", tags: {} }] },
  ],
}

describe("orchestrate", () => {
  it("creates, configures, assigns everyone and opens the rooms in order", async () => {
    const client = createMockZoomClient(self, false)
    const calls: string[] = []
    for (const method of ["createBreakoutRooms", "configureBreakoutRooms", "assignParticipantToBreakoutRoom", "openBreakoutRooms"] as const) {
      const original = client[method].bind(client) as (...args: unknown[]) => Promise<unknown>
      ;(client as Record<string, unknown>)[method] = vi.fn((...args: unknown[]) => {
        calls.push(method)
        return original(...args)
      })
    }

    const result = await orchestrate(client, plan, { automaticallyMoveParticipantsIntoRooms: true })

    expect(result).toEqual({ assigned: 4, failures: [], roomIds: { "Room 1": "room-1", "Room 2": "room-2" } })
    expect(calls).toEqual([
      "createBreakoutRooms",
      "configureBreakoutRooms",
      ...Array(4).fill("assignParticipantToBreakoutRoom"),
      "openBreakoutRooms",
    ])
    expect(client.assignParticipantToBreakoutRoom).toHaveBeenCalledWith({ uuid: "room-2", participantUUID: "mock-3" })
    expect(client.createBreakoutRooms).toHaveBeenCalledWith({ numberOfRooms: 2, assign: "manually", names: ["Room 1", "Room 2"] })
  })

  it("moves a big meeting a few people at a time, with a time estimate", async () => {
    const client = createMockZoomClient(self, false, { people: 200 })
    let inFlight = 0
    let most = 0
    const original = client.assignParticipantToBreakoutRoom.bind(client)
    client.assignParticipantToBreakoutRoom = vi.fn(async (options) => {
      most = Math.max(most, ++inFlight)
      try {
        return await original(options)
      } finally {
        inFlight--
      }
    })
    const members = Array.from({ length: 200 }, (_, i) => ({ uuid: `mock-${i + 1}`, name: `P${i}`, tags: {} }))
    const big: MatchPlan = {
      warnings: [],
      rooms: Array.from({ length: 50 }, (_, r) => ({ name: `Room ${r + 1}`, members: members.slice(r * 4, r * 4 + 4) })),
    }
    const estimates: (number | undefined)[] = []
    const started = Date.now()
    const result = await orchestrate(client, big, {}, (p) => estimates.push(p.secondsLeft))
    expect(result.assigned).toBe(200)
    expect(most).toBe(ASSIGN_CONCURRENCY)
    expect(Date.now() - started).toBeLessThan(3_000) // 200 × 40 ms one by one would be 8 s
    expect(estimates.some((s) => typeof s === "number")).toBe(true)
  })

  it("keeps going when one assignment fails, after one retry", async () => {
    const client = createMockZoomClient(self, false)
    client.assignParticipantToBreakoutRoom = vi.fn(async ({ participantUUID }) => {
      if (participantUUID === "mock-2") throw { code: "10094", message: "The id of the user is incorrect." }
      return { message: "Success" as const }
    })

    const result = await orchestrate(client, plan, {}, () => {}, 0)
    expect(client.assignParticipantToBreakoutRoom).toHaveBeenCalledTimes(5) // 4 + 1 retry

    expect(result.assigned).toBe(3)
    expect(result.failures).toEqual([{ uuid: "mock-2", name: "B", room: "Room 1", error: "The id of the user is incorrect." }])
  })

  it("succeeds when a failed assignment works on the retry", async () => {
    const client = createMockZoomClient(self, false)
    let blips = 1
    const original = client.assignParticipantToBreakoutRoom.bind(client)
    client.assignParticipantToBreakoutRoom = vi.fn(async (options) => {
      if (options.participantUUID === "mock-3" && blips-- > 0) throw { message: "Network blip" }
      return original(options)
    })
    const result = await orchestrate(client, plan, {}, () => {}, 0)
    expect(result).toMatchObject({ assigned: 4, failures: [] })
  })

  it("refuses to run while rooms are open", async () => {
    const client = createMockZoomClient(self, false)
    await client.openBreakoutRooms()
    await expect(orchestrate(client, plan, {})).rejects.toBeInstanceOf(OrchestrationError)
  })

  it("puts late arrivals and people who weren't moved into the smallest open rooms", async () => {
    const client = createMockZoomClient(self, false, { people: 6 })
    const roomIds = { "Room 1": "room-1", "Room 2": "room-2" }
    const opened: MatchPlan = { warnings: [], rooms: [{ ...plan.rooms[0] }, { ...plan.rooms[1], members: [plan.rooms[1].members[0]] }] }
    const people = [...plan.rooms.flatMap((r) => r.members), { uuid: "mock-5", name: "E", tags: {} }]
    const result = await placeLateArrivals(client, opened, roomIds, people, 0)
    expect(result.placed).toBe(2) // D (never moved) and E (late)
    expect(result.plan.rooms.map((r) => r.members.length)).toEqual([3, 2])
  })
})
