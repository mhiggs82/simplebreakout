import { Send, Sprout, X } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import type { HarvestEntry } from "@/hooks/use-harvest"

/** Key insights sent by groups, grouped by room, ready to share with everyone. */
export function HarvestBoard({
  items,
  onRemove,
  onShare,
  title = "Harvest",
  description = "Key insights groups send from their app panel appear here.",
}: {
  items: HarvestEntry[]
  onRemove: (id: number) => void
  onShare: () => Promise<{ shared: number; total: number }>
  title?: string
  description?: string
}) {
  const [shared, setShared] = useState<{ shared: number; total: number } | null>(null)
  const byRoom = new Map<string, HarvestEntry[]>()
  for (const item of items) byRoom.set(item.room, [...(byRoom.get(item.room) ?? []), item])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sprout className="size-5" aria-hidden="true" /> {title} <Badge variant="secondary">{items.length}</Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent aria-live="polite">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="space-y-3">
            {[...byRoom].map(([room, entries]) => (
              <li key={room}>
                <h3 className="text-sm font-medium">{room}</h3>
                <ul className="mt-1 space-y-1">
                  {entries.map((entry) => (
                    <li key={entry.id} className="flex items-start justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                      {entry.text}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove "${entry.text}"`}
                        onClick={() => onRemove(entry.id)}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2">
        <Button
          variant="outline"
          className="w-full"
          disabled={items.length === 0}
          onClick={() => void onShare().then(setShared)}
        >
          <Send /> {shared && shared.total === items.length ? "Shared with everyone" : "Share with everyone"}
        </Button>
        {shared && shared.shared < shared.total && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Zoom limits message size, so attendees see the latest {shared.shared} of {shared.total}. Screen-share this
            board to show them all.
          </p>
        )}
      </CardFooter>
    </Card>
  )
}
