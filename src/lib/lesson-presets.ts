import type { ActivitySettings } from "@/hooks/use-activity-settings"
import type { CategoryDef, MatchConfig } from "@/lib/matchmaking/types"

/** A ready-made session step: one click picks the format and fills in the settings. */
export interface LessonPreset {
  id: string
  label: string
  /** When to use it, in plain words. */
  description: string
  apply: (activities: ActivitySettings, config: MatchConfig) => { activities: ActivitySettings; config: MatchConfig }
}

/** Kept here as well as in the host defaults, so the preset works even if the host deleted them. */
const PARENT_QUESTIONS: CategoryDef[] = [
  { id: "country", label: "Country", options: ["Netherlands", "Saudi Arabia", "United Kingdom", "United States", "Other"] },
  { id: "city", label: "City", options: ["Amsterdam", "Riyadh", "Jeddah", "London", "Other"] },
  { id: "teenAge", label: "Teen's age", options: ["12–13", "14–15", "16–17", "18+"] },
]

const pairs = (activities: ActivitySettings, rounds: number, minutes: number, prompts: string[]): ActivitySettings => ({
  ...activities,
  activity: "speed",
  speed: { ...activities.speed, groupSize: 2, rounds, minutes, prompts },
})

export const LESSON_PRESETS: LessonPreset[] = [
  {
    id: "parents",
    label: "Parents like me",
    description: "Groups of 4 parents with the same country, city and teen's age, or the closest match.",
    apply: (activities, config) => {
      // Parent questions first, in priority order (keeping the host's own options), then any others.
      const ids = new Set(PARENT_QUESTIONS.map((q) => q.id))
      const categories = [
        ...PARENT_QUESTIONS.map((q) => config.categories.find((c) => c.id === q.id) ?? q),
        ...config.categories.filter((c) => !ids.has(c.id)),
      ]
      return {
        activities: { ...activities, activity: "match" },
        config: {
          ...config,
          mode: "attributes",
          groupSize: 4,
          attributeStrategy: "similar",
          categories: categories.slice(0, 6),
          matchOn: PARENT_QUESTIONS.map((q) => q.id),
        },
      }
    },
  },
  {
    id: "pairChat",
    label: "Quick chat in pairs",
    description: "Everyone talks with one other person for 3 minutes.",
    apply: (activities, config) => ({
      activities: pairs(activities, 1, 3, ["What stood out to you from what we just heard?"]),
      config,
    }),
  },
  {
    id: "meetPeople",
    label: "Meet new people",
    description: "3 short chats, with a new partner each time.",
    apply: (activities, config) => ({
      activities: pairs(activities, 3, 3, [
        "Say hello. What brought you here today?",
        "What's one thing that went well for you this week?",
        "What's one small thing you'll try after this session?",
      ]),
      config,
    }),
  },
  {
    id: "mentors",
    label: "Mentors with mentees",
    description: "Each mentor gets their own room, and mentees are shared out.",
    apply: (activities, config) => {
      const roles = [
        { id: "mentor", label: "Mentor" },
        { id: "mentee", label: "Mentee" },
      ]
      return {
        activities: { ...activities, activity: "match" },
        config: { ...config, mode: "roles", roles, anchorRoleId: "mentor" },
      }
    },
  },
  {
    id: "tps",
    label: "Think, pair, share",
    description: "Think alone, talk in pairs, then share with everyone.",
    apply: (activities, config) => ({ activities: { ...activities, activity: "tps" }, config }),
  },
]
