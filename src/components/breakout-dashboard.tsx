import { Loader2, ShieldAlert } from "lucide-react"

import { AttendeePanel } from "@/components/attendee-panel"
import { HostPanel } from "@/components/host-panel"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useZoomSdk } from "@/hooks/use-zoom-sdk"
import mark from "@/assets/parentwise-mark-128.png"

const ROLE_LABELS: Record<string, string> = {
  host: "Host",
  coHost: "Co-host",
  attendee: "Attendee",
  panelist: "Panelist",
}

export function BreakoutDashboard() {
  const zoom = useZoomSdk()

  if (zoom.status === "loading") {
    return (
      <Card className="w-full" aria-busy="true">
        <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          Connecting to Zoom…
        </CardContent>
      </Card>
    )
  }

  if (zoom.status === "error") {
    return (
      <Card className="w-full" role="alert">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-destructive" aria-hidden="true" />
            Can't start Global Breakout
          </CardTitle>
          <CardDescription>{zoom.error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <header className="flex items-start justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src={mark} alt="" className="size-8 shrink-0" />
          <div className="min-w-0 space-y-0.5">
            <h1 className="font-serif text-xl font-semibold">Global Breakout</h1>
            <p className="truncate text-sm text-muted-foreground">{zoom.meeting.meetingTopic}</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {zoom.isMock && <Badge variant="outline">Mock</Badge>}
          <Badge variant={zoom.isHostOrCoHost ? "default" : "secondary"}>
            {ROLE_LABELS[zoom.user.role] ?? zoom.user.role}
          </Badge>
        </div>
      </header>

      {zoom.isHostOrCoHost ? (
        <HostPanel client={zoom.client} selfUuid={zoom.user.participantUUID} />
      ) : (
        <AttendeePanel client={zoom.client} selfUuid={zoom.user.participantUUID} />
      )}
    </div>
  )
}
