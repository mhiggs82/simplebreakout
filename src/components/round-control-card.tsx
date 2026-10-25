import { useState } from "react"
import { Check, Copy, FastForward, Loader2, Pause, Play, Plus, Presentation, Sparkles, Square } from "lucide-react"

import { RoomPlan } from "@/components/room-plan"
import { RoomVisitor } from "@/components/room-visitor"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { formatClock, useNow } from "@/hooks/use-now"
import type { useRoundRunner } from "@/hooks/use-round-runner"
import type { MatchConfig } from "@/lib/matchmaking/types"
import type { ZoomClient } from "@/lib/zoom-client"

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
  client,
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
  client: ZoomClient
}) {
  const { state, active } = runner
  const [copied, setCopied] = useState<string | null>(null)
  const now = useNow(state?.phase === "open")
  const left = state?.phase === "open" && state.endsAt ? state.endsAt - now : state?.remainingMs ?? null
  const roundMs = minutes * 60_000
  const phaseLabel =
    state?.kind === "main" && state.phase === "open" ? "In the main room" : state ? PHASE_LABELS[state.phase] : ""

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
              {state.label ? `Step ${state.round + 1} of ${state.total} · ${state.label}` : `Round ${state.round + 1} of ${state.total}`}
              {" · "}
              {phaseLabel}
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
          {state.prompt && active && (
            <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm">
              <p className="min-w-0 flex-1">
                <span className="font-medium">Prompt: </span>
                {state.prompt}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                aria-label="Copy the prompt, e.g. for Zoom's Broadcast message to all rooms"
                onClick={() => {
                  const text = state.prompt ?? ""
                  void navigator.clipboard
                    ?.writeText(text)
                    .then(() => setCopied(text))
                    .catch(() => {})
                }}
              >
                {copied === state.prompt ? <Check /> : <Copy />}
                {copied === state.prompt ? "Copied" : "Copy"}
              </Button>
            </div>
          )}
          {state.phase === "done" && (
            <p className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
              <Presentation className="size-4 shrink-0" aria-hidden="true" />
              Everyone is back. Share your slides again to carry on with the presentation.
            </p>
          )}
          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          {[...state.seatErrors, ...state.failures.map((f) => `${f.name} → ${f.room}: ${f.error}`)].length > 0 && (
            <details className="text-sm text-destructive">
              <summary>
                {state.failures.length + state.seatErrors.length} couldn't be placed this round. Usually they've just
                left or are reconnecting; they'll be included next round.
              </summary>
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

        {active && state && <RoomVisitor client={client} roomIds={state.roomIds} />}
        {state?.plan && state.plan.rooms.length > 0 && active && state.kind === "rooms" && (
          <RoomPlan plan={state.plan} config={config} seats={state.seats} />
        )}
      </CardFooter>
    </Card>
  )
}
