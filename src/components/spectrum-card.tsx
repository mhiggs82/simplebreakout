import { ArrowLeftRight, Send, Users, X } from "lucide-react"
import { useId, useState } from "react"

import { ResultsView } from "@/components/results-view"
import { NumberField } from "@/components/round-fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { SpectrumSettings } from "@/hooks/use-activity-settings"
import type { MeetingPerson } from "@/hooks/use-host-session"
import type { usePulse } from "@/hooks/use-pulse"

export type SpectrumGrouping = "opposites" | "similar"

export function SpectrumCard({
  pulse,
  people,
  value,
  onChange,
  onGroup,
  running,
}: {
  pulse: ReturnType<typeof usePulse>
  people: MeetingPerson[]
  value: SpectrumSettings
  onChange: (next: SpectrumSettings) => void
  onGroup: (grouping: SpectrumGrouping) => void
  running: boolean
}) {
  const ids = { q: useId(), l: useId(), r: useId(), p: useId() }
  const [statement, setStatement] = useState("Remote work makes collaboration easier")
  const [left, setLeft] = useState("Strongly disagree")
  const [right, setRight] = useState("Strongly agree")
  const live = pulse.question?.kind === "spectrum" ? pulse.question : null
  const nameOf = (uuid: string) => people.find((p) => p.uuid === uuid)?.name ?? "Someone who left"

  // Host-only view: who stands where.
  const byValue = new Map<number, string[]>()
  for (const [uuid, vote] of pulse.votes) {
    if ("value" in vote) byValue.set(vote.value, [...(byValue.get(vote.value) ?? []), nameOf(uuid)])
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spectrum line</CardTitle>
        <CardDescription>
          Everyone places themselves on a 1–10 line for a statement. Then talk across the divide (pair opposites)
          or with like minds (group similar).
        </CardDescription>
      </CardHeader>
      {live && pulse.results ? (
        <>
          <CardContent className="space-y-4" aria-live="polite">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{live.question}</p>
              <Badge variant="secondary">
                {pulse.votes.size}/{people.length - 1} placed
              </Badge>
            </div>
            <ResultsView results={pulse.results} />
            <details className="text-sm">
              <summary className="cursor-pointer">Who's where (only you see names)</summary>
              <ul className="mt-2 space-y-1">
                {[...byValue].sort(([a], [b]) => a - b).map(([position, names]) => (
                  <li key={position}>
                    <span className="font-medium tabular-nums">{position}:</span> {names.join(", ")}
                  </li>
                ))}
              </ul>
            </details>
            <fieldset disabled={running} className="space-y-3">
              <NumberField
                label="People per room (group similar)"
                value={value.groupSize}
                min={2}
                max={8}
                onChange={(groupSize) => onChange({ ...value, groupSize })}
              />
              <NumberField
                label="Minutes in rooms"
                value={value.minutes}
                min={1}
                max={60}
                onChange={(minutes) => onChange({ ...value, minutes })}
              />
              <div className="space-y-1.5">
                <Label htmlFor={ids.p}>Prompt in rooms</Label>
                <Input id={ids.p} value={value.prompt} maxLength={200} onChange={(e) => onChange({ ...value, prompt: e.target.value })} />
              </div>
            </fieldset>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={running || pulse.votes.size < 2} onClick={() => onGroup("opposites")}>
                <ArrowLeftRight /> Pair opposites
              </Button>
              <Button variant="outline" disabled={running || pulse.votes.size < 2} onClick={() => onGroup("similar")}>
                <Users /> Group similar
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => void pulse.share()}>
                <Send /> {pulse.shared ? "Share again" : "Share results"}
              </Button>
              <Button variant="ghost" disabled={running} onClick={() => void pulse.close()}>
                <X /> New statement
              </Button>
            </div>
          </CardFooter>
        </>
      ) : (
        <>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={ids.q}>Statement</Label>
              <Input id={ids.q} value={statement} maxLength={150} onChange={(e) => setStatement(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor={ids.l}>Left end (1)</Label>
                <Input id={ids.l} value={left} maxLength={30} onChange={(e) => setLeft(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={ids.r}>Right end (10)</Label>
                <Input id={ids.r} value={right} maxLength={30} onChange={(e) => setRight(e.target.value)} />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              size="lg"
              className="h-12 w-full text-base"
              disabled={!statement.trim() || !left.trim() || !right.trim()}
              onClick={() => void pulse.ask({ kind: "spectrum", question: statement.trim(), labels: [left.trim(), right.trim()] })}
            >
              <Send /> Ask everyone to place themselves
            </Button>
          </CardFooter>
        </>
      )}
    </Card>
  )
}
