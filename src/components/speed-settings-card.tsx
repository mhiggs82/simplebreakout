import { RoomSizeField } from "@/components/room-size-field"
import { LinesField, RoundFields } from "@/components/round-fields"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ICEBREAKERS, type SpeedSettings } from "@/hooks/use-activity-settings"

export function SpeedSettingsCard({
  value,
  onChange,
  disabled,
  people,
}: {
  value: SpeedSettings
  onChange: (next: SpeedSettings) => void
  disabled: boolean
  /** People who will be put in rooms, for the room-size summary. */
  people: number
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pairs</CardTitle>
        <CardDescription>
          Short, timed chats. Each round, everyone gets someone new to talk to, for as long as that's possible.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={disabled} className="space-y-4">
          <RoomSizeField
            value={value.groupSize}
            onChange={(groupSize) => onChange({ ...value, groupSize })}
            people={people}
            max={8}
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
