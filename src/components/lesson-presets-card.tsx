import { CheckCircle2, Wand2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LESSON_PRESETS, type LessonPreset } from "@/lib/lesson-presets"

/** One-click session steps: picks the format and fills in timings and prompts. */
export function LessonPresetsCard({ onApply }: { onApply: (preset: LessonPreset) => void }) {
  const [applied, setApplied] = useState<LessonPreset | null>(null)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="size-5" aria-hidden="true" /> Quick start
        </CardTitle>
        <CardDescription>New here? Pick one. You can change the details below before you start.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="grid gap-2 sm:grid-cols-2">
          {LESSON_PRESETS.map((preset) => (
            <li key={preset.id}>
              <Button
                variant={applied?.id === preset.id ? "default" : "outline"}
                className="h-auto w-full flex-col items-start gap-0.5 whitespace-normal py-2 text-left"
                aria-pressed={applied?.id === preset.id}
                onClick={() => {
                  onApply(preset)
                  setApplied(preset)
                }}
              >
                <span className="font-medium">{preset.label}</span>
                <span className="text-xs font-normal opacity-80">{preset.description}</span>
              </Button>
            </li>
          ))}
        </ul>
        {applied && (
          <p role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
            {applied.label} is set up. Check the details below, then press the big button.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
