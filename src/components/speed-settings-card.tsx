import { LinesField, NumberField, RoundFields } from "@/components/round-fields"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ICEBREAKERS, type SpeedSettings } from "@/hooks/use-activity-settings"

export function SpeedSettingsCard({
  value,
  onChange,
  disabled,
}: {
  value: SpeedSettings
  onChange: (next: SpeedSettings) => void
  disabled: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Speed Networking</CardTitle>
        <CardDescription>
          Short timed rounds. Every round reshuffles people so nobody meets the same person twice, for as long as
          that's possible.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={disabled} className="space-y-4">
          <NumberField
            label="People per room"
            hint="2 for one-to-ones, 3–4 for small circles."
            value={value.groupSize}
            min={2}
            max={8}
            onChange={(groupSize) => onChange({ ...value, groupSize })}
          />
          <RoundFields
            value={value}
            icebreakers={ICEBREAKERS}
            onChange={(rounds) => onChange({ ...value, ...rounds })}
          />
          <LinesField
            label="Room names (optional)"
            hint="One per line. Rooms without a name are numbered."
            value={value.roomLabels}
            maxLength={40}
            placeholder={"Coffee corner\nGarden"}
            onChange={(roomLabels) => onChange({ ...value, roomLabels })}
          />
        </fieldset>
      </CardContent>
    </Card>
  )
}
