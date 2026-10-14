import { DoorOpen, Home, Loader2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { ZoomClient } from "@/lib/zoom-client"

/** Lets the host drop into any open room and come back to the main room. */
export function RoomVisitor({ client, roomIds }: { client: ZoomClient; roomIds: Record<string, string> }) {
  const [here, setHere] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rooms = Object.entries(roomIds)
  if (rooms.length === 0) return null

  const go = async (target: string | null) => {
    setBusy(target ?? "main")
    setError(null)
    try {
      if (target === null) await client.changeBreakoutRoom({ action: "leave" })
      else await client.changeBreakoutRoom({ action: "join", uuid: roomIds[target] })
      setHere(target)
    } catch (err) {
      setError((err as { message?: string })?.message ?? "Couldn't move rooms.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        {here ? `You're visiting ${here}` : "You're in the main room"} · Visit a room
      </summary>
      <ul className="mt-2 space-y-1">
        {rooms.map(([name]) => (
          <li key={name} className="flex items-center justify-between gap-2">
            <span className="truncate">{name}</span>
            <Button
              size="sm"
              variant={here === name ? "secondary" : "outline"}
              disabled={busy !== null || here === name}
              onClick={() => void go(name)}
            >
              {busy === name ? <Loader2 className="animate-spin" /> : <DoorOpen />} {here === name ? "Here" : "Visit"}
            </Button>
          </li>
        ))}
      </ul>
      {here && (
        <Button className="mt-2 w-full" size="sm" disabled={busy !== null} onClick={() => void go(null)}>
          {busy === "main" ? <Loader2 className="animate-spin" /> : <Home />} Back to main room
        </Button>
      )}
      {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
    </details>
  )
}
