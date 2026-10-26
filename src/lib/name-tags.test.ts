import { describe, expect, it } from "vitest"

import type { MatchConfig } from "@/lib/matchmaking/types"
import { answersFromName, nameTagInstructions, tagPart } from "@/lib/name-tags"

const config: MatchConfig = {
  mode: "attributes",
  groupSize: 4,
  roles: [
    { id: "mentor", label: "Mentor" },
    { id: "mentee", label: "Mentee" },
  ],
  anchorRoleId: null,
  categories: [
    { id: "country", label: "Country", options: ["Netherlands", "Saudi Arabia", "Jordan", "Other"] },
    { id: "teen", label: "Teen's age", options: ["12–13", "14–15", "16–17", "18+"] },
  ],
  matchOn: ["country", "teen"],
  attributeStrategy: "similar",
  roomLabels: [],
}

describe("name tags", () => {
  it("reads answers after a separator, ignoring case and dash style", () => {
    expect(answersFromName("Aisha - saudi arabia, 14-15", config)).toEqual({ roleId: undefined, tags: { country: "Saudi Arabia", teen: "14–15" } })
    expect(answersFromName("Sam (Netherlands 18+)", config).tags).toEqual({ country: "Netherlands", teen: "18+" })
    expect(answersFromName("Lee | Mentee", config).roleId).toBe("mentee")
  })

  it("ignores the first name and names without tags", () => {
    expect(answersFromName("Jordan Smith", config)).toEqual({ tags: {} })
    expect(answersFromName("Jordan - Netherlands", config).tags).toEqual({ country: "Netherlands" })
    expect(tagPart("Mary-Ann Jones")).toBe("")
  })

  it("only accepts whole answers", () => {
    expect(answersFromName("Sam - Netherlandsish 1213", config).tags).toEqual({})
  })

  it("explains what to add for the current mode", () => {
    expect(nameTagInstructions(config)).toContain('"Sam - Netherlands, 12–13"')
    expect(nameTagInstructions({ ...config, mode: "roles" })).toContain("Mentor, Mentee")
    expect(nameTagInstructions({ ...config, mode: "random" })).toBeNull()
  })
})
