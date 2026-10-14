import { roomCount, shuffle, type Rng } from "@/lib/matchmaking/engine"
import type { Candidate, MatchPlan } from "@/lib/matchmaking/types"
import type { Vote } from "@/lib/messages"

export const SPECTRUM_MIN = 1
export const SPECTRUM_MAX = 10

/** Count each person's latest choice per option. */
export function tallyPoll(votes: Iterable<Vote>, optionCount: number): number[] {
  const counts = Array.from({ length: optionCount }, () => 0)
  for (const vote of votes) {
    if ("choice" in vote && vote.choice >= 0 && vote.choice < optionCount) counts[vote.choice]++
  }
  return counts
}

/** Normalise a word-cloud answer: lower case, at most 3 words / 30 characters, no edge punctuation. */
export function normalizeWord(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .slice(0, 30)
}

/** [word, count] pairs, most frequent first (ties alphabetical). */
export function wordCloud(votes: Iterable<Vote>, hidden: Set<string> = new Set()): [string, number][] {
  const counts = new Map<string, number>()
  for (const vote of votes) {
    if (!("text" in vote)) continue
    const word = normalizeWord(vote.text)
    if (word && !hidden.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

/** Count per spectrum value 1–10. */
export function histogram(votes: Iterable<Vote>): number[] {
  const counts = Array.from({ length: SPECTRUM_MAX }, () => 0)
  for (const vote of votes) {
    if ("value" in vote && vote.value >= SPECTRUM_MIN && vote.value <= SPECTRUM_MAX) counts[vote.value - 1]++
  }
  return counts
}

export interface SpectrumPoint {
  person: Candidate
  value: number
}

function placeUnanswered(rooms: Candidate[][], unanswered: Candidate[], rng: Rng) {
  for (const person of shuffle(unanswered, rng)) {
    rooms.reduce((min, g) => (g.length < min.length ? g : min)).push(person)
  }
}

/**
 * Spectrum: pair the lowest with the highest, the next lowest with the next
 * highest, and so on. An odd person out joins the middle pair. People who
 * didn't answer fill the smallest rooms.
 */
export function pairOpposites(points: SpectrumPoint[], unanswered: Candidate[] = [], rng: Rng = Math.random): MatchPlan {
  const sorted = shuffle(points, rng).sort((a, b) => a.value - b.value)
  if (sorted.length + unanswered.length < 2) return { rooms: [], warnings: ["At least 2 participants are needed to make rooms."] }
  const rooms: Candidate[][] = []
  for (let i = 0, j = sorted.length - 1; i < j; i++, j--) rooms.push([sorted[i].person, sorted[j].person])
  if (sorted.length % 2 === 1) {
    const middle = sorted[(sorted.length - 1) / 2].person
    if (rooms.length > 0) rooms[Math.floor((rooms.length - 1) / 2)].push(middle)
    else rooms.push([middle])
  }
  if (rooms.length === 0) rooms.push([])
  placeUnanswered(rooms, unanswered, rng)
  return {
    rooms: rooms.map((members, i) => ({ name: `Pair ${i + 1}`, members })),
    warnings: unanswered.length > 0 ? [`${unanswered.length} participant(s) didn't answer and were added to rooms.`] : [],
  }
}

/** Spectrum: people with similar positions together, rooms named by their range. */
export function groupSimilar(
  points: SpectrumPoint[],
  groupSize: number,
  unanswered: Candidate[] = [],
  rng: Rng = Math.random,
): MatchPlan {
  const total = points.length + unanswered.length
  if (total < 2) return { rooms: [], warnings: ["At least 2 participants are needed to make rooms."] }
  const sorted = shuffle(points, rng).sort((a, b) => a.value - b.value)
  const count = Math.max(1, Math.min(roomCount(total, groupSize), sorted.length || 1))
  const size = Math.floor(sorted.length / count)
  const extra = sorted.length % count
  const groups: SpectrumPoint[][] = []
  let start = 0
  for (let i = 0; i < count; i++) {
    const end = start + size + (i < extra ? 1 : 0)
    groups.push(sorted.slice(start, end))
    start = end
  }
  const rooms = groups.map((g) => g.map((p) => p.person))
  placeUnanswered(rooms, unanswered, rng)
  const seen = new Map<string, number>()
  return {
    rooms: groups.map((g, i) => {
      const lo = g[0]?.value
      const hi = g.at(-1)?.value
      const base = lo === undefined ? `Group ${i + 1}` : lo === hi ? `Position ${lo}` : `Positions ${lo}–${hi}`
      const n = (seen.get(base) ?? 0) + 1
      seen.set(base, n)
      return { name: n === 1 ? base : `${base} (${n})`, members: rooms[i] }
    }),
    warnings: unanswered.length > 0 ? [`${unanswered.length} participant(s) didn't answer and were added to rooms.`] : [],
  }
}
