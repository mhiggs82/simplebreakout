import type { ConfigureBreakoutRoomsOptions } from "@zoom/appssdk"
import { useCallback, useEffect, useRef, useState } from "react"

import { uniqueNames } from "@/lib/matchmaking/engine"
import { encode, fitChunks, type OpenTable } from "@/lib/messages"
import type { ZoomClient } from "@/lib/zoom-client"

export interface OpenSpaceTable {
  id: string
  name: string
  /** 0 = no limit. */
  limit: number
  /** Optional table host (stays at the table). */
  pinned: string[]
}

type Phase = "idle" | "opening" | "open" | "closing" | "error"

const POLL_MS = 3000

function describe(err: unknown): string {
  if (typeof err === "object" && err && "message" in err) return String(err.message)
  return String(err)
}

/**
 * Open Space: create named tables, open them with Zoom's self-select on, and
 * keep attendees' panels updated with live head-counts so they can pick a
 * table. Seat limits are soft: the app disables full tables, but Zoom's own
 * breakout menu still works.
 */
export function useOpenSpace(client: ZoomClient, isSelfSeated: (uuid: string) => boolean) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [tables, setTables] = useState<OpenTable[]>([])
  /** Host only: who's at each table (room name → display names). Not broadcast. */
  const [members, setMembers] = useState<Record<string, string[]>>({})
  const [error, setError] = useState<string | null>(null)
  const session = useRef("")
  const lastSent = useRef("")

  const broadcast = useCallback(
    async (next: OpenTable[]) => {
      const key = JSON.stringify(next)
      if (key === lastSent.current) return
      lastSent.current = key
      const messages = fitChunks(next, (chunk) => ({
        type: "tables",
        sessionId: session.current,
        total: next.length,
        tables: chunk,
      }))
      for (const message of messages) await client.sendMessage({ payload: encode(message) }).catch(() => {})
    },
    [client],
  )

  const refresh = useCallback(
    async (limits: Map<string, number>) => {
      const list = await client.getBreakoutRoomList().catch(() => null)
      if (!list) return
      if (list.state === "closed") {
        setPhase("idle")
        return
      }
      const next = list.rooms.map((room) => ({
        uuid: room.breakoutRoomId,
        name: room.name,
        count: room.participants?.length ?? 0,
        limit: limits.get(room.name) ?? 0,
      }))
      setTables(next)
      setMembers(Object.fromEntries(list.rooms.map((r) => [r.name, (r.participants ?? []).map((p) => p.displayName)])))
      await broadcast(next)
    },
    [client, broadcast],
  )

  const limits = useRef(new Map<string, number>())
  useEffect(() => {
    if (phase !== "open") return
    const id = setInterval(() => void refresh(limits.current), POLL_MS)
    return () => clearInterval(id)
  }, [phase, refresh])

  const open = useCallback(
    async (config: OpenSpaceTable[], settings: ConfigureBreakoutRoomsOptions) => {
      setPhase("opening")
      setError(null)
      try {
        const current = await client.getBreakoutRoomList().catch(() => null)
        if (current?.state === "open") throw new Error("Breakout rooms are already open. Close them first.")
        const names = uniqueNames(config.map((t) => ({ name: t.name, members: [] }))).map((r) => r.name)
        const created = await client.createBreakoutRooms({ numberOfRooms: names.length, assign: "manually", names })
        await client.configureBreakoutRooms({ ...settings, allowParticipantsChooseRoom: true })
        const idByName = new Map(created.rooms.map((r) => [r.name, r.breakoutRoomId]))
        limits.current = new Map(config.map((t, i) => [names[i], t.limit]))

        // Table hosts: attendees are assigned; hosts / co-hosts join from their own app.
        session.current = Math.random().toString(36).slice(2, 8)
        const seats: { participantUUID: string; roomUuid: string; roomName: string }[] = []
        for (const [i, table] of config.entries()) {
          const roomUuid = idByName.get(names[i]) ?? created.rooms[i]?.breakoutRoomId
          if (!roomUuid) continue
          for (const uuid of table.pinned) {
            if (isSelfSeated(uuid)) seats.push({ participantUUID: uuid, roomUuid, roomName: names[i] })
            else await client.assignParticipantToBreakoutRoom({ uuid: roomUuid, participantUUID: uuid }).catch(() => {})
          }
        }
        await client.openBreakoutRooms()
        for (const seat of seats) await client.sendMessage({ payload: encode({ type: "seat", ...seat }) }).catch(() => {})
        lastSent.current = ""
        setPhase("open")
        await refresh(limits.current)
      } catch (err) {
        setError(describe(err))
        setPhase("error")
      }
    },
    [client, isSelfSeated, refresh],
  )

  const close = useCallback(async () => {
    setPhase("closing")
    await client.closeBreakoutRooms().catch(() => {})
    await client.sendMessage({ payload: encode({ type: "ended" }) }).catch(() => {})
    setTables([])
    setPhase("idle")
  }, [client])

  return {
    phase,
    tables,
    members,
    error,
    open,
    close,
    roomIds: Object.fromEntries(tables.map((t) => [t.name, t.uuid])),
  }
}
