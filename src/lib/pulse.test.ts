import { describe, expect, it } from "vitest"

import type { Candidate } from "@/lib/matchmaking/types"
import { groupSimilar, histogram, normalizeWord, pairOpposites, tallyPoll, wordCloud } from "./pulse"

const person = (i: number): Candidate => ({ uuid: `u${i}`, name: `P${i}`, tags: {} })
const rng = () => 0.42

describe("pulse", () => {
  it("tallies poll choices and ignores other vote kinds", () => {
    expect(tallyPoll([{ choice: 0 }, { choice: 1 }, { choice: 1 }, { value: 3 }, { choice: 7 }], 3)).toEqual([1, 2, 0])
  })

  it("normalises word-cloud answers", () => {
    expect(normalizeWord("  Curious!! ")).toBe("curious")
    expect(normalizeWord("Very   VERY tired today honestly")).toBe("very very tired")
    expect(normalizeWord("¿Qué?")).toBe("qué")
  })

  it("counts words, merges variants and hides words", () => {
    const votes = [{ text: "Curious" }, { text: "curious." }, { text: "tired" }, { text: "hopeful" }]
    expect(wordCloud(votes)).toEqual([["curious", 2], ["hopeful", 1], ["tired", 1]])
    expect(wordCloud(votes, new Set(["tired"]))).toEqual([["curious", 2], ["hopeful", 1]])
  })

  it("builds a 1–10 histogram", () => {
    expect(histogram([{ value: 1 }, { value: 10 }, { value: 10 }])).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 2])
  })

  it("pairs the lowest with the highest", () => {
    const points = [1, 9, 4, 6, 2, 10].map((value, i) => ({ person: person(i), value }))
    const plan = pairOpposites(points, [], rng)
    expect(plan.warnings.join(" ")).toMatch(/1 pair\(s\)/) // 4↔6
    const values = plan.rooms.map((r) => r.members.map((m) => points.find((p) => p.person === m)!.value).sort((a, b) => a - b))
    expect(values).toEqual([[1, 10], [2, 9], [4, 6]])
  })

  it("puts an odd middle person into a pair and seats people who didn't answer", () => {
    const points = [1, 5, 10].map((value, i) => ({ person: person(i), value }))
    const plan = pairOpposites(points, [person(9)], rng)
    expect(plan.rooms).toHaveLength(1)
    expect(plan.rooms[0].members).toHaveLength(4)
    expect(plan.rooms[0].name).toBe("Pair 1 · 1↔10")
    expect(plan.warnings).toHaveLength(1)
  })

  it("warns when everyone stands close together", () => {
    const points = [5, 6, 6, 7].map((value, i) => ({ person: person(i), value }))
    expect(pairOpposites(points, [], rng).warnings.join(" ")).toMatch(/2 pair\(s\) are within 2 points/)
  })

  it("groups similar positions and names rooms by range", () => {
    const points = [1, 2, 2, 3, 8, 9, 9, 10].map((value, i) => ({ person: person(i), value }))
    const plan = groupSimilar(points, 4, [], rng)
    expect(plan.rooms.map((r) => r.name)).toEqual(["Positions 1–3", "Positions 8–10"])
  })
})
