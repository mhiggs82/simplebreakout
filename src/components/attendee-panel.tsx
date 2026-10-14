import {
  AlarmClock,
  CheckCircle2,
  DoorOpen,
  Fish,
  Hand,
  Hourglass,
  LayoutGrid,
  Loader2,
  MessageCircle,
  Send,
  Sprout,
} from "lucide-react"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ResultsView } from "@/components/results-view"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useAttendeeSession } from "@/hooks/use-attendee-session"
import { formatClock, useNow } from "@/hooks/use-now"
import { useSeatListener } from "@/hooks/use-seat-listener"
import type { Answers } from "@/lib/matchmaking/types"
import type { HarvestItem, OpenTable, PulseQuestion, PulseResults, Questionnaire, RoundInfo, Vote } from "@/lib/messages"
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

const ACTIVITY_NAMES: Record<RoundInfo["activity"], string> = {
  cafe: "World Café",
  speed: "Speed Networking",
  oneTwoFour: "1-2-4-All",
  tps: "Think-Pair-Share",
  gallery: "Gallery walk",
  spectrum: "Spectrum line",
}

function InsightBox({ sent, onSend, label }: { sent: number; onSend: (text: string) => Promise<void>; label: string }) {
  const id = useId()
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        setSending(true)
        setError(null)
        onSend(text)
          .then(() => setText(""))
          .catch(() => setError("Couldn't send. Please try again."))
          .finally(() => setSending(false))
      }}
    >
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} rows={2} maxLength={200} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {sent > 0 ? `Sent ${sent}. Add another if you like.` : "One sentence is perfect. Only the host sees who sent it."}
        </span>
        <Button type="submit" size="sm" disabled={sending || !text.trim()}>
          {sending ? <Loader2 className="animate-spin" /> : <Send />} Send
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  )
}

function RoundCard({
  round,
  warning,
  station,
  insightsSent,
  onInsight,
}: {
  round: RoundInfo
  warning: number | null
  station: { room: string; notes: string[] } | null
  insightsSent: number
  onInsight: (text: string) => Promise<void>
}) {
  const now = useNow(round.endsAt !== null)
  const left = round.endsAt !== null ? round.endsAt - now : null
  const label = ACTIVITY_NAMES[round.activity]
  return (
    <Card role="status">
      <CardHeader>
        <CardDescription>
          {label} · {round.label ?? `Round ${round.number} of ${round.total}`}
          {round.kind === "main" && " · Main room"}
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
        {station && round.activity === "gallery" && (
          <section aria-label={`Notes left at ${station.room}`} className="space-y-1.5">
            <h3 className="text-sm font-medium">At {station.room}: notes from earlier groups</h3>
            {station.notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">You're the first group here.</p>
            ) : (
              <ul className="space-y-1">
                {station.notes.map((note, i) => (
                  <li key={i} className="rounded-md border px-3 py-2 text-sm">{note}</li>
                ))}
              </ul>
            )}
          </section>
        )}
        {round.harvest && (
          <InsightBox
            sent={insightsSent}
            onSend={onInsight}
            label={round.activity === "gallery" ? "Leave a note for the next group" : "Your group's key insight"}
          />
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

function PollCard({
  poll,
  myVote,
  results,
  onVote,
}: {
  poll: PulseQuestion
  myVote: Vote | null
  results: PulseResults | null
  onVote: (vote: Vote) => Promise<void>
}) {
  const id = useId()
  const [text, setText] = useState("")
  const [value, setValue] = useState(5)
  const [sending, setSending] = useState(false)
  const send = (vote: Vote) => {
    setSending(true)
    onVote(vote).finally(() => setSending(false))
  }
  const answered = myVote !== null

  return (
    <Card>
      <CardHeader>
        <CardDescription>
          {poll.kind === "poll" ? "Quick poll" : poll.kind === "cloud" ? "Word cloud" : "Spectrum line"} · anonymous
        </CardDescription>
        <CardTitle className="text-lg leading-snug">{poll.question}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {poll.kind === "poll" && (
          <RadioGroup
            aria-label={poll.question}
            value={myVote && "choice" in myVote ? String(myVote.choice) : ""}
            onValueChange={(v) => send({ choice: Number(v) })}
            disabled={sending}
          >
            {(poll.options ?? []).map((option, i) => (
              <div key={option + i} className="flex items-center gap-2">
                <RadioGroupItem value={String(i)} id={`${id}-${i}`} />
                <Label htmlFor={`${id}-${i}`} className="font-normal">{option}</Label>
              </div>
            ))}
          </RadioGroup>
        )}
        {poll.kind === "cloud" && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim()) send({ text: text.trim() })
            }}
          >
            <Label htmlFor={id} className="sr-only">Your answer (up to 3 words)</Label>
            <Input id={id} maxLength={30} placeholder="Up to 3 words" value={text} onChange={(e) => setText(e.target.value)} />
            <Button type="submit" disabled={sending || !text.trim()}>
              <Send /> {answered ? "Update" : "Send"}
            </Button>
          </form>
        )}
        {poll.kind === "spectrum" && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Slider
                aria-label={`Your position from 1 (${poll.labels?.[0] ?? "low"}) to 10 (${poll.labels?.[1] ?? "high"})`}
                min={1}
                max={10}
                step={1}
                value={[value]}
                onValueChange={([v]) => setValue(v)}
              />
              <span className="w-6 text-right font-mono text-lg tabular-nums">{value}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>← {poll.labels?.[0]}</span>
              <span>{poll.labels?.[1]} →</span>
            </div>
            <Button className="w-full" disabled={sending} onClick={() => send({ value })}>
              <Send /> {answered ? "Update my position" : "Place me here"}
            </Button>
          </div>
        )}
        {answered && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-live="polite">
            <CheckCircle2 className="size-4 text-primary" /> Thanks! You can change your answer until the host closes it.
          </p>
        )}
        {results && results.id === poll.id && (
          <section aria-label="Results" className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-medium">Results</h3>
            <ResultsView results={results} />
          </section>
        )}
      </CardContent>
    </Card>
  )
}

function OpenSpacePicker({ tables, onJoin }: { tables: OpenTable[]; onJoin: (uuid: string) => Promise<unknown> }) {
  const [joining, setJoining] = useState<string | null>(null)
  const [here, setHere] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><LayoutGrid className="size-5" aria-hidden="true" /> Pick a table</CardTitle>
        <CardDescription>Go where the conversation interests you, and move whenever you like.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2" aria-live="polite">
          {tables.map((table) => {
            const full = table.limit > 0 && table.count >= table.limit && here !== table.uuid
            return (
              <li key={table.uuid} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{table.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {table.count} {table.count === 1 ? "person" : "people"}
                    {table.limit > 0 && ` of ${table.limit}`}
                    {full && " · full"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={here === table.uuid ? "secondary" : "default"}
                  disabled={full || joining !== null || here === table.uuid}
                  onClick={() => {
                    setJoining(table.uuid)
                    setError(null)
                    onJoin(table.uuid)
                      .then(() => setHere(table.uuid))
                      .catch(() => setError(`Couldn't join ${table.name}.`))
                      .finally(() => setJoining(null))
                  }}
                >
                  {joining === table.uuid && <Loader2 className="animate-spin" />}
                  {here === table.uuid ? "You're here" : "Join"}
                </Button>
              </li>
            )
          })}
        </ul>
        {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

function HarvestView({ items }: { items: HarvestItem[] }) {
  const byRoom = new Map<string, string[]>()
  for (const item of items) byRoom.set(item.room, [...(byRoom.get(item.room) ?? []), item.text])
  return (
    <Card role="status">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sprout className="size-5" aria-hidden="true" /> What the groups found</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {[...byRoom].map(([room, texts]) => (
            <li key={room}>
              <h3 className="text-sm font-medium">{room}</h3>
              <ul className="mt-1 space-y-1">
                {texts.map((text, i) => (
                  <li key={i} className="rounded-md bg-muted px-3 py-2 text-sm">{text}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </CardContent>
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

  if (session.tables) {
    return (
      <>
        {seatBanner}
        <OpenSpacePicker tables={session.tables} onJoin={session.joinTable} />
      </>
    )
  }

  if (session.poll) {
    return <PollCard poll={session.poll} myVote={session.myVote} results={session.results} onVote={session.vote} />
  }

  if (session.round) {
    return (
      <>
        {seatBanner}
        <RoundCard
          round={session.round}
          warning={session.warning}
          station={session.station}
          insightsSent={session.insightsSent}
          onInsight={session.sendInsight}
        />
      </>
    )
  }

  if (session.harvest && session.harvest.length > 0) {
    return <HarvestView items={session.harvest} />
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
