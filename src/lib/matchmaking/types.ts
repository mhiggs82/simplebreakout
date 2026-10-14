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
