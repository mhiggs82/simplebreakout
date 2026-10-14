import { ChevronDown, RefreshCw } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { HostSession, MeetingPerson } from "@/hooks/use-host-session"
import type { Answers, MatchConfig } from "@/lib/matchmaking/types"

const UNSET = "__unset"

const ROLE_BADGES: Record<string, string> = { host: "Host", coHost: "Co-host" }

function AnswerSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | undefined
  options: { value: string; label: string }[]
  onChange: (value: string | undefined) => void
}) {
  return (
    <Select value={value ?? UNSET} onValueChange={(v) => onChange(v === UNSET ? undefined : v)}>
      <SelectTrigger size="sm" className="w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSET}>No answer</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function summary(answers: Answers | undefined, config: MatchConfig): string {
  if (!answers) return ""
  if (config.mode === "roles") return config.roles.find((r) => r.id === answers.roleId)?.label ?? ""
  return config.categories
    .map((c) => answers.tags[c.id])
    .filter(Boolean)
    .join(" · ")
}

function PersonRow({ person, session }: { person: MeetingPerson; session: HostSession }) {
  const { config } = session
  const [editing, setEditing] = useState(false)
  const included = session.isIncluded(person)
  const answers = session.answers[person.uuid]
  const asks = config.mode !== "random"
  const current: Answers = answers ?? { tags: {} }
  const answerText = summary(answers, config)

  return (
    <li className="space-y-2 py-2">
      <div className="flex items-center gap-3">
        <Checkbox
          id={`include-${person.uuid}`}
          checked={included}
          disabled={person.isSelf}
          onCheckedChange={(v) => session.setIncluded(person.uuid, v === true)}
          aria-label={`Include ${person.name}`}
        />
        <label htmlFor={`include-${person.uuid}`} className="min-w-0 flex-1">
          <span className={included ? "block truncate text-sm" : "block truncate text-sm text-muted-foreground line-through"}>
            {person.name}
          </span>
          {asks && (
            <span className="block truncate text-xs text-muted-foreground">
              {answerText || (included ? "Waiting for answer" : "Not matched")}
              {answers?.source === "host" && " (set by you)"}
            </span>
          )}
        </label>
        {person.isSelf && <Badge variant="outline">You</Badge>}
        {!person.isSelf && ROLE_BADGES[person.zoomRole] && <Badge variant="outline">{ROLE_BADGES[person.zoomRole]}</Badge>}
        {asks && included && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-expanded={editing}
            aria-label={`Set answers for ${person.name}`}
            onClick={() => setEditing((e) => !e)}
          >
            <ChevronDown className={editing ? "rotate-180 transition-transform" : "transition-transform"} />
          </Button>
        )}
      </div>

      {asks && included && editing && (
        <div className="grid gap-2 pl-7">
          {config.mode === "roles" ? (
            <AnswerSelect
              label={`Role for ${person.name}`}
              value={current.roleId}
              options={config.roles.map((r) => ({ value: r.id, label: r.label }))}
              onChange={(roleId) => session.setAnswer(person.uuid, { ...current, roleId })}
            />
          ) : (
            config.categories.map((category) => (
              <AnswerSelect
                key={category.id}
                label={`${category.label} for ${person.name}`}
                value={current.tags[category.id]}
                options={category.options.map((o) => ({ value: o, label: `${category.label}: ${o}` }))}
                onChange={(value) => {
                  const tags = { ...current.tags }
                  if (value) tags[category.id] = value
                  else delete tags[category.id]
                  session.setAnswer(person.uuid, { ...current, tags })
                }}
              />
            ))
          )}
        </div>
      )}
    </li>
  )
}

export function ParticipantsCard({ session }: { session: HostSession }) {
  const { people, config } = session
  const includedCount = people.filter(session.isIncluded).length
  const answeredCount = people.filter((p) => session.isIncluded(p) && summary(session.answers[p.uuid], config)).length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Participants</CardTitle>
        <CardDescription aria-live="polite">
          {includedCount} of {people.length} will be matched
          {config.mode !== "random" && ` · ${answeredCount} answered`}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label="Refresh participants" onClick={() => void session.refreshParticipants()}>
            <RefreshCw />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {session.participantsError ? (
          <p role="alert" className="text-sm text-destructive">{session.participantsError}</p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto pr-1">
            {people.map((person) => (
              <PersonRow key={person.uuid} person={person} session={session} />
            ))}
          </ul>
        )}
        {config.mode !== "random" && (
          <p className="pt-3 text-xs text-muted-foreground">
            People without the app can't answer: set their answers with the arrow, or they'll be placed wherever there's room.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
