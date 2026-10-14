import { FastForward, Loader2, Pause, Play, Plus, Sparkles, Square } from "lucide-react"

import { RoomPlan } from "@/components/room-plan"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { formatClock, useNow } from "@/hooks/use-now"
import type { useRoundRunner } from "@/hooks/use-round-runner"
import type { MatchConfig } from "@/lib/matchmaking/types"

const PHASE_LABELS = {
  idle: "Ready",
  preparing: "Setting up rooms…",
  open: "Rooms are open",
  paused: "Paused",
  closing: "Closing rooms…",
  done: "Finished",
  error: "Stopped",
} as const

/** Start and steer a timed, multi-round activity. */
export function RoundControlCard({
  title,
  description,
  runner,
  minutes,
  canStart,
  startHint,
  onStart,
  config,
}: {
  title: string
  description: string
  runner: ReturnType<typeof useRoundRunner>
  minutes: number
  canStart: boolean
  startHint?: string
  onStart: () => void
  /** Used by the room preview to label members. */
  config: MatchConfig
}) {
  const { state, active } = runner
  const now = useNow(state?.phase === "open")
  const left = state?.phase === "open" && state.endsAt ? state.endsAt - now : state?.remainingMs ?? null
  const roundMs = minutes * 60_000

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      {state && state.phase !== "idle" && (
        <CardContent className="space-y-3" aria-live="polite">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">
              Round {state.round + 1} of {state.total} · {PHASE_LABELS[state.phase]}
            </p>
            {left !== null && (
              <p className="font-mono text-2xl tabular-nums" aria-label={`${formatClock(left)} left`}>
                {formatClock(left)}
              </p>
            )}
          </div>
          {left !== null && (
            <Progress value={Math.min(100, (left / roundMs) * 100)} aria-label="Time left in this round" />
          )}
          {state.prompt && (
            <p className="rounded-lg bg-muted p-3 text-sm">
              <span className="font-medium">Prompt: </span>
              {state.prompt}
            </p>
          )}
          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          {[...state.seatErrors, ...state.failures.map((f) => `${f.name} → ${f.room}: ${f.error}`)].length > 0 && (
            <details className="text-sm text-destructive">
              <summary>Some people couldn't be placed</summary>
              <ul className="mt-1 list-disc pl-5">
                {state.seatErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
                {state.failures.map((f, i) => (
                  <li key={`${f.name}-${i}`}>
                    {f.name} → {f.room}: {f.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      )}

      <CardFooter className="flex-col items-stretch gap-3">
        {!active ? (
          <>
            <Button size="lg" className="h-12 w-full text-base" disabled={!canStart} onClick={onStart}>
              <Sparkles aria-hidden="true" />
              {state?.phase === "done" || state?.phase === "error" ? "Start again" : "Start"}
            </Button>
            {startHint && <p className="text-sm text-muted-foreground">{startHint}</p>}
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {state?.phase === "paused" ? (
              <Button onClick={runner.resume}>
                <Play /> Resume
              </Button>
            ) : (
              <Button variant="outline" disabled={state?.phase !== "open"} onClick={runner.pause}>
                <Pause /> Pause
              </Button>
            )}
            <Button
              variant="outline"
              disabled={state?.phase !== "open" && state?.phase !== "paused"}
              onClick={() => runner.extend(2)}
            >
              <Plus /> 2 min
            </Button>
            <Button
              variant="outline"
              disabled={state?.phase !== "open" && state?.phase !== "paused"}
              onClick={runner.skip}
            >
              {state?.phase === "closing" ? <Loader2 className="animate-spin" /> : <FastForward />}
              {state && state.round + 1 < state.total ? "Next round" : "Finish"}
            </Button>
            <Button variant="destructive" onClick={() => void runner.end()}>
              <Square /> End
            </Button>
          </div>
        )}

        {state?.plan && state.plan.rooms.length > 0 && active && <RoomPlan plan={state.plan} config={config} />}
      </CardFooter>
    </Card>
  )
}
