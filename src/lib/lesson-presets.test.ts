import { describe, expect, it } from "vitest"

import { DEFAULT_ACTIVITY_SETTINGS } from "@/hooks/use-activity-settings"
import { DEFAULT_CONFIG } from "@/hooks/use-host-session"
import { LESSON_PRESETS } from "@/lib/lesson-presets"
import { questionnaireFor } from "@/lib/messages"

describe("lesson presets", () => {
  it.each(LESSON_PRESETS)("$label gives usable settings", (preset) => {
    const { activities, config } = preset.apply(DEFAULT_ACTIVITY_SETTINGS, DEFAULT_CONFIG)
    expect(activities.speed.rounds).toBeGreaterThanOrEqual(1)
    expect(activities.speed.prompts.length).toBeGreaterThanOrEqual(1)
    expect(config.groupSize).toBeGreaterThanOrEqual(2)
    for (const id of config.matchOn) expect(config.categories.some((c) => c.id === id)).toBe(true)
  })

  it("adds a Level question for mixed-level groups when it's missing", () => {
    const preset = LESSON_PRESETS.find((p) => p.id === "mixedLevels")!
    const { config } = preset.apply(DEFAULT_ACTIVITY_SETTINGS, { ...DEFAULT_CONFIG, categories: [], matchOn: [] })
    expect(config.matchOn).toEqual(["level"])
    expect(questionnaireFor(config, "s")?.categories.map((c) => c.id)).toEqual(["level"])
  })
})
