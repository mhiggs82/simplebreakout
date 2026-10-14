import { useEffect, useId, useRef, useState } from "react"
import type { ConfigureBreakoutRoomsOptions } from "@zoom/appssdk"
import { Coffee, DoorClosed, Eye, Fish, Loader2, ShieldAlert, Sparkles, Timer } from "lucide-react"

import { AttendeePanel } from "@/components/attendee-panel"
import { CafeSettingsCard } from "@/components/cafe-settings-card"
import { FishbowlCard } from "@/components/fishbowl-card"
import { RoundControlCard } from "@/components/round-control-card"
import { NumberField } from "@/components/round-fields"
import { SpeedSettingsCard } from "@/components/speed-settings-card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useActivitySettings } from "@/hooks/use-activity-settings"
import { useFishbowl } from "@/hooks/use-fishbowl"
import { useRoundRunner } from "@/hooks/use-round-runner"
import { useSeatListener } from "@/hooks/use-seat-listener"
import { uniqueNames } from "@/lib/matchmaking/engine"
import { planCafeRound, planSpeedRound, promptFor } from "@/lib/matchmaking/rounds"
import { MatchSettingsCard } from "@/components/match-settings-card"
import { ParticipantsCard } from "@/components/participants-card"
import { RoomPlan } from "@/components/room-plan"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { useHostSession, type HostSession } from "@/hooks/use-host-session"
import { useZoomSdk } from "@/hooks/use-zoom-sdk"
import { buildMatchPlan } from "@/lib/matchmaking/engine"
import type { Activity, MatchPlan } from "@/lib/matchmaking/types"
import {
  orchestrate,
  type OrchestrationProgress,
  type OrchestrationResult,
} from "@/lib/orchestrate"
import type { ZoomClient } from "@/lib/zoom-client"

type ToggleSettings = Required<
  Pick<
    ConfigureBreakoutRoomsOptions,
    | "automaticallyMoveParticipantsIntoRooms"
    | "allowParticipantsReturnToMainSession"
    | "allowParticipantsChooseRoom"
  >
>

type RoomSettings = ToggleSettings & { closeAfter: number; countDown: number }

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

const ROLE_LABELS: Record<string, string> = {
  host: "Host",
  coHost: "Co-host",
  attendee: "Attendee",
  panelist: "Panelist",
}

const STEP_LABELS: Record<OrchestrationProgress["step"], string> = {
  checking: "Checking current rooms…",
  creating: "Creating rooms…",
  configuring: "Applying room settings…",
  assigning: "Assigning participants…",
  opening: "Opening rooms…",
  done: "Rooms are open",
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "object" && err && "message" in err) return String(err.message)
  return String(err)
}

function RoomSettingsCard({
  settings,
  onChange,
  timed,
}: {
  settings: RoomSettings
  onChange: (next: RoomSettings) => void
  /** Timed activities close rooms themselves, so "close after" is hidden. */
  timed: boolean
}) {
  const idPrefix = useId()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Room settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
                onCheckedChange={(checked) => onChange({ ...settings, [key]: checked })}
              />
            </div>
          )
        })}
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

type RunState =
  | { status: "idle" }
  | { status: "running"; progress: OrchestrationProgress }
  | { status: "done"; result: OrchestrationResult }
  | { status: "error"; error: string }

function OrchestrateCard({
  client,
  session,
  settings,
}: {
  client: ZoomClient
  session: HostSession
  settings: RoomSettings
}) {
  const [run, setRun] = useState<RunState>({ status: "idle" })
  const [closing, setClosing] = useState(false)
  const { candidates, config } = session

  // A preview only stays valid while the people and settings it was built from are unchanged.
  const [previewed, setPreviewed] = useState<{ plan: MatchPlan; from: unknown[] } | null>(null)
  const inputs = [candidates, config]
  const preview =
    previewed && previewed.from.every((input, i) => input === inputs[i]) ? previewed.plan : null
  const setPreview = (plan: MatchPlan | null) =>
    setPreviewed(plan ? { plan, from: inputs } : null)

  const running = run.status === "running"

  const handleOrchestrate = async () => {
    const plan = preview ?? buildMatchPlan(candidates, config)
    setPreview(plan)
    if (plan.rooms.length === 0) {
      setRun({ status: "error", error: plan.warnings[0] ?? "There is nobody to match." })
      return
    }
    try {
      const result = await orchestrate(client, plan, settings, (progress) =>
        setRun({ status: "running", progress }),
      )
      setRun({ status: "done", result })
      await session.announceStart().catch(() => {})
    } catch (err) {
      setRun({ status: "error", error: errorText(err) })
    }
  }

  const handleClose = async () => {
    setClosing(true)
    try {
      await client.closeBreakoutRooms()
      setRun({ status: "idle" })
      setPreview(null)
    } catch (err) {
      setRun({ status: "error", error: errorText(err) })
    } finally {
      setClosing(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rooms</CardTitle>
        <CardDescription>
          {candidates.length} people ready. Preview first, or go straight to one-click matching.
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex-col items-stretch gap-3">
        <Button
          size="lg"
          className="h-12 w-full text-base"
          disabled={running || candidates.length < 2}
          onClick={() => void handleOrchestrate()}
        >
          {running ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          Orchestrate Matchmaking
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            disabled={running || candidates.length < 2}
            onClick={() => {
              setRun({ status: "idle" })
              setPreview(buildMatchPlan(candidates, config))
            }}
          >
            <Eye /> {preview ? "Reshuffle" : "Preview"}
          </Button>
          <Button variant="outline" disabled={running || closing} onClick={() => void handleClose()}>
            {closing ? <Loader2 className="animate-spin" /> : <DoorClosed />} Close rooms
          </Button>
        </div>

        <div aria-live="polite" className="space-y-2 text-sm">
          {run.status === "running" && (
            <>
              <p className="text-muted-foreground">
                {STEP_LABELS[run.progress.step]}
                {run.progress.step === "assigning" && ` ${run.progress.assigned}/${run.progress.total}`}
              </p>
              <Progress
                value={run.progress.total ? (run.progress.assigned / run.progress.total) * 100 : 0}
                aria-label="Assignment progress"
              />
            </>
          )}
          {run.status === "done" && (
            <div className="space-y-1">
              <p className="font-medium">
                {run.result.assigned} people matched into {preview?.rooms.length ?? 0} rooms. Rooms are open.
              </p>
              {run.result.failures.length > 0 && (
                <details className="text-destructive">
                  <summary>{run.result.failures.length} couldn't be assigned</summary>
                  <ul className="mt-1 list-disc pl-5">
                    {run.result.failures.map((f) => (
                      <li key={`${f.name}-${f.room}`}>
                        {f.name} → {f.room}: {f.error}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          {run.status === "error" && (
            <p role="alert" className="text-destructive">
              {run.error}
            </p>
          )}
        </div>

        {preview && preview.rooms.length > 0 && <RoomPlan plan={preview} config={config} />}
      </CardFooter>
    </Card>
  )
}

const ACTIVITIES: { value: Activity; label: string; icon: typeof Sparkles }[] = [
  { value: "match", label: "Match", icon: Sparkles },
  { value: "cafe", label: "Café", icon: Coffee },
  { value: "speed", label: "Speed", icon: Timer },
  { value: "fishbowl", label: "Fishbowl", icon: Fish },
]

const PRIVILEGED = new Set(["host", "coHost"])

function HostPanel({ client, selfUuid }: { client: ZoomClient; selfUuid: string }) {
  const session = useHostSession(client, selfUuid)
  const [activities, setActivities] = useActivitySettings()
  const runner = useRoundRunner()
  const fishbowl = useFishbowl(client)
  const seat = useSeatListener(client, selfUuid)
  const [settings, setSettings] = useState<RoomSettings>({
    automaticallyMoveParticipantsIntoRooms: true,
    allowParticipantsReturnToMainSession: true,
    allowParticipantsChooseRoom: false,
    closeAfter: 0,
    countDown: 30,
  })

  // The runner calls back into these between rounds, so it always sees the
  // people who are in the meeting right now.
  const latest = useRef({ session, activities })
  useEffect(() => {
    latest.current = { session, activities }
  })

  const { activity, cafe, speed } = activities
  const timed = activity === "cafe" || activity === "speed"
  const setActivity = (value: Activity) => setActivities((a) => ({ ...a, activity: value }))

  /** Pinned people the SDK can't assign: you and other hosts / co-hosts. */
  const selfSeated = (uuid: string) => {
    const person = latest.current.session.people.find((p) => p.uuid === uuid)
    return person !== undefined && (person.isSelf || PRIVILEGED.has(person.zoomRole))
  }

  const startTimed = () => {
    const rounds = activity === "cafe" ? cafe : speed
    runner.start({
      client,
      activity: activity === "cafe" ? "cafe" : "speed",
      rounds: rounds.rounds,
      minutes: rounds.minutes,
      settings: { ...settings, closeAfter: 0 },
      selfUuid,
      prompt: (round) => promptFor(rounds.prompts, round),
      plan: (_round, history) => {
        const { session: s, activities: a } = latest.current
        if (a.activity === "cafe") {
          const people = s.candidates.filter((c) => !selfSeated(c.uuid))
          return planCafeRound(a.cafe.tables, people, history)
        }
        return planSpeedRound(s.candidates, a.speed.groupSize, history, Math.random, a.speed.roomLabels)
      },
      seats: () => {
        const { activities: a } = latest.current
        if (a.activity !== "cafe") return []
        const names = uniqueNames(a.cafe.tables.map((t) => ({ name: t.name, members: [] }))).map((r) => r.name)
        return a.cafe.tables.flatMap((t, i) =>
          t.pinned.filter(selfSeated).map((participantUUID) => ({ participantUUID, roomName: names[i] })),
        )
      },
    })
  }

  const unhosted = cafe.tables.filter((t) => t.pinned.length === 0).length
  const startHint =
    activity === "cafe"
      ? unhosted > 0
        ? `${unhosted} table(s) have no Table Host yet.`
        : `${cafe.rounds} rotations of ${cafe.minutes} min across ${cafe.tables.length} tables.`
      : `${speed.rounds} rounds of ${speed.minutes} min, groups of ${speed.groupSize}.`

  return (
    <>
      {seat && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          You're hosting <strong>{seat.roomName}</strong>.{seat.error && ` ${seat.error}`}
        </p>
      )}
      <Tabs value={activity} onValueChange={(v) => setActivity(v as Activity)}>
        <TabsList className="w-full" aria-label="Activity">
          {ACTIVITIES.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} disabled={runner.active && value !== activity}>
              <Icon aria-hidden="true" /> {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {activity === "match" && (
        <>
          <MatchSettingsCard session={session} disabled={false} />
          <ParticipantsCard session={session} />
          <RoomSettingsCard settings={settings} onChange={setSettings} timed={false} />
          <OrchestrateCard client={client} session={session} settings={settings} />
        </>
      )}

      {timed && (
        <>
          {activity === "cafe" ? (
            <CafeSettingsCard
              value={cafe}
              onChange={(next) => setActivities((a) => ({ ...a, cafe: next }))}
              people={session.people}
              disabled={runner.active}
            />
          ) : (
            <SpeedSettingsCard
              value={speed}
              onChange={(next) => setActivities((a) => ({ ...a, speed: next }))}
              disabled={runner.active}
            />
          )}
          <ParticipantsCard session={session} showAnswers={false} />
          <RoomSettingsCard settings={settings} onChange={setSettings} timed />
          <RoundControlCard
            title={activity === "cafe" ? "Run the café" : "Run speed networking"}
            description="Rounds advance automatically. You can pause, add time or skip ahead."
            runner={runner}
            minutes={activity === "cafe" ? cafe.minutes : speed.minutes}
            canStart={session.candidates.length >= 2}
            startHint={startHint}
            onStart={startTimed}
            config={session.config}
          />
        </>
      )}

      {activity === "fishbowl" && (
        <FishbowlCard
          value={activities.fishbowl}
          onChange={(next) => setActivities((a) => ({ ...a, fishbowl: next }))}
          people={session.people}
          fishbowl={fishbowl}
        />
      )}
    </>
  )
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
            Can't start SimpleBreakout
          </CardTitle>
          <CardDescription>{zoom.error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <header className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0 space-y-0.5">
          <h1 className="text-xl font-semibold">SimpleBreakout</h1>
          <p className="truncate text-sm text-muted-foreground">{zoom.meeting.meetingTopic}</p>
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
