import { describe, expect, it } from "vitest"

import { DEFAULT_ACTIVITY_SETTINGS } from "@/hooks/use-activity-settings"
import { DEFAULT_CONFIG } from "@/hooks/use-host-session"
import { LESSON_PRESETS } from "@/lib/lesson-presets"
import { questionnaireFor } from "@/lib/messages"

const preset = (id: string) => LESSON_PRESETS.find((p) => p.id === id)!

describe("quick start presets", () => {
  it.each(LESSON_PRESETS)("$label gives usable settings", (p) => {
    const { activities, config } = p.apply(DEFAULT_ACTIVITY_SETTINGS, DEFAULT_CONFIG)
    expect(activities.speed.rounds).toBeGreaterThanOrEqual(1)
    expect(config.groupSize).toBeGreaterThanOrEqual(2)
    expect(config.categories.length).toBeLessThanOrEqual(6)
    for (const id of config.matchOn) expect(config.categories.some((c) => c.id === id)).toBe(true)
    if (config.anchorRoleId) expect(config.roles.some((r) => r.id === config.anchorRoleId)).toBe(true)
  })

  it("Parents like me matches on country, city and teen's age, adding them if they were deleted", () => {
    const { config } = preset("parents").apply(DEFAULT_ACTIVITY_SETTINGS, { ...DEFAULT_CONFIG, categories: [], matchOn: [] })
    expect(config).toMatchObject({ mode: "attributes", attributeStrategy: "similar", matchOn: ["country", "city", "teenAge"] })
    expect(questionnaireFor(config, "s")?.categories.map((c) => c.id)).toEqual(["country", "city", "teenAge"])
  })

  it("Parents like me keeps the host's own options for those questions", () => {
    const categories = [{ id: "city", label: "City", options: ["Utrecht", "Other"] }]
    const { config } = preset("parents").apply(DEFAULT_ACTIVITY_SETTINGS, { ...DEFAULT_CONFIG, categories })
    expect(config.categories.find((c) => c.id === "city")?.options).toEqual(["Utrecht", "Other"])
  })
})
