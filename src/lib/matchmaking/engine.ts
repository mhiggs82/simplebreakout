import type { Candidate, MatchConfig, MatchPlan, PlannedRoom } from "./types"

/** Zoom allows at most 50 breakout rooms. */
export const MAX_ROOMS = 50
export const MIN_GROUP_SIZE = 2
/** Anchored rooms bigger than this get a warning. */
const LARGE_ROOM = 8

export type Rng = () => number

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Rooms needed so that no room is smaller than `groupSize`; leftovers join
 * existing rooms (10 people at size 4 → rooms of 5 and 5, never 4/4/2).
 */
export function roomCount(people: number, groupSize: number): number {
  return Math.min(MAX_ROOMS, Math.max(1, Math.floor(people / groupSize)))
}

/**
 * Zoom apps can create at most 50 rooms, so big meetings get bigger rooms.
 * Returns a plain-English warning when that happens, otherwise null.
 */
export function roomLimitWarning(people: number, groupSize: number): string | null {
  const needed = Math.floor(people / Math.max(MIN_GROUP_SIZE, groupSize))
  if (needed <= MAX_ROOMS) return null
  return `${people} people in groups of ${groupSize} would need ${needed} rooms. Zoom apps can make ${MAX_ROOMS}, so rooms will have about ${Math.round(people / MAX_ROOMS)} people each.`
}

/** The room sizes people will actually get, e.g. "4" or "4–5". */
export function roomSizeLabel(people: number, groupSize: number): string {
  const count = roomCount(people, Math.max(MIN_GROUP_SIZE, groupSize))
  const small = Math.floor(people / count)
  return people % count === 0 ? `${small}` : `${small}–${small + 1}`
}

/** The people-per-room setting that gives closest to `rooms` rooms (it can be one off). */
export function sizeForRooms(people: number, rooms: number): number {
  const target = Math.max(1, Math.min(MAX_ROOMS, Math.round(rooms)))
  const exact = people / target
  const options = [...new Set([Math.floor(exact), Math.ceil(exact)].map((s) => Math.max(MIN_GROUP_SIZE, s)))]
  const miss = (size: number) => Math.abs(roomCount(people, size) - target)
  return options.reduce((best, size) => (miss(size) < miss(best) ? size : best))
}

/** Split an ordered list into `count` consecutive runs whose sizes differ by at most one. */
function chunk<T>(items: readonly T[], count: number): T[][] {
  const size = Math.floor(items.length / count)
  const extra = items.length % count
  const out: T[][] = []
  let start = 0
  for (let i = 0; i < count; i++) {
    const end = start + size + (i < extra ? 1 : 0)
    out.push(items.slice(start, end))
    start = end
  }
  return out
}

/** Deal people round-robin into `count` groups so sizes differ by at most one. */
function deal<T>(people: readonly T[], count: number): T[][] {
  const groups: T[][] = Array.from({ length: count }, () => [])
  people.forEach((person, i) => groups[i % count].push(person))
  return groups
}

function numbered(groups: Candidate[][], prefix = "Room"): PlannedRoom[] {
  return groups.map((members, i) => ({ name: `${prefix} ${i + 1}`, members }))
}

function matchRandom(people: Candidate[], config: MatchConfig, rng: Rng): PlannedRoom[] {
  return numbered(deal(shuffle(people, rng), roomCount(people.length, config.groupSize)))
}

function matchRoles(
  people: Candidate[],
  config: MatchConfig,
  rng: Rng,
  warnings: string[],
): PlannedRoom[] {
  const roleIds = new Set(config.roles.map((r) => r.id))
  const byRole = new Map<string, Candidate[]>()
  const noRole: Candidate[] = []
  for (const person of shuffle(people, rng)) {
    if (person.roleId && roleIds.has(person.roleId)) {
      byRole.set(person.roleId, [...(byRole.get(person.roleId) ?? []), person])
    } else {
      noRole.push(person)
    }
  }
  if (noRole.length > 0) {
    warnings.push(`${noRole.length} participant(s) have no role and were spread across rooms.`)
  }

  const anchorRole = config.roles.find((r) => r.id === config.anchorRoleId)
  const anchors = anchorRole ? (byRole.get(anchorRole.id) ?? []) : []
  const seatAnchors = anchorRole !== undefined && anchors.length > 0
  let rooms: PlannedRoom[]
  const pool: Candidate[][] = []

  if (seatAnchors) {
    // One room per anchor, e.g. each Table Host gets their own table.
    if (anchors.length > MAX_ROOMS) {
      warnings.push(`Only ${MAX_ROOMS} rooms allowed; extra ${anchorRole.label}s join as guests.`)
    }
    rooms = anchors
      .slice(0, MAX_ROOMS)
      .map((anchor) => ({ name: `${anchorRole.label}: ${anchor.name}`, members: [anchor] }))
    pool.push(anchors.slice(MAX_ROOMS))
    const average = Math.round(people.length / rooms.length)
    if (average > LARGE_ROOM) {
      warnings.push(
        `Only ${rooms.length} ${anchorRole.label}(s), so rooms will have about ${average} people each.`,
      )
    }
  } else {
    if (anchorRole) {
      warnings.push(`Nobody picked "${anchorRole.label}", so rooms were sized by group size instead.`)
    }
    const count = roomCount(people.length, config.groupSize)
    rooms = numbered(Array.from({ length: count }, () => []), "Table")
  }

  // Place each remaining role in turn, always into the room with the fewest
  // people of that role (then fewest people overall), so every room gets a
  // balanced mix of roles.
  for (const role of config.roles) {
    if (!(seatAnchors && role.id === anchorRole.id)) pool.push(byRole.get(role.id) ?? [])
  }
  pool.push(noRole)

  for (const group of pool) {
    const counts = new Map<PlannedRoom, number>(rooms.map((room) => [room, 0]))
    for (const person of group) {
      let best = rooms[0]
      for (const room of rooms) {
        const fewerOfRole = counts.get(room)! < counts.get(best)!
        const tie = counts.get(room) === counts.get(best)
        if (fewerOfRole || (tie && room.members.length < best.members.length)) best = room
      }
      best.members.push(person)
      counts.set(best, counts.get(best)! + 1)
    }
  }
  return rooms
}

type Group = { members: Candidate[]; key: string[] }

/** Answers every member shares, ignoring members who left that question blank. */
function sharedTags(members: Candidate[], matchOn: string[]): string[] {
  return matchOn.flatMap((id) => {
    const values = new Set(members.map((m) => m.tags[id]).filter(Boolean))
    return values.size === 1 ? [...values] : []
  })
}

function matchAttributes(
  people: Candidate[],
  config: MatchConfig,
  rng: Rng,
  warnings: string[],
): PlannedRoom[] {
  const categoryIds = new Set(config.categories.map((c) => c.id))
  const matchOn = config.matchOn.filter((id) => categoryIds.has(id))
  if (matchOn.length === 0) {
    warnings.push("No attributes selected to match on, so rooms were shuffled randomly.")
    return matchRandom(people, config, rng)
  }

  const atRoomLimit = Math.floor(people.length / config.groupSize) >= MAX_ROOMS
  const keyOf = (person: Candidate) => matchOn.map((id) => person.tags[id] ?? "")
  const byKey = (a: Candidate, b: Candidate) =>
    keyOf(a).join("\u0000").localeCompare(keyOf(b).join("\u0000"))
  // People who answered nothing can be matched with anyone.
  const wildcards: Candidate[] = []
  const answered: Candidate[] = []
  for (const person of shuffle(people, rng)) {
    ;(keyOf(person).every((v) => v === "") ? wildcards : answered).push(person)
  }
  if (wildcards.length > 0) {
    warnings.push(`${wildcards.length} person(s) gave no answers and were put wherever there was room.`)
  }

  if (config.attributeStrategy === "diverse") {
    // Sort so equal answers sit next to each other, then deal round-robin:
    // neighbours land in different rooms, spreading each answer around.
    const sorted = [...answered].sort(byKey)
    const all = [...sorted, ...wildcards]
    return numbered(deal(all, roomCount(all.length, config.groupSize)))
  }

  // "Similar": bucket by the full answer key and split full buckets into
  // rooms. People left over relax the lowest-priority attribute and try
  // again, down to no attributes at all. Buckets are sorted by the full key
  // and cut into consecutive runs, so near-matches still sit together.
  const groups: Group[] = []
  let leftovers = answered
  for (let depth = matchOn.length; depth >= 0 && leftovers.length > 0; depth--) {
    const buckets = new Map<string, Candidate[]>()
    for (const person of leftovers) {
      const key = keyOf(person).slice(0, depth).join("\u0000")
      buckets.set(key, [...(buckets.get(key) ?? []), person])
    }
    leftovers = []
    for (const bucket of buckets.values()) {
      if (bucket.length >= config.groupSize) {
        const sorted = [...bucket].sort(byKey)
        // Normally a room never drops below the group size. In big meetings the
        // size is already raised to fit Zoom's room limit, so on the last pass
        // round to the nearest number of rooms to keep sizes even.
        const rooms =
          depth === 0 && atRoomLimit
            ? Math.max(1, Math.round(bucket.length / config.groupSize))
            : Math.floor(bucket.length / config.groupSize)
        // Full rooms of exactly the group size; the few extra people try
        // again with one question fewer, rather than overfilling a room.
        const take = depth > 0 ? rooms * config.groupSize : sorted.length
        for (const members of chunk(sorted.slice(0, take), rooms)) {
          groups.push({ members, key: keyOf(members[0]) })
        }
        leftovers.push(...sorted.slice(take))
      } else {
        leftovers.push(...bucket)
      }
    }
  }

  // Nobody could be grouped by answers (e.g. only a few people answered):
  // split everyone into normal-sized rooms, near answers next to each other.
  if (groups.length === 0) {
    const everyone = [...[...leftovers].sort(byKey), ...wildcards]
    for (const members of chunk(everyone, roomCount(everyone.length, config.groupSize))) {
      groups.push({ members, key: keyOf(members[0]) })
    }
    leftovers = []
    wildcards.length = 0
  }

  // Enough people without answers for rooms of their own: give them some,
  // rather than piling them all into the existing rooms.
  const spareRooms = Math.floor(wildcards.length / config.groupSize)
  if (spareRooms > 0) {
    for (const members of chunk(wildcards, spareRooms)) groups.push({ members, key: [] })
    wildcards.length = 0
  }

  // The few people left join the most similar room (or the smallest).
  const stragglers = [...leftovers, ...wildcards]
  if (groups.length > 0) {
    // Earlier questions matter more. An exact answer scores in full; the
    // neighbouring option in that question's list (e.g. ages 14–15 vs 16–17)
    // scores half, so leftovers join the closest room, not just any room.
    const options = matchOn.map((id) => config.categories.find((c) => c.id === id)?.options ?? [])
    const closeness = (a: string, b: string, i: number) => {
      if (a === "" || b === "") return 0
      if (a === b) return 1
      const gap = Math.abs(options[i].indexOf(a) - options[i].indexOf(b))
      return options[i].includes(a) && options[i].includes(b) && gap === 1 ? 0.5 : 0
    }
    // Keep rooms even: a room stops taking leftovers once it is one over the
    // usual size, so the best-matching room doesn't keep growing.
    const total = groups.reduce((n, g) => n + g.members.length, 0) + stragglers.length
    const limit = Math.max(config.groupSize, Math.ceil(total / groups.length)) + 1
    for (const person of stragglers) {
      const key = keyOf(person)
      const score = (g: Group) =>
        g.key.reduce((total, v, i) => total + closeness(v, key[i], i) * (matchOn.length - i), 0)
      const open = groups.filter((g) => g.members.length < limit)
      const choices = open.length > 0 ? open : groups
      let best = choices[0]
      for (const g of choices) {
        const better = score(g) > score(best)
        const tie = score(g) === score(best)
        if (better || (tie && g.members.length < best.members.length)) best = g
      }
      best.members.push(person)
    }
  }

  // Merge the smallest rooms if Zoom's room limit is exceeded.
  groups.sort((a, b) => b.members.length - a.members.length)
  while (groups.length > MAX_ROOMS) {
    const extra = groups.pop()!
    const target = groups.reduce((min, g) => (g.members.length < min.members.length ? g : min))
    target.members.push(...extra.members)
  }

  return groups.map(({ members }, i) => {
    const shared = sharedTags(members, matchOn)
    return { name: shared.length > 0 ? shared.join(" · ") : `Mixed ${i + 1}`, members }
  })
}

/** Replace generic numbered names with the host's labels, in order. */
function applyLabels(rooms: PlannedRoom[], labels: string[] = []): PlannedRoom[] {
  const usable = labels.map((l) => l.trim()).filter(Boolean)
  let next = 0
  return rooms.map((room) =>
    /^(Room|Table|Mixed) \d+$/.test(room.name) && next < usable.length
      ? { ...room, name: usable[next++] }
      : room,
  )
}

/** Zoom matches rooms by name, so names must be unique and non-empty. */
export function uniqueNames(rooms: PlannedRoom[]): PlannedRoom[] {
  const seen = new Map<string, number>()
  return rooms.map((room) => {
    const base = room.name.trim().slice(0, 40) || "Room"
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return { ...room, name: n === 1 ? base : `${base} (${n})` }
  })
}

export function buildMatchPlan(
  people: Candidate[],
  config: MatchConfig,
  rng: Rng = Math.random,
): MatchPlan {
  const warnings: string[] = []
  if (people.length < MIN_GROUP_SIZE) {
    return { rooms: [], warnings: ["At least 2 participants are needed to make rooms."] }
  }
  const groupSize = Math.max(MIN_GROUP_SIZE, Math.floor(config.groupSize))
  const limit = roomLimitWarning(people.length, groupSize)
  // Too many people for the rooms Zoom allows: plan bigger rooms up front,
  // so rooms come out even instead of being merged afterwards.
  const safeConfig = { ...config, groupSize: limit ? Math.ceil(people.length / MAX_ROOMS) : groupSize }
  // One room per anchor (e.g. per mentor) has its own room-count warnings.
  const anchored =
    config.mode === "roles" &&
    config.roles.some((r) => r.id === config.anchorRoleId) &&
    people.some((p) => p.roleId === config.anchorRoleId)
  if (limit && !anchored) warnings.push(limit)

  const rooms =
    config.mode === "roles"
      ? matchRoles(people, safeConfig, rng, warnings)
      : config.mode === "attributes"
        ? matchAttributes(people, safeConfig, rng, warnings)
        : matchRandom(people, safeConfig, rng)

  return { rooms: uniqueNames(applyLabels(rooms.filter((r) => r.members.length > 0), config.roomLabels)), warnings }
}

/**
 * Bring a previewed plan up to date with who is in the meeting now: people
 * who left are dropped and newcomers fill the smallest rooms, so the rooms
 * the host already looked at stay recognisable.
 */
export function reconcilePlan(
  plan: MatchPlan,
  people: Candidate[],
): { plan: MatchPlan; joined: number; left: number } {
  const present = new Map(people.map((p) => [p.uuid, p]))
  let left = 0
  const rooms = plan.rooms.map((room) => ({
    ...room,
    members: room.members.flatMap((m) => {
      const now = present.get(m.uuid)
      if (!now) left++
      return now ? [now] : []
    }),
  }))
  const placed = new Set(rooms.flatMap((r) => r.members.map((m) => m.uuid)))
  const newcomers = people.filter((p) => !placed.has(p.uuid))
  for (const person of newcomers) {
    if (rooms.length === 0) break
    rooms.reduce((min, r) => (r.members.length < min.members.length ? r : min)).members.push(person)
  }
  return {
    plan: { ...plan, rooms: rooms.filter((r) => r.members.length > 0) },
    joined: rooms.length ? newcomers.length : 0,
    left,
  }
}
