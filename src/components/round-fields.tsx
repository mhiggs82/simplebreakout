import { Sparkles } from "lucide-react"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { RoundSettings } from "@/lib/matchmaking/types"

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        {hint && <p id={`${id}-hint`} className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      <Input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        type="number"
        min={min}
        max={max}
        className="w-20"
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
      />
    </div>
  )
}

/**
 * A list edited as one item per line. Committed on blur so typing isn't
 * disrupted; blank lines are kept while typing and dropped on commit.
 */
export function LinesField({
  label,
  hint,
  value,
  onChange,
  maxLength = 200,
  placeholder,
}: {
  label: string
  hint?: string
  value: string[]
  onChange: (lines: string[]) => void
  maxLength?: number
  placeholder?: string
}) {
  const id = useId()
  const [text, setText] = useState(value.join("\n"))
  const [synced, setSynced] = useState(value)
  // Pick up changes made elsewhere (e.g. "Add icebreakers").
  if (synced !== value) {
    setSynced(value)
    setText(value.join("\n"))
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hint && <p id={`${id}-hint`} className="text-sm text-muted-foreground">{hint}</p>}
      <Textarea
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        rows={3}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() =>
          onChange(
            text
              .split("\n")
              .map((line) => line.trim().slice(0, maxLength))
              .filter(Boolean),
          )
        }
      />
    </div>
  )
}

export function RoundFields({
  value,
  onChange,
  roundsLabel = "Rounds",
  icebreakers,
}: {
  value: RoundSettings
  onChange: (next: RoundSettings) => void
  roundsLabel?: string
  icebreakers?: string[]
}) {
  return (
    <div className="space-y-4">
      <NumberField
        label={roundsLabel}
        value={value.rounds}
        min={1}
        max={20}
        onChange={(rounds) => onChange({ ...value, rounds })}
      />
      <NumberField
        label="Minutes per round"
        value={value.minutes}
        min={1}
        max={120}
        onChange={(minutes) => onChange({ ...value, minutes })}
      />
      <LinesField
        label="Round prompts"
        hint="One per line, shown in everyone's app panel as each round starts. The last one repeats."
        value={value.prompts}
        placeholder="What brought you here today?"
        onChange={(prompts) => onChange({ ...value, prompts })}
      />
      {icebreakers && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...value, prompts: [...new Set([...value.prompts, ...icebreakers])] })}
        >
          <Sparkles /> Add icebreakers
        </Button>
      )}
    </div>
  )
}

export { NumberField }

/** Minutes + prompt for one named step (1-2-4-All, Think-Pair-Share). */
export function StepFields({
  title,
  where,
  value,
  onChange,
}: {
  title: string
  where: string
  value: { minutes: number; prompt: string }
  onChange: (next: { minutes: number; prompt: string }) => void
}) {
  const id = useId()
  return (
    <fieldset className="space-y-2 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">
        {title} <span className="font-normal text-muted-foreground">· {where}</span>
      </legend>
      <NumberField
        label="Minutes"
        value={value.minutes}
        min={1}
        max={60}
        onChange={(minutes) => onChange({ ...value, minutes })}
      />
      <Label htmlFor={id} className="sr-only">
        {title} prompt
      </Label>
      <Input
        id={id}
        value={value.prompt}
        maxLength={200}
        placeholder="Prompt shown to everyone"
        onChange={(e) => onChange({ ...value, prompt: e.target.value })}
      />
    </fieldset>
  )
}
