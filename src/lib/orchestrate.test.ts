import { describe, expect, it, vi } from "vitest"

import type { MatchPlan } from "@/lib/matchmaking/types"
import { orchestrate, OrchestrationError } from "./orchestrate"
import { createMockZoomClient } from "./zoom-client"

const self = { screenName: "Host", participantId: "0", participantUUID: "self", role: "host" }

const plan: MatchPlan = {
  warnings: [],
  rooms: [
    { name: "Room 1", members: [{ uuid: "a", name: "A", tags: {} }, { uuid: "b", name: "B", tags: {} }] },
    { name: "Room 2", members: [{ uuid: "c", name: "C", tags: {} }, { uuid: "d", name: "D", tags: {} }] },
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

    expect(result).toEqual({ assigned: 4, failures: [] })
    expect(calls).toEqual([
      "createBreakoutRooms",
      "configureBreakoutRooms",
      ...Array(4).fill("assignParticipantToBreakoutRoom"),
      "openBreakoutRooms",
    ])
    expect(client.assignParticipantToBreakoutRoom).toHaveBeenCalledWith({ uuid: "room-2", participantUUID: "c" })
    expect(client.createBreakoutRooms).toHaveBeenCalledWith({ numberOfRooms: 2, assign: "manually", names: ["Room 1", "Room 2"] })
  })

  it("keeps going when one assignment fails", async () => {
    const client = createMockZoomClient(self, false)
    client.assignParticipantToBreakoutRoom = vi.fn(async ({ participantUUID }) => {
      if (participantUUID === "b") throw { code: "10094", message: "The id of the user is incorrect." }
      return { message: "Success" as const }
    })

    const result = await orchestrate(client, plan, {})

    expect(result.assigned).toBe(3)
    expect(result.failures).toEqual([{ name: "B", room: "Room 1", error: "The id of the user is incorrect." }])
  })

  it("refuses to run while rooms are open", async () => {
    const client = createMockZoomClient(self, false)
    await client.openBreakoutRooms()
    await expect(orchestrate(client, plan, {})).rejects.toBeInstanceOf(OrchestrationError)
  })
})
