import type { ActivitySettings } from "@/hooks/use-activity-settings"
import type { CategoryDef, MatchConfig } from "@/lib/matchmaking/types"

/** A ready-made lesson stage: one click picks the format and fills in sensible settings. */
export interface LessonPreset {
  id: string
  label: string
  /** When to use it, in a teacher's words. */
  description: string
  apply: (activities: ActivitySettings, config: MatchConfig) => { activities: ActivitySettings; config: MatchConfig }
}

const LEVEL: CategoryDef = { id: "level", label: "Level", options: ["A2", "B1", "B2", "C1"] }

const quickPairs = (activities: ActivitySettings, rounds: number, minutes: number, prompts: string[]): ActivitySettings => ({
  ...activities,
  activity: "speed",
  speed: { ...activities.speed, groupSize: 2, rounds, minutes, prompts },
})

export const LESSON_PRESETS: LessonPreset[] = [
  {
    id: "pairCheck",
    label: "Pair check",
    description: "After a task: compare answers with a partner (3 min).",
    apply: (activities, config) => ({
      activities: quickPairs(activities, 1, 3, ["Compare your answers. Where you disagree, explain why."]),
      config,
    }),
  },
  {
    id: "rolePlay",
    label: "Role-play pairs",
    description: "Students choose A or B, then act out the situation (6 min).",
    apply: (activities, config) => ({
      activities: quickPairs(activities, 1, 6, [
        "Decide who is Student A and who is Student B. Read your role, then start the role-play.",
      ]),
      config,
    }),
  },
  {
    id: "fluency",
    label: "Fluency practice",
    description: "Same speaking task, a new partner each round (3 × 2 min).",
    apply: (activities, config) => ({
      activities: quickPairs(activities, 3, 2, [
        "Tell your partner about the topic. Your partner listens and asks one question.",
        "New partner: tell it again, with more detail.",
        "New partner: tell it one last time, faster and more fluently.",
      ]),
      config,
    }),
  },
  {
    id: "mixedLevels",
    label: "Mixed-level groups",
    description: "Groups of 3 with a mix of levels. Set each student's level in Participants.",
    apply: (activities, config) => ({
      activities: { ...activities, activity: "match" },
      config: {
        ...config,
        mode: "attributes",
        groupSize: 3,
        attributeStrategy: "diverse",
        categories: config.categories.some((c) => c.id === LEVEL.id) ? config.categories : [LEVEL, ...config.categories],
        matchOn: [LEVEL.id],
      },
    }),
  },
  {
    id: "tps",
    label: "Think-Pair-Share",
    description: "Think alone, discuss in pairs, then share with the class.",
    apply: (activities, config) => ({ activities: { ...activities, activity: "tps" }, config }),
  },
]
