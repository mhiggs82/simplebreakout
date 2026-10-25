import { ChevronDown, RefreshCw, Search } from "lucide-react"
import { useDeferredValue, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { HostSession, MeetingPerson } from "@/hooks/use-host-session"
import type { Answers, MatchConfig } from "@/lib/matchmaking/types"

const UNSET = "__unset"

const ROLE_BADGES: Record<string, string> = { host: "Host", coHost: "Co-host" }

/** Long lists only show this many rows; search finds anyone else. */
const MAX_ROWS = 150

type Filter = "everyone" | "noAnswer" | "staying"

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

function PersonRow({ person, session, showAnswers }: { person: MeetingPerson; session: HostSession; showAnswers: boolean }) {
  const { config } = session
  const [editing, setEditing] = useState(false)
  const included = session.isIncluded(person)
  const answers = session.answers[person.uuid]
  const asks = showAnswers && config.mode !== "random"
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
              {answers?.source === "name" && " (from their Zoom name)"}
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

/** `showAnswers` is off for activities that don't use the matchmaking questions. */
export function ParticipantsCard({ session, showAnswers = true }: { session: HostSession; showAnswers?: boolean }) {
  const { people, config } = session
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("everyone")
  const search = useDeferredValue(query.trim().toLowerCase())
  const asks = showAnswers && config.mode !== "random"
  const includedCount = people.filter(session.isIncluded).length
  const answeredCount = people.filter((p) => session.isIncluded(p) && summary(session.answers[p.uuid], config)).length

  const shown = people.filter((person) => {
    if (search && !person.name.toLowerCase().includes(search)) return false
    if (filter === "staying") return !session.isIncluded(person)
    if (filter === "noAnswer") return session.isIncluded(person) && !summary(session.answers[person.uuid], config)
    return true
  })
  // You can't be moved by the app, so you're never part of select all.
  const selectable = shown.filter((p) => !p.isSelf).map((p) => p.uuid)
  const narrowed = search !== "" || filter !== "everyone"

  return (
    <Card>
      <CardHeader>
        <CardTitle>Participants</CardTitle>
        <CardDescription aria-live="polite">
          {includedCount} of {people.length} will be put in rooms
          {asks && ` · ${answeredCount} answered`}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label="Refresh participants" onClick={() => void session.refreshParticipants()}>
            <RefreshCw />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {session.participantsError ? (
          <p role="alert" className="text-sm text-destructive">{session.participantsError}</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Ticked people go to a room. Unticked people stay in the main meeting (e.g. speakers or interpreters).
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                aria-label="Search participants by name"
                placeholder="Search by name"
                className="pl-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                <SelectTrigger size="sm" className="w-auto" aria-label="Show">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyone">Everyone</SelectItem>
                  {asks && <SelectItem value="noAnswer">No answer yet</SelectItem>}
                  <SelectItem value="staying">Staying in main meeting</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                disabled={selectable.length === 0}
                onClick={() => session.setIncludedMany(selectable, true)}
              >
                {narrowed ? `Tick these ${selectable.length}` : "Tick everyone"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={selectable.length === 0}
                onClick={() => session.setIncludedMany(selectable, false)}
              >
                {narrowed ? `Untick these ${selectable.length}` : "Untick everyone"}
              </Button>
            </div>
            {shown.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Nobody matches.</p>
            ) : (
              <ul className="max-h-80 divide-y overflow-y-auto pr-1">
                {shown.slice(0, MAX_ROWS).map((person) => (
                  <PersonRow key={person.uuid} person={person} session={session} showAnswers={showAnswers} />
                ))}
              </ul>
            )}
            {shown.length > MAX_ROWS && (
              <p className="text-xs text-muted-foreground">
                Showing {MAX_ROWS} of {shown.length.toLocaleString()}. Search to find someone.
              </p>
            )}
          </>
        )}
        {asks && (
          <p className="text-xs text-muted-foreground">
            No app? People can add their answers to their Zoom name (e.g. "Sam - Mentor"), or you can set them with the arrow. Anyone without an answer goes wherever there's room.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
