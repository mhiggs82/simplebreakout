import { DoorClosed, Loader2, Plus, Trash2, Users } from "lucide-react"

import { NumberField } from "@/components/round-fields"
import { RoomVisitor } from "@/components/room-visitor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { OpenSpaceSettings } from "@/hooks/use-activity-settings"
import type { MeetingPerson } from "@/hooks/use-host-session"
import type { useOpenSpace } from "@/hooks/use-open-space"
import type { ZoomClient } from "@/lib/zoom-client"

const NO_HOST = "__none"
const newId = () => `o${Date.now().toString(36).slice(-5)}`

export function OpenSpaceCard({
  value,
  onChange,
  people,
  space,
  client,
  onOpen,
}: {
  value: OpenSpaceSettings
  onChange: (next: OpenSpaceSettings) => void
  people: MeetingPerson[]
  space: ReturnType<typeof useOpenSpace>
  client: ZoomClient
  onOpen: () => void
}) {
  const live = space.phase === "open" || space.phase === "closing"
  const update = (id: string, patch: Partial<OpenSpaceSettings["tables"][number]>) =>
    onChange({ ...value, tables: value.tables.map((t) => (t.id === id ? { ...t, ...patch } : t)) })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pick a room</CardTitle>
        <CardDescription>
          Give each room a topic. People choose where to go and can move whenever they like. Room limits are a
          guide: full rooms are greyed out in the app, but people can still join from Zoom's own Breakout Rooms
          button.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {live ? (
          <ul className="space-y-2" aria-label="Tables" aria-live="polite">
            {space.tables.map((table) => (
              <li key={table.uuid} className="rounded-lg border p-3 text-sm">
                <details>
                  <summary className="flex cursor-pointer items-center justify-between gap-2">
                    <span className="truncate font-medium">{table.name}</span>
                    <Badge
                      variant={
                        table.limit && table.count > table.limit
                          ? "destructive"
                          : table.limit && table.count === table.limit
                            ? "default"
                            : "secondary"
                      }
                    >
                      <Users aria-hidden="true" /> {table.count}
                      {table.limit ? ` / ${table.limit}` : ""}
                      {table.limit > 0 && table.count > table.limit && " · over"}
                      {table.limit > 0 && table.count === table.limit && " · full"}
                    </Badge>
                  </summary>
                  <p className="mt-2 text-muted-foreground">
                    {(space.members[table.name] ?? []).join(", ") || "Nobody here yet."}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <fieldset disabled={space.phase === "opening"} className="space-y-3">
            <ol className="space-y-2" aria-label="Tables">
              {value.tables.map((table, i) => (
                <li key={table.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex gap-2">
                    <Input
                      aria-label={`Table ${i + 1} name`}
                      value={table.name}
                      maxLength={40}
                      onChange={(e) => update(table.id, { name: e.target.value })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${table.name}`}
                      disabled={value.tables.length <= 1}
                      onClick={() => onChange({ ...value, tables: value.tables.filter((t) => t.id !== table.id) })}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      aria-label={`Seat limit for ${table.name} (0 for none)`}
                      type="number"
                      min={0}
                      max={50}
                      className="w-24"
                      value={table.limit}
                      onChange={(e) => update(table.id, { limit: Math.min(50, Math.max(0, Number(e.target.value) || 0)) })}
                    />
                    <Select
                      value={table.pinned[0] ?? NO_HOST}
                      onValueChange={(v) => update(table.id, { pinned: v === NO_HOST ? [] : [v] })}
                    >
                      <SelectTrigger className="min-w-0 flex-1" aria-label={`Table host for ${table.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_HOST}>No table host</SelectItem>
                        {people.filter((p) => !p.isSelf).map((p) => (
                          <SelectItem key={p.uuid} value={p.uuid}>
                            Host: {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">Seat limit 0 means unlimited.</p>
            <Button
              variant="outline"
              size="sm"
              disabled={value.tables.length >= 20}
              onClick={() =>
                onChange({ ...value, tables: [...value.tables, { id: newId(), name: `Table ${value.tables.length + 1}`, limit: 0, pinned: [] }] })
              }
            >
              <Plus /> Add table
            </Button>
            <NumberField
              label="Close after (minutes)"
              hint="0 keeps the space open until you close it."
              value={value.minutes}
              min={0}
              max={240}
              onChange={(minutes) => onChange({ ...value, minutes })}
            />
          </fieldset>
        )}
        {live && <RoomVisitor client={client} roomIds={space.roomIds} />}
        {space.error && <p role="alert" className="text-sm text-destructive">{space.error}</p>}
      </CardContent>
      <CardFooter>
        {live ? (
          <Button variant="destructive" className="w-full" disabled={space.phase === "closing"} onClick={() => void space.close()}>
            {space.phase === "closing" ? <Loader2 className="animate-spin" /> : <DoorClosed />} Close the space
          </Button>
        ) : (
          <Button size="lg" className="h-12 w-full text-base" disabled={space.phase === "opening"} onClick={onOpen}>
            {space.phase === "opening" && <Loader2 className="animate-spin" />} Open the space
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
