import { describe, expect, it } from "vitest"

import { buildMatchPlan, MAX_ROOMS, roomCount } from "./engine"
import type { Candidate, MatchConfig } from "./types"

// Deterministic RNG (mulberry32) so shuffles are reproducible.
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const base: MatchConfig = {
  mode: "random",
  groupSize: 4,
  roles: [
    { id: "host", label: "Table Host" },
    { id: "guest", label: "Table Guest" },
  ],
  anchorRoleId: null,
  categories: [
    { id: "lang", label: "Language", options: ["English", "Spanish"] },
    { id: "age", label: "Child's age", options: ["0-4", "5-11", "12-18"] },
  ],
  matchOn: ["lang", "age"],
  attributeStrategy: "similar",
  roomLabels: [],
}

function people(count: number, make: (i: number) => Partial<Candidate> = () => ({})): Candidate[] {
  return Array.from({ length: count }, (_, i) => ({
    uuid: `u${i}`,
    name: `Person ${i}`,
    tags: {},
    ...make(i),
  }))
}

function allUuids(plan: ReturnType<typeof buildMatchPlan>) {
  return plan.rooms.flatMap((r) => r.members.map((m) => m.uuid)).sort()
}

describe("roomCount", () => {
  it("never makes rooms smaller than the group size", () => {
    expect(roomCount(10, 4)).toBe(2)
    expect(roomCount(8, 4)).toBe(2)
    expect(roomCount(3, 4)).toBe(1)
    expect(roomCount(1000, 2)).toBe(MAX_ROOMS)
  })
})

describe("random mode", () => {
  it("places everyone exactly once in balanced rooms", () => {
    const input = people(11)
    const plan = buildMatchPlan(input, { ...base, groupSize: 3 }, seeded(1))
    expect(allUuids(plan)).toEqual(input.map((p) => p.uuid).sort())
    const sizes = plan.rooms.map((r) => r.members.length)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(3)
  })

  it("needs at least two people", () => {
    const plan = buildMatchPlan(people(1), base)
    expect(plan.rooms).toEqual([])
    expect(plan.warnings).toHaveLength(1)
  })

  it("gives every room a unique name", () => {
    const plan = buildMatchPlan(people(40), { ...base, groupSize: 2 }, seeded(2))
    const names = plan.rooms.map((r) => r.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe("roles mode", () => {
  const roles: MatchConfig = { ...base, mode: "roles", anchorRoleId: "host" }

  it("gives each anchor their own room and spreads guests evenly", () => {
    const input = people(15, (i) => ({ roleId: i < 3 ? "host" : "guest" }))
    const plan = buildMatchPlan(input, roles, seeded(3))
    expect(plan.rooms).toHaveLength(3)
    for (const room of plan.rooms) {
      expect(room.members.filter((m) => m.roleId === "host")).toHaveLength(1)
      expect(room.members.filter((m) => m.roleId === "guest")).toHaveLength(4)
      expect(room.name).toMatch(/^Table Host: /)
    }
    expect(allUuids(plan)).toEqual(input.map((p) => p.uuid).sort())
  })

  it("balances every role across rooms when there is no anchor", () => {
    const input = people(12, (i) => ({ roleId: i % 4 === 0 ? "host" : "guest" }))
    const plan = buildMatchPlan(input, { ...roles, anchorRoleId: null }, seeded(4))
    expect(plan.rooms).toHaveLength(3)
    for (const room of plan.rooms) {
      expect(room.members.filter((m) => m.roleId === "host")).toHaveLength(1)
      expect(room.members).toHaveLength(4)
    }
  })

  it("falls back to group size when nobody picked the anchor role", () => {
    const input = people(8, () => ({ roleId: "guest" }))
    const plan = buildMatchPlan(input, roles, seeded(5))
    expect(plan.rooms).toHaveLength(2)
    expect(plan.warnings.join(" ")).toMatch(/Nobody picked/)
  })

  it("spreads people without a role and warns about them", () => {
    const input = people(9, (i) => ({ roleId: i < 3 ? "host" : undefined }))
    const plan = buildMatchPlan(input, roles, seeded(6))
    expect(plan.rooms.map((r) => r.members.length)).toEqual([3, 3, 3])
    expect(plan.warnings.join(" ")).toMatch(/no role/)
  })
})

describe("attributes mode", () => {
  const attrs: MatchConfig = { ...base, mode: "attributes", groupSize: 2 }

  it("groups people with identical answers together", () => {
    const input = people(8, (i) => ({
      tags: { lang: i < 4 ? "English" : "Spanish", age: i % 2 === 0 ? "0-4" : "5-11" },
    }))
    const plan = buildMatchPlan(input, attrs, seeded(7))
    expect(plan.rooms).toHaveLength(4)
    for (const room of plan.rooms) {
      const keys = new Set(room.members.map((m) => `${m.tags.lang}|${m.tags.age}`))
      expect(keys.size).toBe(1)
    }
    expect(plan.rooms.map((r) => r.name).sort()).toEqual([
      "English · 0-4",
      "English · 5-11",
      "Spanish · 0-4",
      "Spanish · 5-11",
    ])
  })

  it("relaxes the lowest-priority attribute for leftovers", () => {
    // Three English speakers with different ages: no exact pair exists, but
    // they still share a language.
    const input = people(3, (i) => ({ tags: { lang: "English", age: base.categories[1].options[i] } }))
    const plan = buildMatchPlan(input, attrs, seeded(8))
    expect(plan.rooms).toHaveLength(1)
    expect(plan.rooms[0].name).toBe("English")
    expect(plan.rooms[0].members).toHaveLength(3)
  })

  it("places people with no answers into existing rooms", () => {
    const input = [
      ...people(4, () => ({ tags: { lang: "English", age: "0-4" } })),
      { uuid: "x", name: "No answers", tags: {} },
    ]
    const plan = buildMatchPlan(input, attrs, seeded(9))
    expect(allUuids(plan)).toContain("x")
    expect(plan.rooms).toHaveLength(2)
  })

  it("spreads answers across rooms in diverse mode", () => {
    const input = people(8, (i) => ({ tags: { lang: i < 4 ? "English" : "Spanish" } }))
    const plan = buildMatchPlan(
      input,
      { ...attrs, groupSize: 4, matchOn: ["lang"], attributeStrategy: "diverse" },
      seeded(10),
    )
    expect(plan.rooms).toHaveLength(2)
    for (const room of plan.rooms) {
      expect(room.members.filter((m) => m.tags.lang === "English")).toHaveLength(2)
    }
  })

  it("falls back to random when no attribute is selected", () => {
    const plan = buildMatchPlan(people(6), { ...attrs, matchOn: [] }, seeded(11))
    expect(plan.rooms).toHaveLength(3)
    expect(plan.warnings.join(" ")).toMatch(/No attributes/)
  })

  it("never exceeds Zoom's room limit", () => {
    const input = people(120, (i) => ({ tags: { lang: `L${i % 60}` } }))
    const plan = buildMatchPlan(input, { ...attrs, matchOn: ["lang"] }, seeded(12))
    expect(plan.rooms.length).toBeLessThanOrEqual(MAX_ROOMS)
    expect(allUuids(plan)).toHaveLength(120)
  })
})

describe("attributes mode, partial matches", () => {
  it("keeps people who share the top attribute together when exact matches run out", () => {
    // Pairs that share a language but every age differs, so no exact pairs exist.
    const ages = ["0-4", "5-11", "12-18"]
    const input = people(6, (i) => ({
      tags: { lang: i < 3 ? "English" : "Spanish", age: ages[i % 3] },
    }))
    const plan = buildMatchPlan(input, { ...base, mode: "attributes", groupSize: 3 }, seeded(13))
    expect(plan.rooms.map((r) => r.name).sort()).toEqual(["English", "Spanish"])
  })

  it("warns when too few anchors make rooms very large", () => {
    const input = people(20, (i) => ({ roleId: i === 0 ? "host" : "guest" }))
    const plan = buildMatchPlan(input, { ...base, mode: "roles", anchorRoleId: "host" }, seeded(14))
    expect(plan.rooms).toHaveLength(1)
    expect(plan.warnings.join(" ")).toMatch(/about 20 people/)
  })
})

describe("room names", () => {
  it("ignore members without answers when naming a room", () => {
    const input = [
      ...people(4, () => ({ tags: { lang: "English", age: "0-4" } })),
      { uuid: "x", name: "No answers", tags: {} },
    ]
    const plan = buildMatchPlan(input, { ...base, mode: "attributes", groupSize: 4 }, seeded(15))
    expect(plan.rooms).toHaveLength(1)
    expect(plan.rooms[0].name).toBe("English · 0-4")
  })
})

describe("room labels", () => {
  it("replace numbered names in order and leave the rest numbered", () => {
    const plan = buildMatchPlan(people(8), { ...base, groupSize: 2, roomLabels: ["Lagos", " ", "Lima"] }, seeded(16))
    expect(plan.rooms.map((r) => r.name)).toEqual(["Lagos", "Lima", "Room 3", "Room 4"])
  })

  it("don't rename rooms named after a shared answer", () => {
    const input = people(4, () => ({ tags: { lang: "English", age: "0-4" } }))
    const plan = buildMatchPlan(input, { ...base, mode: "attributes", roomLabels: ["Lagos"] }, seeded(17))
    expect(plan.rooms[0].name).toBe("English · 0-4")
  })
})
