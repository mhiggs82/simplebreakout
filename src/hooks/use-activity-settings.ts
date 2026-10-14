import { useEffect, useState } from "react"

import type { Activity, RoundSettings, TableDef } from "@/lib/matchmaking/types"

export interface CafeSettings extends RoundSettings {
  tables: TableDef[]
}

export interface SpeedSettings extends RoundSettings {
  groupSize: number
  roomLabels: string[]
}

export interface FishbowlSettings {
  seats: number
}

export interface ActivitySettings {
  activity: Activity
  cafe: CafeSettings
  speed: SpeedSettings
  fishbowl: FishbowlSettings
}

export const ICEBREAKERS = [
  "What's something you're looking forward to this month?",
  "What's a small win you had this week?",
  "What's one thing people usually get wrong about your work?",
  "Share a book, show or podcast you'd recommend, and why.",
  "What's a question you wish more people asked you?",
]

export const DEFAULT_ACTIVITY_SETTINGS: ActivitySettings = {
  activity: "match",
  cafe: {
    tables: [
      { id: "t1", name: "Table 1", pinned: [] },
      { id: "t2", name: "Table 2", pinned: [] },
      { id: "t3", name: "Table 3", pinned: [] },
      { id: "t4", name: "Table 4", pinned: [] },
    ],
    rounds: 3,
    minutes: 15,
    prompts: [
      "What question, if answered, would make the biggest difference here?",
      "What patterns are you hearing across tables?",
      "What's one thing we could try next week?",
    ],
  },
  speed: { groupSize: 2, rounds: 5, minutes: 3, prompts: ICEBREAKERS.slice(0, 3), roomLabels: [] },
  fishbowl: { seats: 4 },
}

const STORAGE_KEY = "simplebreakout.activities.v1"

function load(): ActivitySettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")
    if (saved && typeof saved === "object" && Array.isArray(saved.cafe?.tables)) {
      return {
        ...DEFAULT_ACTIVITY_SETTINGS,
        ...saved,
        cafe: { ...DEFAULT_ACTIVITY_SETTINGS.cafe, ...saved.cafe },
        speed: { ...DEFAULT_ACTIVITY_SETTINGS.speed, ...saved.speed },
        fishbowl: { ...DEFAULT_ACTIVITY_SETTINGS.fishbowl, ...saved.fishbowl },
      }
    }
  } catch {
    // Storage unavailable or corrupt: use defaults.
  }
  return DEFAULT_ACTIVITY_SETTINGS
}

/**
 * Activity choice and per-activity settings, remembered on this device.
 * Pinned people are meeting-specific, so they aren't saved.
 */
export function useActivitySettings() {
  const [settings, setSettings] = useState<ActivitySettings>(load)

  useEffect(() => {
    try {
      const portable = {
        ...settings,
        cafe: { ...settings.cafe, tables: settings.cafe.tables.map((t) => ({ ...t, pinned: [] })) },
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(portable))
    } catch {
      // Ignore: persistence is a convenience.
    }
  }, [settings])

  return [settings, setSettings] as const
}
