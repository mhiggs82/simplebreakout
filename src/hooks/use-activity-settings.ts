import { useEffect, useState } from "react"

import type { OpenSpaceTable } from "@/hooks/use-open-space"
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

/** A timed step with its own prompt. */
export interface StepSettings {
  minutes: number
  prompt: string
}

/** 1-2-4-All: on your own → pairs → fours → all together. */
export interface OneTwoFourSettings {
  steps: [StepSettings, StepSettings, StepSettings, StepSettings]
}

/** Think-Pair-Share: think alone → pair up (insights harvested) → share in the main room. */
export interface TpsSettings {
  think: StepSettings
  pair: StepSettings
  share: StepSettings
}

export interface GallerySettings {
  stations: string[]
  minutes: number
  prompts: string[]
}

export interface OpenSpaceSettings {
  tables: OpenSpaceTable[]
  /** Close the space after this many minutes; 0 keeps it open. */
  minutes: number
}

export interface ActivitySettings {
  activity: Activity
  cafe: CafeSettings
  speed: SpeedSettings
  fishbowl: FishbowlSettings
  oneTwoFour: OneTwoFourSettings
  tps: TpsSettings
  gallery: GallerySettings
  openSpace: OpenSpaceSettings
}

/** Ready-made speaking tasks for quick pairs. */
export const ICEBREAKERS = [
  "Compare your answers. Where you disagree, explain why.",
  "Tell your partner about a time you… Ask two follow-up questions.",
  "Agree on the three most important points from the presentation.",
  "Use today's new language in three sentences about your own life.",
  "What's still unclear? Agree on one question to ask the teacher.",
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
      "Discuss the question on your table. Note your group's best ideas.",
      "New table: read what the last group said. Agree or disagree?",
      "Final table: summarise the main points to report back.",
    ],
  },
  speed: { groupSize: 2, rounds: 5, minutes: 3, prompts: ICEBREAKERS.slice(0, 3), roomLabels: [] },
  fishbowl: { seats: 4 },
  oneTwoFour: {
    steps: [
      { minutes: 1, prompt: "On your own: what ideas or questions come to mind?" },
      { minutes: 2, prompt: "In pairs: build on each other's ideas." },
      { minutes: 4, prompt: "In fours: which idea stands out? Send it as your key insight." },
      { minutes: 5, prompt: "All together: what did each group discover?" },
    ],
  },
  tps: {
    think: { minutes: 1, prompt: "Think on your own: what's your first reaction?" },
    pair: { minutes: 4, prompt: "Pair up: compare notes and send one key insight." },
    share: { minutes: 5, prompt: "Share: let's hear the insights from each pair." },
  },
  gallery: {
    stations: ["Text A", "Text B", "Text C", "Text D"],
    minutes: 6,
    prompts: ["What is the main idea?", "What did the last group miss?", "Correct or improve one note."],
  },
  openSpace: {
    tables: [
      { id: "o1", name: "Ideas we should try", limit: 6, pinned: [] },
      { id: "o2", name: "Problems to solve", limit: 6, pinned: [] },
      { id: "o3", name: "Wild card", limit: 0, pinned: [] },
    ],
    minutes: 0,
  },
}

const STORAGE_KEY = "simplebreakout.activities.v1"

const ACTIVITIES: readonly Activity[] = ["match", "cafe", "speed", "fishbowl", "oneTwoFour", "openSpace", "tps", "gallery"]

function load(): ActivitySettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")
    if (saved && typeof saved === "object" && Array.isArray(saved.cafe?.tables)) {
      return {
        ...DEFAULT_ACTIVITY_SETTINGS,
        ...saved,
        // Formats that were removed (e.g. polls, spectrum) fall back to Match.
        activity: ACTIVITIES.includes(saved.activity) ? saved.activity : DEFAULT_ACTIVITY_SETTINGS.activity,
        cafe: { ...DEFAULT_ACTIVITY_SETTINGS.cafe, ...saved.cafe },
        speed: { ...DEFAULT_ACTIVITY_SETTINGS.speed, ...saved.speed },
        fishbowl: { ...DEFAULT_ACTIVITY_SETTINGS.fishbowl, ...saved.fishbowl },
        oneTwoFour: { ...DEFAULT_ACTIVITY_SETTINGS.oneTwoFour, ...saved.oneTwoFour },
        tps: { ...DEFAULT_ACTIVITY_SETTINGS.tps, ...saved.tps },
        gallery: { ...DEFAULT_ACTIVITY_SETTINGS.gallery, ...saved.gallery },
        openSpace: { ...DEFAULT_ACTIVITY_SETTINGS.openSpace, ...saved.openSpace },
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
        openSpace: {
          ...settings.openSpace,
          tables: settings.openSpace.tables.map((t) => ({ ...t, pinned: [] })),
        },
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(portable))
    } catch {
      // Ignore: persistence is a convenience.
    }
  }, [settings])

  return [settings, setSettings] as const
}
