import type { OnMessageEvent } from "@zoom/appssdk"
import { useCallback, useEffect, useRef, useState } from "react"

import type { MatchPlan } from "@/lib/matchmaking/types"
import { decode, encode, fitLatest, type HarvestItem } from "@/lib/messages"
import type { ZoomClient } from "@/lib/zoom-client"

export interface HarvestEntry extends HarvestItem {
  id: number
  participantUUID: string
}

/**
 * Collects key insights attendees send from their panel and labels each with
 * the room the sender is in right now (from the current plan).
 */
export function useHarvest(client: ZoomClient, plan: MatchPlan | null, collecting: boolean) {
  const [items, setItems] = useState<HarvestEntry[]>([])
  const nextId = useRef(1)
  // Insights can arrive just after rooms close (e.g. sent as the pair step
  // ends), so label them with the most recent plan that had rooms.
  const lastRooms = useRef<MatchPlan | null>(null)
  const latest = useRef({ plan, collecting })
  useEffect(() => {
    latest.current = { plan, collecting }
    if (plan && plan.rooms.length > 0) lastRooms.current = plan
  })

  useEffect(() => {
    const onMessage = (event: OnMessageEvent) => {
      const message = decode(event.payload)
      const uuid = event.participantUUID
      if (message?.type !== "insight" || !uuid || !latest.current.collecting) return
      const plan = latest.current.plan?.rooms.length ? latest.current.plan : lastRooms.current
      const room = plan?.rooms.find((r) => r.members.some((m) => m.uuid === uuid))?.name ?? "Main room"
      setItems((prev) => [
        ...prev,
        { id: nextId.current++, participantUUID: uuid, room, text: message.text.slice(0, 200) },
      ])
    }
    client.addEventListener("onMessage", onMessage)
    return () => client.removeEventListener("onMessage", onMessage)
  }, [client])

  /** Shares as many of the latest items as fit in one Zoom message. */
  const share = useCallback(async (): Promise<{ shared: number; total: number }> => {
    const message = fitLatest(
      items.map(({ room, text }) => ({ room, text })),
      (kept) => ({ type: "harvest", items: kept }),
    )
    await client.sendMessage({ payload: encode(message) })
    return { shared: message.type === "harvest" ? message.items.length : 0, total: items.length }
  }, [client, items])

  /** Gallery walk: send each station's notes to the group standing at it. */
  const sendStations = useCallback(
    async (current: MatchPlan) => {
      for (const room of current.rooms) {
        const notes = items.filter((i) => i.room === room.name).map((i) => i.text)
        const members = room.members.map((m) => m.uuid)
        const message = fitLatest(notes, (kept) => ({ type: "station", room: room.name, members, notes: kept }))
        await client.sendMessage({ payload: encode(message) }).catch(() => {})
      }
    },
    [client, items],
  )

  return {
    items,
    share,
    sendStations,
    remove: useCallback((id: number) => setItems((prev) => prev.filter((i) => i.id !== id)), []),
    clear: useCallback(() => setItems([]), []),
  }
}
