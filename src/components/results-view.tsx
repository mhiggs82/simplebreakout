import type { PulseResults } from "@/lib/messages"

function Bars({ labels, counts }: { labels: string[]; counts: number[] }) {
  const max = Math.max(1, ...counts)
  const total = counts.reduce((a, b) => a + b, 0)
  return (
    <ul className="space-y-2" aria-label="Results">
      {labels.map((label, i) => (
        <li key={label + i} className="space-y-1">
          <div className="flex justify-between gap-2 text-sm">
            <span>{label}</span>
            <span className="tabular-nums text-muted-foreground">
              {counts[i] ?? 0}
              {total > 0 && ` · ${Math.round(((counts[i] ?? 0) / total) * 100)}%`}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${((counts[i] ?? 0) / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Words sized by how often they were given; also a plain list for screen readers. */
export function WordCloud({
  words,
  onHide,
}: {
  words: [string, number][]
  onHide?: (word: string) => void
}) {
  if (words.length === 0) return <p className="text-sm text-muted-foreground">No words yet.</p>
  const max = Math.max(...words.map(([, n]) => n))
  return (
    <ul className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 py-2" aria-label="Word cloud">
      {words.map(([word, count]) => {
        const scale = 0.85 + (count / max) * 1.4
        const label = `${word}, ${count}`
        return (
          <li key={word} style={{ fontSize: `${scale}rem`, opacity: 0.55 + (count / max) * 0.45 }} className="font-medium leading-tight">
            {onHide ? (
              <button
                type="button"
                className="rounded hover:line-through focus-visible:outline-2"
                aria-label={`Hide ${label}`}
                title="Hide this word"
                onClick={() => onHide(word)}
              >
                {word}
              </button>
            ) : (
              <span aria-label={label}>{word}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** A 1–10 spectrum as a column chart with the end labels underneath. */
function Spectrum({ counts, labels }: { counts: number[]; labels?: [string, string] }) {
  const max = Math.max(1, ...counts)
  return (
    <div>
      <ol className="flex h-28 items-end gap-1" aria-label="Positions from 1 to 10">
        {counts.map((count, i) => (
          <li key={i} className="flex flex-1 flex-col items-center justify-end gap-1" aria-label={`${i + 1}: ${count}`}>
            <span className="text-xs tabular-nums text-muted-foreground">{count || ""}</span>
            <div className="w-full rounded-t bg-primary" style={{ height: `${(count / max) * 80}px`, minHeight: count ? 4 : 0 }} />
            <span className="text-xs text-muted-foreground">{i + 1}</span>
          </li>
        ))}
      </ol>
      {labels && (
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>← {labels[0]}</span>
          <span>{labels[1]} →</span>
        </div>
      )}
    </div>
  )
}

export function ResultsView({ results, onHideWord }: { results: PulseResults; onHideWord?: (word: string) => void }) {
  if (results.kind === "cloud") return <WordCloud words={results.words ?? []} onHide={onHideWord} />
  if (results.kind === "spectrum") return <Spectrum counts={results.counts ?? []} labels={results.labels} />
  return <Bars labels={results.options ?? []} counts={results.counts ?? []} />
}
