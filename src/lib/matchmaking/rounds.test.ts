import { describe, expect, it } from "vitest"

import { emptyHistory, planCafeRound, planSpeedRound, promptFor, recordRound } from "./rounds"
import type { Candidate, TableDef } from "./types"

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const people = (n: number): Candidate[] =>
  Array.from({ length: n }, (_, i) => ({ uuid: `u${i}`, name: `P${i}`, tags: {} }))

function pairs(plan: ReturnType<typeof planSpeedRound>) {
  return plan.rooms.flatMap((r) =>
    r.members.flatMap((a, i) => r.members.slice(i + 1).map((b) => [a.uuid, b.uuid].sort().join("-"))),
  )
}

describe("planSpeedRound", () => {
  it("never repeats a pair over 7 rounds of 8 people in pairs", () => {
    const rng = seeded(1)
    const history = emptyHistory()
    const seen = new Set<string>()
    for (let round = 0; round < 7; round++) {
      const plan = planSpeedRound(people(8), 2, history, rng)
      expect(plan.rooms).toHaveLength(4)
      for (const pair of pairs(plan)) {
        expect(seen.has(pair)).toBe(false)
        seen.add(pair)
      }
      expect(plan.warnings).toEqual([])
      recordRound(history, plan)
    }
    expect(seen.size).toBe(28) // every possible pair met exactly once
  })

  it("avoids repeats in small groups across several rounds", () => {
    const rng = seeded(2)
    const history = emptyHistory()
    let repeats = 0
    const seen = new Set<string>()
    for (let round = 0; round < 3; round++) {
      const plan = planSpeedRound(people(12), 3, history, rng)
      for (const pair of pairs(plan)) {
        if (seen.has(pair)) repeats++
        seen.add(pair)
      }
      recordRound(history, plan)
    }
    expect(repeats).toBe(0)
  })

  it("warns once repeats become unavoidable", () => {
    const history = emptyHistory()
    const rng = seeded(3)
    recordRound(history, planSpeedRound(people(3), 3, history, rng))
    const plan = planSpeedRound(people(3), 3, history, rng)
    expect(plan.warnings[0]).toMatch(/3 repeat/)
  })

  it("uses room labels in order", () => {
    const plan = planSpeedRound(people(6), 2, emptyHistory(), seeded(4), ["Coffee", "Tea"])
    expect(plan.rooms.map((r) => r.name)).toEqual(["Coffee", "Tea", "Room 3"])
  })
})

describe("planCafeRound", () => {
  const tables: TableDef[] = [
    { id: "a", name: "Sustainability", pinned: ["u0"] },
    { id: "b", name: "Scaling", pinned: ["u1"] },
    { id: "c", name: "Culture", pinned: ["u2"] },
  ]

  it("keeps pinned hosts at their table while travellers visit new tables", () => {
    const rng = seeded(5)
    const history = emptyHistory()
    const everyone = people(12)
    for (let round = 0; round < 3; round++) {
      const plan = planCafeRound(tables, everyone, history, rng)
      expect(plan.rooms.map((r) => r.name)).toEqual(["Sustainability", "Scaling", "Culture"])
      plan.rooms.forEach((room, i) => {
        expect(room.members.map((m) => m.uuid)).toContain(`u${i}`)
        expect(room.members).toHaveLength(4)
      })
      expect(plan.warnings).toEqual([])
      recordRound(history, plan)
    }
    // After 3 rounds with 3 tables, every traveller has sat at every table once.
    for (const person of everyone.slice(3)) {
      expect(history.visited.get(person.uuid)?.size).toBe(3)
    }
  })

  it("warns about revisits when there are more rounds than tables", () => {
    const rng = seeded(6)
    const history = emptyHistory()
    let last
    for (let round = 0; round < 4; round++) {
      last = planCafeRound(tables, people(9), history, rng)
      recordRound(history, last)
    }
    expect(last!.warnings.join(" ")).toMatch(/revisit/)
  })

  it("warns about tables without a host and still fills them", () => {
    const plan = planCafeRound(
      [...tables, { id: "d", name: "Open", pinned: [] }],
      people(11),
      emptyHistory(),
      seeded(7),
    )
    expect(plan.rooms[3].members.length).toBeGreaterThan(0)
    expect(plan.warnings.join(" ")).toMatch(/no pinned host/)
  })
})

describe("promptFor", () => {
  it("repeats the last prompt and skips blanks", () => {
    expect(promptFor(["One", " ", "Two"], 0)).toBe("One")
    expect(promptFor(["One", " ", "Two"], 5)).toBe("Two")
    expect(promptFor([], 0)).toBeUndefined()
  })
})
