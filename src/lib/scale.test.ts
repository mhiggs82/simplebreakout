import { describe, expect, it } from "vitest"

import { buildMatchPlan, MAX_ROOMS, sizeForRooms, roomCount } from "@/lib/matchmaking/engine"
import { emptyHistory, planCafeRound, planSpeedRound, recordRound } from "@/lib/matchmaking/rounds"
import type { Candidate, MatchConfig, MatchPlan } from "@/lib/matchmaking/types"

/** Big meetings: 100, 500 and 1,000 people, in every grouping mode. */

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const countries = ["Netherlands", "Saudi Arabia", "United Kingdom", "United States", "Other"]
const cities = ["Amsterdam", "Riyadh", "Jeddah", "London", "Other"]
const ages = ["12–13", "14–15", "16–17", "18+"]

const config: MatchConfig = {
  mode: "random",
  groupSize: 4,
  roles: [
    { id: "mentor", label: "Mentor" },
    { id: "mentee", label: "Mentee" },
  ],
  anchorRoleId: null,
  categories: [
    { id: "country", label: "Country", options: countries },
    { id: "city", label: "City", options: cities },
    { id: "teenAge", label: "Teen's age", options: ages },
  ],
  matchOn: ["country", "city", "teenAge"],
  attributeStrategy: "similar",
  roomLabels: [],
}

function crowd(n: number, answered: number, rng: () => number): Candidate[] {
  const pick = <T,>(items: T[]) => items[Math.floor(rng() * items.length)]
  return Array.from({ length: n }, (_, i) => ({
    uuid: `u${i}`,
    name: `Person ${i}`,
    roleId: rng() < 0.2 ? "mentor" : "mentee",
    tags: (rng() < answered ? { country: pick(countries), city: pick(cities), teenAge: pick(ages) } : {}) as Record<string, string>,
  }))
}

function expectSound(plan: MatchPlan, people: Candidate[]) {
  const placed = plan.rooms.flatMap((r) => r.members.map((m) => m.uuid))
  expect(placed).toHaveLength(people.length)
  expect(new Set(placed).size).toBe(people.length)
  expect(plan.rooms.length).toBeLessThanOrEqual(MAX_ROOMS)
  expect(new Set(plan.rooms.map((r) => r.name)).size).toBe(plan.rooms.length)
}

const modes: [string, Partial<MatchConfig>, number][] = [
  ["mix", { mode: "random" }, 1],
  ["mix in pairs", { mode: "random", groupSize: 2 }, 1],
  ["same answers", { mode: "attributes" }, 1],
  ["same answers, 10% answered", { mode: "attributes" }, 0.1],
  ["mixed answers", { mode: "attributes", attributeStrategy: "diverse" }, 1],
  ["by role", { mode: "roles" }, 1],
  ["one room per mentor", { mode: "roles", anchorRoleId: "mentor" }, 1],
]

describe.each([100, 500, 1000])("%i people", (n) => {
  it.each(modes)("%s: everyone placed once, within Zoom's room limit", (_label, overrides, answered) => {
    const rng = seeded(n)
    const people = crowd(n, answered, rng)
    const started = performance.now()
    const plan = buildMatchPlan(people, { ...config, ...overrides }, rng)
    expect(performance.now() - started).toBeLessThan(500)
    expectSound(plan, people)
  })

  it("same answers keeps rooms even (none over 1.5× the average)", () => {
    for (const answered of [1, 0.5, 0.1]) {
      const rng = seeded(n + Math.round(answered * 10))
      const people = crowd(n, answered, rng)
      const plan = buildMatchPlan(people, { ...config, mode: "attributes" }, rng)
      const average = n / plan.rooms.length
      expect(Math.max(...plan.rooms.map((r) => r.members.length))).toBeLessThanOrEqual(Math.ceil(average * 1.5))
    }
  })

  it("warns, in plain words, when Zoom's room limit makes rooms bigger", () => {
    const plan = buildMatchPlan(crowd(n, 1, seeded(1)), { ...config, groupSize: 2 })
    const capped = n / 2 > MAX_ROOMS
    expect(plan.warnings.some((w) => w.includes("Zoom apps can make 50"))).toBe(capped)
  })

  it("plans 3 rounds of pairs quickly, everyone placed each round", () => {
    const people = crowd(n, 0, seeded(2))
    const history = emptyHistory()
    for (let round = 0; round < 3; round++) {
      const started = performance.now()
      const plan = planSpeedRound(people, 2, history, seeded(round))
      expect(performance.now() - started).toBeLessThan(1_500)
      expectSound(plan, people)
      recordRound(history, plan)
    }
  })

  it("rotating tables warn when tables get crowded", () => {
    const tables = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, name: `Table ${i + 1}`, pinned: [] }))
    const plan = planCafeRound(tables, crowd(n, 0, seeded(3)), emptyHistory())
    expect(plan.rooms.flatMap((r) => r.members)).toHaveLength(n)
    expect(plan.warnings.some((w) => w.includes("Add more tables"))).toBe(Math.ceil(n / tables.length) > 15)
  })
})

describe("number of rooms", () => {
  it.each([
    [100, 10],
    [99, 10],
    [37, 5],
    [1000, 50],
  ])("%i people, %i rooms → within one room of the request", (people, rooms) => {
    expect(Math.abs(roomCount(people, sizeForRooms(people, rooms)) - rooms)).toBeLessThanOrEqual(1)
  })
})
