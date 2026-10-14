import { useId, useState } from "react"
import type { ConfigureBreakoutRoomsOptions } from "@zoom/appssdk"
import { Loader2, ShieldAlert, Sparkles, Users } from "lucide-react"

import { useZoomSdk } from "@/hooks/use-zoom-sdk"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"

type RoomSettings = Required<
  Pick<
    ConfigureBreakoutRoomsOptions,
    | "automaticallyMoveParticipantsIntoRooms"
    | "allowParticipantsReturnToMainSession"
    | "allowParticipantsChooseRoom"
  >
>

const SETTING_LABELS: { key: keyof RoomSettings; label: string; hint: string }[] = [
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

const ROLE_LABELS: Record<string, string> = {
  host: "Host",
  coHost: "Co-host",
  attendee: "Attendee",
  panelist: "Panelist",
}

export function BreakoutDashboard() {
  const zoom = useZoomSdk()
  const idPrefix = useId()
  const [settings, setSettings] = useState<RoomSettings>({
    automaticallyMoveParticipantsIntoRooms: true,
    allowParticipantsReturnToMainSession: true,
    allowParticipantsChooseRoom: false,
  })
  const [statusMessage, setStatusMessage] = useState("")

  if (zoom.status === "loading") {
    return (
      <Card className="w-full max-w-md" aria-busy="true">
        <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          Connecting to Zoom…
        </CardContent>
      </Card>
    )
  }

  if (zoom.status === "error") {
    return (
      <Card className="w-full max-w-md" role="alert">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-destructive" aria-hidden="true" />
            Can't start SimpleBreakout
          </CardTitle>
          <CardDescription>{zoom.error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const canOrchestrate = zoom.isHostOrCoHost

  const handleOrchestrate = () => {
    // Placeholder: the matchmaking pipeline (fetch participants → sort →
    // createBreakoutRooms → configureBreakoutRooms → assign) plugs in here.
    console.info("Orchestrate matchmaking with settings:", settings)
    setStatusMessage("Settings captured. The matchmaking pipeline isn't wired up yet.")
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-xl">SimpleBreakout</CardTitle>
            <CardDescription>{zoom.meeting.meetingTopic}</CardDescription>
          </div>
          <div className="flex gap-2">
            {zoom.isMock && <Badge variant="outline">Mock</Badge>}
            <Badge variant={canOrchestrate ? "default" : "secondary"}>
              {ROLE_LABELS[zoom.user.role] ?? zoom.user.role}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <fieldset className="space-y-4" disabled={!canOrchestrate}>
          <legend className="sr-only">Breakout room settings</legend>
          {SETTING_LABELS.map(({ key, label, hint }) => {
            const id = `${idPrefix}-${key}`
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
                  checked={settings[key]}
                  disabled={!canOrchestrate}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, [key]: checked }))
                  }
                />
              </div>
            )
          })}
        </fieldset>

        <Separator />

        {!canOrchestrate && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="size-4" aria-hidden="true" />
            Only the host or a co-host can orchestrate breakout rooms.
          </p>
        )}
      </CardContent>

      <CardFooter className="flex-col gap-3">
        <Button
          size="lg"
          className="h-12 w-full text-base"
          disabled={!canOrchestrate}
          onClick={handleOrchestrate}
        >
          <Sparkles aria-hidden="true" />
          Orchestrate Matchmaking
        </Button>
        <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
          {statusMessage}
        </p>
      </CardFooter>
    </Card>
  )
}
