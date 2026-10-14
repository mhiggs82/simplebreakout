import { CheckCircle2, DoorOpen, Hourglass, Loader2 } from "lucide-react"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useAttendeeSession } from "@/hooks/use-attendee-session"
import type { Answers } from "@/lib/matchmaking/types"
import type { Questionnaire } from "@/lib/messages"
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

export function AttendeePanel({ client }: { client: ZoomClient }) {
  const { questionnaire, submitted, started, submit } = useAttendeeSession(client)

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
            Keep this panel open. If the host asks questions before matching, they'll appear here.
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
