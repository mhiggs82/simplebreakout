import { AlertTriangle } from "lucide-react"

import type { MatchConfig, MatchPlan } from "@/lib/matchmaking/types"

function memberDetail(member: MatchPlan["rooms"][number]["members"][number], config: MatchConfig) {
  if (config.mode === "roles") return config.roles.find((r) => r.id === member.roleId)?.label
  if (config.mode === "attributes") {
    return config.matchOn.map((id) => member.tags[id]).filter(Boolean).join(" · ") || undefined
  }
  return undefined
}

export function RoomPlan({
  plan,
  config,
  seats = [],
}: {
  plan: MatchPlan
  config: MatchConfig
  /** Hosts / co-hosts joining a room from their own app (not part of the plan). */
  seats?: { roomName: string; name?: string }[]
}) {
  return (
    <div className="space-y-3">
      {plan.warnings.length > 0 && (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {plan.warnings.map((warning) => (
            <li key={warning} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {warning}
            </li>
          ))}
        </ul>
      )}
      <ol className="grid gap-2" aria-label="Planned rooms">
        {plan.rooms.map((room) => (
          <li key={room.name} className="rounded-lg border p-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="truncate text-sm font-medium">{room.name}</h3>
              <span className="shrink-0 text-xs text-muted-foreground">
                {room.members.length + seats.filter((s) => s.roomName === room.name).length} people
              </span>
            </div>
            <ul className="mt-1 text-sm text-muted-foreground">
              {seats
                .filter((s) => s.roomName === room.name)
                .map((s) => (
                  <li key={`seat-${s.name}`} className="truncate font-medium text-foreground">
                    {s.name ?? "Table host"} <span className="text-xs font-normal text-muted-foreground">· table host, joins from their app</span>
                  </li>
                ))}
              {room.members.map((member) => {
                const detail = memberDetail(member, config)
                return (
                  <li key={member.uuid} className="truncate">
                    {member.name}
                    {detail && <span className="text-xs"> · {detail}</span>}
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  )
}
