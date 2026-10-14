import type { OnMessageEvent } from "@zoom/appssdk"
import { useEffect, useState } from "react"

import { decode } from "@/lib/messages"
import type { ZoomClient } from "@/lib/zoom-client"

export interface SeatStatus {
  roomName: string
  error?: string
}

/**
 * Pinned hosts and co-hosts can't be moved by the SDK, so the orchestrating
 * host sends a `seat` message and this person's own app joins the room.
 */
export function useSeatListener(client: ZoomClient, selfUuid: string) {
  const [seat, setSeat] = useState<SeatStatus | null>(null)

  useEffect(() => {
    const onMessage = (event: OnMessageEvent) => {
      const message = decode(event.payload)
      // Ignore our own broadcasts in case the client echoes them back.
      if (message?.type !== "seat" || message.participantUUID !== selfUuid) return
      if (event.participantUUID === selfUuid) return
      setSeat({ roomName: message.roomName })
      client
        .changeBreakoutRoom({ action: "join", uuid: message.roomUuid })
        .catch((err: { message?: string }) =>
          setSeat({ roomName: message.roomName, error: err?.message ?? "Couldn't join the room." }),
        )
    }
    client.addEventListener("onMessage", onMessage)
    return () => client.removeEventListener("onMessage", onMessage)
  }, [client, selfUuid])

  return seat
}
