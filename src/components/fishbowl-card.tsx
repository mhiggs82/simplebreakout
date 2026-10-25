import { Hand, Loader2, Mic, UserMinus, X } from "lucide-react"
import { useState } from "react"

import { NumberField } from "@/components/round-fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { FishbowlSettings } from "@/hooks/use-activity-settings"
import { MAX_STAGE, type useFishbowl } from "@/hooks/use-fishbowl"
import type { MeetingPerson } from "@/hooks/use-host-session"

export function FishbowlCard({
  value,
  onChange,
  people,
  fishbowl,
}: {
  value: FishbowlSettings
  onChange: (next: FishbowlSettings) => void
  people: MeetingPerson[]
  fishbowl: ReturnType<typeof useFishbowl>
}) {
  const [picked, setPicked] = useState<string[]>([])
  const [replacing, setReplacing] = useState<Record<string, string>>({})
  const nameOf = (uuid: string) => people.find((p) => p.uuid === uuid)?.name ?? "Someone who left"
  const { stage, queue, busy } = fishbowl
  const free = value.seats - stage.length
  const choosing = stage.length === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fishbowl</CardTitle>
        <CardDescription>
          A few people talk on screen (spotlighted) while everyone else listens. Listeners raise their hand to
          join in, and you swap them in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <NumberField
          label="Seats in the circle"
          hint={`Zoom can spotlight up to ${MAX_STAGE} people.`}
          value={value.seats}
          min={1}
          max={MAX_STAGE}
          onChange={(seats) => onChange({ ...value, seats })}
        />

        {choosing ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Choose the first speakers ({picked.length}/{value.seats})
            </legend>
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {people.map((person) => {
                const checked = picked.includes(person.uuid)
                return (
                  <li key={person.uuid} className="flex items-center gap-3">
                    <Checkbox
                      id={`fb-${person.uuid}`}
                      checked={checked}
                      disabled={!checked && picked.length >= value.seats}
                      onCheckedChange={(on) =>
                        setPicked((p) => (on ? [...p, person.uuid] : p.filter((u) => u !== person.uuid)))
                      }
                    />
                    <label htmlFor={`fb-${person.uuid}`} className="text-sm">
                      {person.name}
                      {person.isSelf && " (you)"}
                    </label>
                  </li>
                )
              })}
            </ul>
          </fieldset>
        ) : (
          <section aria-label="On stage" className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Mic className="size-4" aria-hidden="true" /> On stage ({stage.length}/{value.seats})
            </h3>
            <ul className="space-y-1">
              {stage.map((uuid) => (
                <li key={uuid} className="flex items-center justify-between gap-2 text-sm">
                  {nameOf(uuid)}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${nameOf(uuid)} back to the audience`}
                    disabled={busy}
                    onClick={() => void fishbowl.putOnStage(stage.filter((u) => u !== uuid))}
                  >
                    <UserMinus />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!choosing && (
          <section aria-label="Raised hands" className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Hand className="size-4" aria-hidden="true" /> Waiting to join
              <Badge variant="secondary">{queue.length}</Badge>
            </h3>
            {queue.length === 0 ? (
              <p className="text-sm text-muted-foreground">No raised hands yet.</p>
            ) : (
              <ul className="space-y-2">
                {queue.map((uuid) => {
                  const out = replacing[uuid] ?? stage[0]
                  return (
                    <li key={uuid} className="space-y-1.5 rounded-lg border p-2">
                      <div className="flex items-center justify-between text-sm">
                        {nameOf(uuid)}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Dismiss ${nameOf(uuid)}'s raised hand`}
                          onClick={() => fishbowl.dismiss(uuid)}
                        >
                          <X />
                        </Button>
                      </div>
                      {free > 0 ? (
                        <Button size="sm" className="w-full" disabled={busy} onClick={() => void fishbowl.putOnStage([...stage, uuid])}>
                          Bring onto the stage
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Select value={out} onValueChange={(v) => setReplacing((r) => ({ ...r, [uuid]: v }))}>
                            <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label={`Who ${nameOf(uuid)} replaces`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {stage.map((s) => (
                                <SelectItem key={s} value={s}>
                                  Replace {nameOf(s)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" disabled={busy || !out} onClick={() => void fishbowl.swap(out, uuid)}>
                            Swap in
                          </Button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}

        {fishbowl.errors.length > 0 && (
          <ul role="alert" className="list-disc pl-5 text-sm text-destructive">
            {fishbowl.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2">
        {choosing ? (
          <Button
            size="lg"
            className="h-12 w-full text-base"
            disabled={busy || picked.length === 0}
            onClick={() => void fishbowl.putOnStage(picked).then(() => setPicked([]))}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Mic />} Put on stage
          </Button>
        ) : (
          <Button variant="outline" disabled={busy} onClick={() => void fishbowl.clear()}>
            End Fishbowl
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Spotlight needs each speaker's video on. Tip: use Zoom's "Mute all" so observers stay quiet.
        </p>
      </CardFooter>
    </Card>
  )
}
