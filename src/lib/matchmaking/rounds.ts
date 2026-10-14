import { MIN_GROUP_SIZE, roomCount, shuffle, uniqueNames, type Rng } from "./engine"
import type { Candidate, MatchPlan, PlannedRoom, TableDef } from "./types"

/** Who has met whom, and which rooms (by name) each person has sat in, across rounds. */
export interface History {
  met: Map<string, Set<string>>
  visited: Map<string, Set<string>>
}

export function emptyHistory(): History {
  return { met: new Map(), visited: new Map() }
}

function hasMet(history: History, a: string, b: string): boolean {
  return history.met.get(a)?.has(b) ?? false
}

function repeatsWith(history: History, person: Candidate, members: Candidate[]): number {
  return members.reduce((n, m) => n + (hasMet(history, person.uuid, m.uuid) ? 1 : 0), 0)
}

function repeatsIn(history: History, members: Candidate[]): number {
  let n = 0
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      if (hasMet(history, members[i].uuid, members[j].uuid)) n++
    }
  }
  return n
}

/** Record a finished round so later rounds avoid repeats. */
export function recordRound(history: History, plan: MatchPlan): void {
  const add = (map: Map<string, Set<string>>, key: string, value: string) => {
    if (!map.has(key)) map.set(key, new Set())
    map.get(key)!.add(value)
  }
  for (const room of plan.rooms) {
    for (const a of room.members) {
      add(history.visited, a.uuid, room.name)
      for (const b of room.members) if (a.uuid !== b.uuid) add(history.met, a.uuid, b.uuid)
    }
  }
}

/** The prompt for a round: one per round, the last repeating once they run out. */
export function promptFor(prompts: string[], round: number): string | undefined {
  const usable = prompts.map((p) => p.trim()).filter(Boolean)
  return usable.length === 0 ? undefined : usable[Math.min(round, usable.length - 1)]
}

const ATTEMPTS = 40
const SWAP_PASSES = 4

/**
 * Speed networking: balanced groups that avoid pairs who already met.
 * Several random greedy fills are tried, each polished by swapping people
 * between groups, and the plan with the fewest repeats wins.
 */
export function planSpeedRound(
  people: Candidate[],
  groupSize: number,
  history: History,
  rng: Rng = Math.random,
  labels: string[] = [],
): MatchPlan {
  if (people.length < MIN_GROUP_SIZE) {
    return { rooms: [], warnings: ["At least 2 participants are needed to make rooms."] }
  }
  const count = roomCount(people.length, Math.max(MIN_GROUP_SIZE, groupSize))
  const capacity = (i: number) =>
    Math.floor(people.length / count) + (i < people.length % count ? 1 : 0)

  let best: { groups: Candidate[][]; score: number } | null = null
  for (let attempt = 0; attempt < ATTEMPTS && best?.score !== 0; attempt++) {
    const groups: Candidate[][] = Array.from({ length: count }, () => [])
    for (const person of shuffle(people, rng)) {
      let target = -1
      for (let i = 0; i < count; i++) {
        if (groups[i].length >= capacity(i)) continue
        if (
          target === -1 ||
          repeatsWith(history, person, groups[i]) < repeatsWith(history, person, groups[target])
        ) {
          target = i
        }
      }
      groups[target].push(person)
    }

    // Local improvement: swap two people between groups when it removes repeats.
    for (let pass = 0; pass < SWAP_PASSES; pass++) {
      let improved = false
      for (let g = 0; g < count; g++) {
        for (let h = g + 1; h < count; h++) {
          for (let i = 0; i < groups[g].length; i++) {
            for (let j = 0; j < groups[h].length; j++) {
              const a = groups[g][i]
              const b = groups[h][j]
              const restG = groups[g].filter((_, k) => k !== i)
              const restH = groups[h].filter((_, k) => k !== j)
              const before = repeatsWith(history, a, restG) + repeatsWith(history, b, restH)
              const after = repeatsWith(history, b, restG) + repeatsWith(history, a, restH)
              if (after < before) {
                groups[g][i] = b
                groups[h][j] = a
                improved = true
              }
            }
          }
        }
      }
      if (!improved) break
    }

    const score = groups.reduce((n, g) => n + repeatsIn(history, g), 0)
    if (!best || score < best.score) best = { groups, score }
  }

  const rooms: PlannedRoom[] = best!.groups.map((members, i) => ({
    name: labels[i]?.trim() || `Room ${i + 1}`,
    members,
  }))
  const warnings =
    best!.score > 0 ? [`${best!.score} repeat pairing(s) couldn't be avoided this round.`] : []
  return { rooms: uniqueNames(rooms), warnings }
}

/**
 * World Café: pinned people stay at their table; everyone else ("travellers")
 * is spread evenly, preferring tables they haven't visited and people they
 * haven't met.
 */
export function planCafeRound(
  tables: TableDef[],
  people: Candidate[],
  history: History,
  rng: Rng = Math.random,
): MatchPlan {
  if (tables.length === 0) return { rooms: [], warnings: ["Add at least one table."] }
  const named = uniqueNames(tables.map((t) => ({ name: t.name, members: [] as Candidate[] })))
  const rooms = named.map((room, i) => ({ ...room, table: tables[i] }))

  const pinnedTo = new Map<string, number>()
  tables.forEach((t, i) => t.pinned.forEach((uuid) => pinnedTo.set(uuid, i)))

  const travelers: Candidate[] = []
  for (const person of people) {
    const table = pinnedTo.get(person.uuid)
    if (table === undefined) travelers.push(person)
    else rooms[table].members.push(person)
  }

  const visits = (person: Candidate, room: (typeof rooms)[number]) =>
    history.visited.get(person.uuid)?.has(room.name) ? 1 : 0
  const travelerCounts = rooms.map(() => 0)
  const limit = Math.ceil(travelers.length / rooms.length)

  // Place the most-travelled people first: they have the fewest fresh tables left.
  const ordered = shuffle(travelers, rng).sort(
    (a, b) => (history.visited.get(b.uuid)?.size ?? 0) - (history.visited.get(a.uuid)?.size ?? 0),
  )
  let revisits = 0
  for (const person of ordered) {
    let best = -1
    let bestCost = Infinity
    rooms.forEach((room, i) => {
      if (travelerCounts[i] >= limit) return
      const cost = 10 * visits(person, room) + repeatsWith(history, person, room.members)
      if (cost < bestCost || (cost === bestCost && room.members.length < rooms[best].members.length)) {
        best = i
        bestCost = cost
      }
    })
    revisits += visits(person, rooms[best])
    rooms[best].members.push(person)
    travelerCounts[best]++
  }

  const warnings: string[] = []
  if (revisits > 0) warnings.push(`${revisits} traveller(s) revisit a table they've already been to.`)
  const unhosted = tables.filter((t) => t.pinned.length === 0).length
  if (unhosted > 0) warnings.push(`${unhosted} table(s) have no pinned host.`)

  return { rooms: rooms.map(({ name, members }) => ({ name, members })), warnings }
}
