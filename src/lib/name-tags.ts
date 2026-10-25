import type { Answers, MatchConfig } from "@/lib/matchmaking/types"

/**
 * People without the app can describe themselves in their Zoom name, e.g.
 * "Sam - Mentor" or "Aisha (Netherlands, Amsterdam, 14–15)". Only the part
 * after the first " - ", " | ", " / ", "(" or "[" is read, so a first name
 * that happens to match an answer (e.g. "Jordan") isn't mistaken for one.
 */
const TAG_START = /\s[-–—|/]\s|[([]/

const normalize = (text: string) => text.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim()
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** The part of a display name that holds tags, or "" if there is none. */
export function tagPart(name: string): string {
  const match = TAG_START.exec(name)
  return match ? normalize(name.slice(match.index + 1)) : ""
}

/** The longest of `choices` that appears as a whole word or phrase in `text`. */
function findChoice(text: string, choices: string[]): string | undefined {
  let best: string | undefined
  for (const choice of choices) {
    const needle = normalize(choice)
    if (!needle) continue
    const found = new RegExp(`(^|[^\\p{L}\\p{N}])${escape(needle)}($|[^\\p{L}\\p{N}])`, "u").test(text)
    if (found && (!best || needle.length > normalize(best).length)) best = choice
  }
  return best
}

/** Answers read from a display name. Empty when the name has no recognisable tags. */
export function answersFromName(name: string, config: MatchConfig): Answers {
  const text = tagPart(name)
  if (!text) return { tags: {} }
  const label = findChoice(text, config.roles.map((r) => r.label))
  const roleId = label ? config.roles.find((r) => r.label === label)?.id : undefined
  const tags: Record<string, string> = {}
  for (const category of config.categories) {
    const option = findChoice(text, category.options)
    if (option) tags[category.id] = option
  }
  return { roleId, tags }
}

export const hasAnswers = (answers: Answers) => Boolean(answers.roleId) || Object.keys(answers.tags).length > 0

/** What to ask people to add to their Zoom name, posted to the meeting chat. */
export function nameTagInstructions(config: MatchConfig): string | null {
  if (config.mode === "roles") {
    const roles = config.roles.map((r) => r.label).filter(Boolean)
    if (roles.length === 0) return null
    return `Please add your role to your Zoom name, like this: "Sam - ${roles[0]}". Choose one: ${roles.join(", ")}. (To rename: Participants, then your name, then More, then Rename.)`
  }
  if (config.mode === "attributes") {
    const asked = config.categories.filter((c) => config.matchOn.includes(c.id) && c.options.length > 0)
    if (asked.length === 0) return null
    const example = asked.map((c) => c.options[0]).join(", ")
    const choices = asked.map((c) => `${c.label}: ${c.options.join(" / ")}`).join(". ")
    return `Please add this to your Zoom name, like this: "Sam - ${example}". ${choices}. (To rename: Participants, then your name, then More, then Rename.)`
  }
  return null
}
