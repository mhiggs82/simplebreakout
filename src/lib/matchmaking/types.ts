export type MatchMode = "random" | "roles" | "attributes"

/** A role participants pick for themselves, e.g. "Table Host" or "Table Guest". */
export interface RoleDef {
  id: string
  label: string
}

/** A host-defined question with fixed answers, e.g. Language → English, Spanish. */
export interface CategoryDef {
  id: string
  label: string
  options: string[]
}

export type AttributeStrategy = "similar" | "diverse"

export interface MatchConfig {
  mode: MatchMode
  /** Target number of people per room. Rooms never drop below it unless there are too few people. */
  groupSize: number
  roles: RoleDef[]
  /** Roles mode: give every member of this role their own room (e.g. one Table Host per table). */
  anchorRoleId: string | null
  categories: CategoryDef[]
  /** Attributes mode: category ids to match on, highest priority first. */
  matchOn: string[]
  /** Attributes mode: put alike people together, or spread each answer across rooms. */
  attributeStrategy: AttributeStrategy
  /** Names for rooms that would otherwise be numbered ("Room 1", "Table 2"…), used in order. */
  roomLabels: string[]
}

/** A participant's answers to the role / category questions. */
export interface Answers {
  roleId?: string
  /** category id → selected option */
  tags: Record<string, string>
}

export interface Candidate extends Answers {
  uuid: string
  name: string
}

export interface PlannedRoom {
  name: string
  members: Candidate[]
}

export interface MatchPlan {
  rooms: PlannedRoom[]
  warnings: string[]
}

/** The facilitation format the host is running. */
export type Activity =
  | "match"
  | "cafe"
  | "speed"
  | "fishbowl"
  | "oneTwoFour"
  | "openSpace"
  | "tps"
  | "pulse"
  | "spectrum"
  | "gallery"

/** Activities driven by the round runner (timed steps). */
export type TimedActivity = "cafe" | "speed" | "oneTwoFour" | "tps" | "gallery" | "spectrum"

export const TIMED_ACTIVITIES: readonly TimedActivity[] = ["cafe", "speed", "oneTwoFour", "tps", "gallery", "spectrum"]

/** A named World Café table. Pinned people (e.g. the Table Host) stay put every round. */
export interface TableDef {
  id: string
  name: string
  pinned: string[]
}

export interface RoundSettings {
  rounds: number
  minutes: number
  /** One prompt per round; the last one repeats if there are more rounds than prompts. */
  prompts: string[]
}
