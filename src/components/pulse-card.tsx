import { BarChart3, Cloud, Send, X } from "lucide-react"
import { useId, useState } from "react"

import { ResultsView } from "@/components/results-view"
import { LinesField } from "@/components/round-fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { usePulse } from "@/hooks/use-pulse"

const PRESETS = [
  { kind: "poll" as const, question: "How's your energy right now?", options: ["1 · Running on empty", "2", "3", "4", "5 · Fully charged"] },
  { kind: "poll" as const, question: "How clear is this so far?", options: ["Crystal clear", "Mostly", "A bit foggy", "Lost"] },
  { kind: "cloud" as const, question: "One word for how you're arriving today", options: [] },
  { kind: "cloud" as const, question: "One word to sum up this session", options: [] },
]

export function PulseCard({ pulse, people }: { pulse: ReturnType<typeof usePulse>; people: number }) {
  const questionId = useId()
  const [kind, setKind] = useState<"poll" | "cloud">("poll")
  const [question, setQuestion] = useState("")
  const [options, setOptions] = useState<string[]>(["Yes", "No", "Not sure"])
  const live = pulse.question && pulse.question.kind !== "spectrum" ? pulse.question : null
  const canAsk = question.trim().length > 0 && (kind === "cloud" || options.length >= 2)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Polls & word cloud</CardTitle>
        <CardDescription>
          Quick pulse checks. Answers are anonymous to everyone else, and results stay on your screen until you
          share them.
        </CardDescription>
      </CardHeader>

      {live && pulse.results ? (
        <>
          <CardContent className="space-y-3" aria-live="polite">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{live.question}</p>
              <Badge variant="secondary">
                {pulse.votes.size}/{people} answered
              </Badge>
            </div>
            <ResultsView results={pulse.results} onHideWord={live.kind === "cloud" ? pulse.hideWord : undefined} />
            {live.kind === "cloud" && (
              <p className="text-xs text-muted-foreground">Click a word to hide it before sharing.</p>
            )}
          </CardContent>
          <CardFooter className="grid grid-cols-2 gap-2">
            <Button onClick={() => void pulse.share()}>
              <Send /> {pulse.shared ? "Share again" : "Share results"}
            </Button>
            <Button variant="outline" onClick={() => void pulse.close()}>
              <X /> Close question
            </Button>
          </CardFooter>
        </>
      ) : (
        <>
          <CardContent className="space-y-4">
            <Tabs value={kind} onValueChange={(v) => setKind(v as "poll" | "cloud")}>
              <TabsList className="w-full">
                <TabsTrigger value="poll"><BarChart3 /> Poll</TabsTrigger>
                <TabsTrigger value="cloud"><Cloud /> Word cloud</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="space-y-1.5">
              <Label htmlFor={questionId}>Question</Label>
              <Input
                id={questionId}
                value={question}
                maxLength={150}
                placeholder={kind === "poll" ? "How confident do you feel about…?" : "One word for…"}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>
            {kind === "poll" && (
              <LinesField
                label="Options"
                hint="One per line, 2–6."
                value={options}
                maxLength={40}
                onChange={(next) => setOptions(next.slice(0, 6))}
              />
            )}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Quick starts</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <Button
                    key={preset.question}
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      setKind(preset.kind)
                      setQuestion(preset.question)
                      if (preset.kind === "poll") setOptions(preset.options)
                    }}
                  >
                    {preset.question}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              size="lg"
              className="h-12 w-full text-base"
              disabled={!canAsk}
              onClick={() =>
                void pulse.ask(
                  kind === "poll"
                    ? { kind, question: question.trim(), options }
                    : { kind, question: question.trim() },
                )
              }
            >
              <Send /> Ask everyone
            </Button>
          </CardFooter>
        </>
      )}
    </Card>
  )
}
