import type { OnMessageEvent } from "@zoom/appssdk"
import { useCallback, useEffect, useState } from "react"

import { decode, encode } from "@/lib/messages"
import type { ZoomClient } from "@/lib/zoom-client"

/** Zoom's spotlight limit. */
export const MAX_STAGE = 9

function describe(err: unknown): string {
  if (typeof err === "object" && err && "message" in err) return String(err.message)
  return String(err)
}

/**
 * Host side of a Fishbowl on the main stage: the inner circle is spotlighted
 * so everyone watches them; attendees raise a hand from their app to ask for
 * a seat, and the host swaps people in and out.
 */
export function useFishbowl(client: ZoomClient) {
  const [stage, setStage] = useState<string[]>([])
  const [queue, setQueue] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    const onMessage = (event: OnMessageEvent) => {
      const message = decode(event.payload)
      const uuid = event.participantUUID
      if (!uuid) return
      if (message?.type === "raise") setQueue((q) => (q.includes(uuid) ? q : [...q, uuid]))
      if (message?.type === "lower") setQueue((q) => q.filter((u) => u !== uuid))
    }
    client.addEventListener("onMessage", onMessage)
    return () => client.removeEventListener("onMessage", onMessage)
  }, [client])

  const apply = useCallback(
    async (next: string[]) => {
      setBusy(true)
      const failures: string[] = []
      try {
        const leaving = stage.filter((uuid) => !next.includes(uuid))
        if (leaving.length > 0) {
          await client.removeParticipantSpotlights({ participantUUIDs: leaving }).catch((err) => failures.push(describe(err)))
        }
        const placed: string[] = stage.filter((uuid) => next.includes(uuid))
        for (const uuid of [...new Set(next)].filter((u) => !stage.includes(u)).slice(0, MAX_STAGE)) {
          try {
            await client.addParticipantSpotlight({ participantUUID: uuid })
            placed.push(uuid)
          } catch (err) {
            failures.push(describe(err))
          }
        }
        const ordered = [...new Set(next)].filter((uuid) => placed.includes(uuid))
        setStage(ordered)
        // Whoever made it on stage no longer needs their hand up.
        setQueue((q) => q.filter((uuid) => !ordered.includes(uuid)))
        await client.sendMessage({ payload: encode({ type: "fishbowl", inner: ordered }) }).catch(() => {})
      } finally {
        setErrors(failures)
        setBusy(false)
      }
    },
    [client, stage],
  )

  return {
    stage,
    // Someone who raised a hand and was then put on stage isn't waiting any more.
    queue: queue.filter((uuid) => !stage.includes(uuid)),
    busy,
    errors,
    putOnStage: apply,
    swap: useCallback(
      (out: string, into: string) => apply(stage.map((uuid) => (uuid === out ? into : uuid))),
      [apply, stage],
    ),
    /** Clear the stage and tell attendees the Fishbowl is over. */
    clear: useCallback(async () => {
      await apply([])
      setQueue([])
      await client.sendMessage({ payload: encode({ type: "ended" }) }).catch(() => {})
    }, [apply, client]),
    dismiss: useCallback((uuid: string) => setQueue((q) => q.filter((u) => u !== uuid)), []),
  }
}
