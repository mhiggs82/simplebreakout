import { Plus, Trash2 } from "lucide-react"

import { RoundFields } from "@/components/round-fields"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { CafeSettings } from "@/hooks/use-activity-settings"
import type { MeetingPerson } from "@/hooks/use-host-session"
import type { TableDef } from "@/lib/matchmaking/types"

const NO_HOST = "__none"
const MAX_TABLES = 20

const newId = () => `t${Date.now().toString(36).slice(-5)}`

export function CafeSettingsCard({
  value,
  onChange,
  people,
  disabled,
}: {
  value: CafeSettings
  onChange: (next: CafeSettings) => void
  people: MeetingPerson[]
  disabled: boolean
}) {
  const setTables = (tables: TableDef[]) => onChange({ ...value, tables })
  const update = (id: string, patch: Partial<TableDef>) =>
    setTables(value.tables.map((t) => (t.id === id ? { ...t, ...patch } : t)))

  const pinHost = (tableId: string, uuid: string | null) =>
    // A person hosts one table at a time.
    setTables(
      value.tables.map((t) =>
        t.id === tableId
          ? { ...t, pinned: uuid ? [uuid] : [] }
          : { ...t, pinned: t.pinned.filter((p) => p !== uuid) },
      ),
    )

  const tableOf = (uuid: string) => value.tables.find((t) => t.pinned.includes(uuid))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rotating tables</CardTitle>
        <CardDescription>
          Also called World Café. Give each table a topic and, if you like, pin a table host who stays put
          (e.g. a stronger student or a co-teacher). Everyone else moves to a new table each round.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={disabled} className="space-y-5">
          <ol className="space-y-2" aria-label="Tables">
            {value.tables.map((table, i) => (
              <li key={table.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex gap-2">
                  <Input
                    aria-label={`Table ${i + 1} name`}
                    value={table.name}
                    maxLength={40}
                    placeholder={`Table ${i + 1}`}
                    onChange={(e) => update(table.id, { name: e.target.value })}
                    onBlur={(e) => !e.target.value.trim() && update(table.id, { name: `Table ${i + 1}` })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${table.name}`}
                    disabled={value.tables.length <= 2}
                    onClick={() => setTables(value.tables.filter((t) => t.id !== table.id))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <Select
                  value={table.pinned[0] ?? NO_HOST}
                  onValueChange={(v) => pinHost(table.id, v === NO_HOST ? null : v)}
                >
                  <SelectTrigger size="sm" className="w-full" aria-label={`Table Host for ${table.name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_HOST}>No Table Host</SelectItem>
                    {people.filter((person) => !person.isSelf).map((person) => {
                      const elsewhere = tableOf(person.uuid)
                      return (
                        <SelectItem key={person.uuid} value={person.uuid}>
                          Host: {person.name}
                          {elsewhere && elsewhere.id !== table.id ? ` · now at ${elsewhere.name}` : ""}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ol>
          <Button
            variant="outline"
            size="sm"
            disabled={value.tables.length >= MAX_TABLES}
            onClick={() =>
              setTables([
                ...value.tables,
                { id: newId(), name: `Table ${value.tables.length + 1}`, pinned: [] },
              ])
            }
          >
            <Plus /> Add table
          </Button>

          <RoundFields
            value={value}
            roundsLabel="Rotations"
            onChange={(rounds) => onChange({ ...value, ...rounds })}
          />
          <p className="text-xs text-muted-foreground">
            You stay in the main room and can visit any table from the round controls. Co-hosts pinned to a
            table join it from their own app panel, so they need Global Breakout open.
          </p>
        </fieldset>
      </CardContent>
    </Card>
  )
}
