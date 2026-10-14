import type { ConfigureBreakoutRoomsOptions } from "@zoom/appssdk"

import type { MatchPlan } from "@/lib/matchmaking/types"
import type { ZoomClient } from "@/lib/zoom-client"

export type OrchestrationStep = "checking" | "creating" | "configuring" | "assigning" | "opening" | "done"

export interface OrchestrationProgress {
  step: OrchestrationStep
  assigned: number
  total: number
}

export interface AssignmentFailure {
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "object" && err && "message" in err) return String(err.message)
  return String(err)
}

/**
 * Turns a match plan into live Zoom breakout rooms:
 * create rooms → apply settings → assign each person → open.
 *
 * Assignment is one SDK call per participant, so a single failure (for
 * example someone who just left) is recorded and the rest continue.
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

  let failures: AssignmentFailure[] = []
  let assigned = 0
  const pending: { uuid: string | undefined; room: string; member: (typeof plan.rooms)[number]["members"][number] }[] =
    plan.rooms.flatMap((room, index) => {
      // Fall back to position if the client normalised a room name.
      const uuid = idByName.get(room.name) ?? created.rooms[index]?.breakoutRoomId
      return room.members.map((member) => ({ uuid, room: room.name, member }))
    })
  onProgress({ step: "assigning", assigned, total })

  // Assign everyone, then give failures one more try: brief network blips
  // and people rejoining with a new connection often succeed the second time.
  for (let attempt = 0; attempt < 2 && pending.length > 0; attempt++) {
    if (attempt > 0) await sleep(retryDelayMs)
    failures = []
    for (const item of pending.splice(0)) {
      try {
        if (!item.uuid) throw new Error("Room was not created")
        await client.assignParticipantToBreakoutRoom({ uuid: item.uuid, participantUUID: item.member.uuid })
        assigned++
      } catch (err) {
        pending.push(item)
        failures.push({ name: item.member.name, room: item.room, error: describe(err) })
      }
      onProgress({ step: "assigning", assigned, total })
    }
  }

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
