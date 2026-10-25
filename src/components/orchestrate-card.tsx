import { useState } from "react"
import { DoorClosed, Eye, Loader2, Sparkles } from "lucide-react"

import { RoomPlan } from "@/components/room-plan"
import type { RoomSettings } from "@/components/room-settings-card"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { HostSession } from "@/hooks/use-host-session"
import { buildMatchPlan, reconcilePlan } from "@/lib/matchmaking/engine"
import type { MatchPlan } from "@/lib/matchmaking/types"
import { orchestrate, type OrchestrationProgress, type OrchestrationResult } from "@/lib/orchestrate"
import type { ZoomClient } from "@/lib/zoom-client"

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

type RunState =
  | { status: "idle" }
  | { status: "running"; progress: OrchestrationProgress }
  | { status: "done"; result: OrchestrationResult }
  | { status: "error"; error: string }

export function OrchestrateCard({
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

  // A preview stays valid while the matching settings are unchanged. People
  // joining or leaving don't discard it: it's reconciled with who's here now.
  const [previewed, setPreviewed] = useState<{ plan: MatchPlan; config: unknown } | null>(null)
  const current = previewed && previewed.config === config ? reconcilePlan(previewed.plan, candidates) : null
  const preview = current?.plan ?? null
  const setPreview = (plan: MatchPlan | null) => setPreviewed(plan ? { plan, config } : null)

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
          {candidates.length} people ready. Preview the rooms first, or make them straight away.
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
          Make rooms
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
            <Eye /> {preview ? "Shuffle again" : "Preview rooms"}
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

        {current && (current.joined > 0 || current.left > 0) && run.status !== "done" && (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Since this preview: {current.joined} joined, {current.left} left. Newcomers were added to the smallest
            rooms. Press Shuffle again for a new plan.
          </p>
        )}
        {preview && preview.rooms.length > 0 && <RoomPlan plan={preview} config={config} />}
      </CardFooter>
    </Card>
  )
}

