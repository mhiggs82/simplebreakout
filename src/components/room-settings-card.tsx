import type { ConfigureBreakoutRoomsOptions } from "@zoom/appssdk"
import { useId } from "react"

import { NumberField } from "@/components/round-fields"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

type ToggleSettings = Required<
  Pick<
    ConfigureBreakoutRoomsOptions,
    | "automaticallyMoveParticipantsIntoRooms"
    | "allowParticipantsReturnToMainSession"
    | "allowParticipantsChooseRoom"
  >
>

export type RoomSettings = ToggleSettings & { closeAfter: number; countDown: number }

const SETTING_LABELS: { key: keyof ToggleSettings; label: string; hint: string }[] = [
  {
    key: "automaticallyMoveParticipantsIntoRooms",
    label: "Auto-move participants",
    hint: "Send people straight into their room without a join prompt.",
  },
  {
    key: "allowParticipantsReturnToMainSession",
    label: "Allow return to main session",
    hint: "Participants can leave their room and rejoin the main meeting.",
  },
  {
    key: "allowParticipantsChooseRoom",
    label: "Let participants choose",
    hint: "Participants may switch rooms themselves after assignment.",
  },
]

export function RoomSettingsCard({
  settings,
  onChange,
  timed,
  forceChoose = false,
  chat,
  onChatChange,
}: {
  settings: RoomSettings
  onChange: (next: RoomSettings) => void
  /** Timed activities close rooms themselves, so "close after" is hidden. */
  timed: boolean
  /** Open Space always lets people choose their room. */
  forceChoose?: boolean
  /** Timed activities: also post each task to the Zoom chat. */
  chat?: boolean
  onChatChange?: (chat: boolean) => void
}) {
  const idPrefix = useId()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Room settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {SETTING_LABELS.map(({ key, label, hint: defaultHint }) => {
          const id = `${idPrefix}-${key}`
          const locked = forceChoose && key === "allowParticipantsChooseRoom"
          const hint = locked ? "Always on in Open Space, so people can pick their table." : defaultHint
          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor={id}>{label}</Label>
                <p id={`${id}-hint`} className="text-sm text-muted-foreground">
                  {hint}
                </p>
              </div>
              <Switch
                id={id}
                aria-describedby={`${id}-hint`}
                checked={locked || settings[key]}
                disabled={locked}
                onCheckedChange={(checked) => onChange({ ...settings, [key]: checked })}
              />
            </div>
          )
        })}
        {chat !== undefined && onChatChange && (
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor={`${idPrefix}-chat`}>Post the task in Zoom chat</Label>
              <p id={`${idPrefix}-chat-hint`} className="text-sm text-muted-foreground">
                Students see each prompt and time limit in chat, even without the app.
              </p>
            </div>
            <Switch
              id={`${idPrefix}-chat`}
              aria-describedby={`${idPrefix}-chat-hint`}
              checked={chat}
              onCheckedChange={onChatChange}
            />
          </div>
        )}
        <NumberField
          label="Closing countdown"
          hint="Seconds people get to wrap up when rooms close."
          value={settings.countDown}
          min={10}
          max={120}
          onChange={(countDown) => onChange({ ...settings, countDown })}
        />
        {!timed && (
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor={`${idPrefix}-close`}>Close rooms after</Label>
            <p id={`${idPrefix}-close-hint`} className="text-sm text-muted-foreground">
              Minutes. 0 keeps rooms open until you close them.
            </p>
          </div>
          <Input
            id={`${idPrefix}-close`}
            aria-describedby={`${idPrefix}-close-hint`}
            type="number"
            min={0}
            max={1440}
            className="w-20"
            value={settings.closeAfter}
            onChange={(e) =>
              onChange({ ...settings, closeAfter: Math.min(1440, Math.max(0, Number(e.target.value) || 0)) })
            }
          />
        </div>
        )}
      </CardContent>
    </Card>
  )
}

