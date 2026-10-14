import { AlarmClock, CheckCircle2, DoorOpen, Fish, Hand, Hourglass, Loader2, MessageCircle } from "lucide-react"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useAttendeeSession } from "@/hooks/use-attendee-session"
import { formatClock, useNow } from "@/hooks/use-now"
import { useSeatListener } from "@/hooks/use-seat-listener"
import type { Answers } from "@/lib/matchmaking/types"
import type { Questionnaire, RoundInfo } from "@/lib/messages"
import type { ZoomClient } from "@/lib/zoom-client"

function Choice({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string
  options: { value: string; label: string }[]
  value: string | undefined
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <RadioGroup value={value ?? ""} onValueChange={onChange}>
        {options.map((option, i) => (
          <div key={option.value} className="flex items-center gap-2">
            <RadioGroupItem value={option.value} id={`${id}-${i}`} />
            <Label htmlFor={`${id}-${i}`} className="font-normal">{option.label}</Label>
          </div>
        ))}
      </RadioGroup>
    </fieldset>
  )
}

function QuestionForm({
  questionnaire,
  initial,
  onSubmit,
}: {
  questionnaire: Questionnaire
  initial: Answers | null
  onSubmit: (answers: Answers) => Promise<void>
}) {
  const [answers, setAnswers] = useState<Answers>(initial ?? { tags: {} })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const complete =
    questionnaire.mode === "roles"
      ? Boolean(answers.roleId)
      : questionnaire.categories.every((c) => answers.tags[c.id])

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setSending(true)
        setError(null)
        onSubmit(answers)
          .catch(() => setError("Couldn't send your answers. Please try again."))
          .finally(() => setSending(false))
      }}
    >
      <CardContent className="space-y-5">
        {questionnaire.mode === "roles" ? (
          <Choice
            legend="Which role are you?"
            options={questionnaire.roles.map((r) => ({ value: r.id, label: r.label }))}
            value={answers.roleId}
            onChange={(roleId) => setAnswers((a) => ({ ...a, roleId }))}
          />
        ) : (
          questionnaire.categories.map((category) => (
            <Choice
              key={category.id}
              legend={category.label}
              options={category.options.map((o) => ({ value: o, label: o }))}
              value={answers.tags[category.id]}
              onChange={(value) => setAnswers((a) => ({ ...a, tags: { ...a.tags, [category.id]: value } }))}
            />
          ))
        )}
      </CardContent>
      <CardFooter className="mt-6 flex-col items-stretch gap-2">
        <Button type="submit" size="lg" disabled={!complete || sending}>
          {sending && <Loader2 className="animate-spin" />}
          {initial ? "Update my answers" : "Send my answers"}
        </Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </CardFooter>
    </form>
  )
}

function RoundCard({ round, warning }: { round: RoundInfo; warning: number | null }) {
  const now = useNow(round.endsAt !== null)
  const left = round.endsAt !== null ? round.endsAt - now : null
  const label = round.activity === "cafe" ? "World Café" : "Speed Networking"
  return (
    <Card role="status">
      <CardHeader>
        <CardDescription>
          {label} · Round {round.number} of {round.total}
        </CardDescription>
        <CardTitle className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><MessageCircle className="size-5" aria-hidden="true" /> This round</span>
          <span className="font-mono text-2xl tabular-nums" aria-label={left === null ? "Paused" : `${formatClock(left)} left`}>
            {left === null ? "Paused" : formatClock(left)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {round.prompt ? (
          <blockquote className="rounded-lg bg-muted p-4 text-lg leading-snug">{round.prompt}</blockquote>
        ) : (
          <p className="text-sm text-muted-foreground">Enjoy the conversation!</p>
        )}
        {warning !== null && (
          <p role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/40 p-3 text-sm">
            <AlarmClock className="size-4 text-destructive" aria-hidden="true" />
            About {Math.round(warning / 60) || 1} minute left: start wrapping up.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function FishbowlAttendeeCard({
  onStage,
  handRaised,
  stageSize,
  onHand,
}: {
  onStage: boolean
  handRaised: boolean
  stageSize: number
  onHand: (raised: boolean) => Promise<void>
}) {
  const [sending, setSending] = useState(false)
  return (
    <Card role="status">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Fish className="size-5" aria-hidden="true" /> Fishbowl</CardTitle>
        <CardDescription>
          {onStage
            ? "You're in the inner circle. Unmute and join the conversation!"
            : `${stageSize} people are talking on stage. Listen in, and ask for a seat when you'd like to speak.`}
        </CardDescription>
      </CardHeader>
      {!onStage && (
        <CardFooter>
          <Button
            size="lg"
            className="w-full"
            variant={handRaised ? "outline" : "default"}
            aria-pressed={handRaised}
            disabled={sending}
            onClick={() => {
              setSending(true)
              onHand(!handRaised).finally(() => setSending(false))
            }}
          >
            <Hand /> {handRaised ? "Lower my hand" : "Ask to join the circle"}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}

export function AttendeePanel({ client, selfUuid }: { client: ZoomClient; selfUuid: string }) {
  const session = useAttendeeSession(client, selfUuid)
  const seat = useSeatListener(client, selfUuid)
  const { questionnaire, submitted, started, submit } = session

  const seatBanner = seat && (
    <p role="status" className="rounded-lg border p-3 text-sm">
      You're the host of <strong>{seat.roomName}</strong>: you stay at this table while others rotate.
      {seat.error && <span className="block text-destructive">{seat.error}</span>}
    </p>
  )

  if (session.stage !== null) {
    return (
      <FishbowlAttendeeCard
        onStage={session.onStage}
        handRaised={session.handRaised}
        stageSize={session.stage.length}
        onHand={session.setHand}
      />
    )
  }

  if (session.round) {
    return (
      <>
        {seatBanner}
        <RoundCard round={session.round} warning={session.warning} />
      </>
    )
  }

  if (started) {
    return (
      <Card role="status">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><DoorOpen className="size-5" /> Rooms are open</CardTitle>
          <CardDescription>Join your breakout room from the Zoom prompt. Enjoy the conversation!</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!questionnaire) {
    return (
      <Card role="status">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Hourglass className="size-5" /> Waiting for the host</CardTitle>
          <CardDescription>
            Keep this panel open. Questions, round prompts and timers from the host will appear here.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{submitted ? "Thanks! You can change your answers until rooms open." : "A few quick questions"}</CardTitle>
        <CardDescription className="flex items-center gap-1.5" aria-live="polite">
          {submitted ? (
            <><CheckCircle2 className="size-4 text-primary" /> Your answers were sent to the host.</>
          ) : (
            "Your answers help the host match you with the right people."
          )}
        </CardDescription>
      </CardHeader>
      <QuestionForm
        key={questionnaire.sessionId}
        questionnaire={questionnaire}
        initial={submitted}
        onSubmit={submit}
      />
    </Card>
  )
}
