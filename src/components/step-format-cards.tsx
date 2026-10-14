import { LinesField, NumberField, StepFields } from "@/components/round-fields"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { GallerySettings, OneTwoFourSettings, TpsSettings } from "@/hooks/use-activity-settings"

export const ONE_TWO_FOUR_STEPS = [
  { title: "1 · On your own", where: "main room", label: "On your own" },
  { title: "2 · Pairs", where: "breakout rooms", label: "Pairs" },
  { title: "4 · Fours", where: "pairs join up", label: "Fours" },
  { title: "All", where: "main room", label: "All together" },
] as const

export const TPS_STEPS = [
  { key: "think", title: "Think", where: "main room, on your own", label: "Think" },
  { key: "pair", title: "Pair", where: "breakout rooms, insights collected", label: "Pair" },
  { key: "share", title: "Share", where: "main room, harvest shared", label: "Share" },
] as const

export function OneTwoFourCard({
  value,
  onChange,
  disabled,
}: {
  value: OneTwoFourSettings
  onChange: (next: OneTwoFourSettings) => void
  disabled: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>1-2-4-All</CardTitle>
        <CardDescription>
          Everyone reflects alone, then shares in pairs, then pairs join into fours, then the whole group comes
          back together. Fours send a key insight from their panel.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={disabled} className="space-y-3">
          {ONE_TWO_FOUR_STEPS.map((step, i) => (
            <StepFields
              key={step.title}
              title={step.title}
              where={step.where}
              value={value.steps[i]}
              onChange={(next) => {
                const steps = [...value.steps] as OneTwoFourSettings["steps"]
                steps[i] = next
                onChange({ steps })
              }}
            />
          ))}
        </fieldset>
      </CardContent>
    </Card>
  )
}

export function TpsCard({
  value,
  onChange,
  disabled,
}: {
  value: TpsSettings
  onChange: (next: TpsSettings) => void
  disabled: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Think-Pair-Share</CardTitle>
        <CardDescription>
          Think alone, discuss in pairs, then share. Each pair sends its key insight from the app panel, and the
          harvest is shared with everyone when the Share step starts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={disabled} className="space-y-3">
          {TPS_STEPS.map((step) => (
            <StepFields
              key={step.key}
              title={step.title}
              where={step.where}
              value={value[step.key]}
              onChange={(next) => onChange({ ...value, [step.key]: next })}
            />
          ))}
        </fieldset>
      </CardContent>
    </Card>
  )
}

export function GalleryCard({
  value,
  onChange,
  disabled,
}: {
  value: GallerySettings
  onChange: (next: GallerySettings) => void
  disabled: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Gallery walk</CardTitle>
        <CardDescription>
          Groups move together from station to station. At each one they read the notes earlier groups left and
          add their own from the app panel.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={disabled} className="space-y-4">
          <LinesField
            label="Stations"
            hint="One per line (2–12). Each group visits every station once."
            value={value.stations}
            maxLength={40}
            onChange={(stations) => onChange({ ...value, stations: stations.slice(0, 12) })}
          />
          <NumberField
            label="Minutes per station"
            value={value.minutes}
            min={1}
            max={60}
            onChange={(minutes) => onChange({ ...value, minutes })}
          />
          <LinesField
            label="Prompts"
            hint="One per line, one per station visit. The last one repeats."
            value={value.prompts}
            onChange={(prompts) => onChange({ ...value, prompts })}
          />
        </fieldset>
      </CardContent>
    </Card>
  )
}
