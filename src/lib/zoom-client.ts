import type zoomSdk from "@zoom/appssdk"
import type { BreakoutRoomsResponse, Participant } from "@zoom/appssdk"

/** The slice of the Zoom Apps SDK the matchmaking flow uses. */
export type ZoomClient = Pick<
  typeof zoomSdk,
  | "getMeetingParticipants"
  | "createBreakoutRooms"
  | "configureBreakoutRooms"
  | "assignParticipantToBreakoutRoom"
  | "openBreakoutRooms"
  | "closeBreakoutRooms"
  | "getBreakoutRoomList"
  | "sendMessage"
  | "sendAppInvitationToAllParticipants"
  | "changeBreakoutRoom"
  | "addParticipantSpotlight"
  | "removeParticipantSpotlights"
  | "getParticipantSpotlights"
  | "addEventListener"
  | "removeEventListener"
>

type Listener = (data: unknown) => void

const MOCK_NAMES = [
  "Amara Okafor", "Ben Carter", "Chen Wei", "Diego Alvarez", "Elif Yilmaz",
  "Fatima Al-Sayed", "Grace Kim", "Hugo Martin", "Isabel Rossi", "Jonas Berg",
  "Keiko Tanaka", "Liam O'Brien", "Maya Patel", "Noah Cohen", "Olivia Brown",
  "Pedro Santos", "Quinn Murphy", "Rania Haddad", "Sofia Novak", "Tariq Aziz",
]

const FIRST = ["Amara", "Ben", "Chen", "Diego", "Elif", "Fatima", "Grace", "Hugo", "Isabel", "Jonas", "Keiko", "Liam", "Maya", "Noah", "Olivia", "Pedro", "Quinn", "Rania", "Sofia", "Tariq", "Uma", "Victor", "Wen", "Xavier", "Yara", "Zane"]
const LAST = ["Okafor", "Carter", "Wei", "Alvarez", "Yilmaz", "Al-Sayed", "Kim", "Martin", "Rossi", "Berg", "Tanaka", "O'Brien", "Patel", "Cohen", "Brown", "Santos", "Murphy", "Haddad", "Novak", "Aziz"]

/** The original 20 names first, then generated ones for bigger meetings. */
function mockName(i: number): string {
  if (i < MOCK_NAMES.length) return MOCK_NAMES[i]
  return `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]} ${Math.floor(i / 100) || ""}`.trim()
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const ok = { message: "Success" as const }

/** What a simulated host does for a mock attendee (`?mock=attendee&scenario=...`). */
export type MockScenario =
  | "questions"
  | "round"
  | "fishbowl"
  | "openspace"
  | "gallery"

export const MOCK_SCENARIOS: readonly MockScenario[] = [
  "questions",
  "round",
  "fishbowl",
  "openspace",
  "gallery",
]

const MOCK_INSIGHTS = [
  "Small experiments beat big plans",
  "We need clearer ownership",
  "Listening first changed the conversation",
  "Trust grows when people see follow-through",
  "Make space for quieter voices",
]

export interface MockOptions {
  scenario?: MockScenario
  /** Other people in the meeting (default 20). */
  people?: number
  /** How many of them are co-hosts. */
  cohosts?: number
  /** People keep joining and leaving. */
  churn?: boolean
  /** Some SDK calls fail, like on a flaky connection. */
  chaos?: boolean
  /** How long rooms take to close after closeBreakoutRooms (Zoom's countdown). */
  closeDelayMs?: number
}

/**
 * In-browser stand-in for the Zoom client (`?mock=...`). It simulates a
 * meeting of 20 people; when the host sends questions, most of them answer
 * with random choices a moment later, and when a Fishbowl starts a few raise
 * their hands. For a mock attendee, a simulated host acts out `scenario`.
 */
export function createMockZoomClient(
  self: Participant,
  asAttendee: boolean,
  { scenario = "questions", closeDelayMs = 1500, people = MOCK_NAMES.length, cohosts = 0, churn = false, chaos = false }: MockOptions = {},
): ZoomClient {
  const listeners = new Map<string, Set<Listener>>()
  const emit = (event: string, data: unknown) =>
    listeners.get(event)?.forEach((listener) => listener(data))

  const makePerson = (i: number): Participant => ({
    screenName: mockName(i),
    participantId: String(i + 1),
    participantUUID: `mock-${i + 1}`,
    role: i < cohosts ? "coHost" : "attendee",
  })
  const participants: Participant[] = [self, ...Array.from({ length: people }, (_, i) => makePerson(i))]
  let nextPerson = people
  const flaky = () => chaos && Math.random() < 0.1

  if (churn && !asAttendee) {
    // Every few seconds someone leaves or someone new joins.
    setInterval(() => {
      const leavers = participants.slice(1 + cohosts)
      if (Math.random() < 0.5 && leavers.length > 2) {
        const gone = pick(leavers)
        participants.splice(participants.indexOf(gone), 1)
        for (const room of rooms.rooms) {
          room.participants = room.participants?.filter((p) => p.participantUUID !== gone.participantUUID)
        }
      } else {
        participants.push(makePerson(nextPerson++))
      }
      emit("onParticipantChange", { timestamp: Date.now(), participants: [] })
    }, 2500)
  }
  let rooms: BreakoutRoomsResponse = { rooms: [], state: "closed", unassigned: [] }
  let spotlights: string[] = []
  /** room id → assigned participant UUIDs */
  const assigned = new Map<string, string[]>()
  let handsRaised = false
  const fromHost = (payload: Record<string, unknown>, after: number) =>
    setTimeout(
      () => emit("onMessage", { timestamp: Date.now(), participantUUID: "mock-host", payload }),
      after,
    )

  const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)]

  function answerQuestionnaire(payload: Record<string, unknown>) {
    const roles = (payload.r as [string, string][]) ?? []
    const categories = (payload.c as [string, string, string[]][]) ?? []
    participants.slice(1).forEach((p, i) => {
      if (i % 4 !== 0 && Math.random() < 0.15) return // some people never answer
      // Roughly one in four picks the first role (e.g. Table Host).
      const others = roles.length > 1 ? roles.slice(1) : roles
      const roleId = roles.length ? (i % 4 === 0 ? roles[0] : pick(others))[0] : undefined
      const g = Object.fromEntries(categories.map(([id, , options]) => [id, pick(options)]))
      setTimeout(
        () =>
          emit("onMessage", {
            timestamp: Date.now(),
            participantUUID: p.participantUUID,
            payload: { t: "sb1/answer", s: payload.s, ...(roleId ? { r: roleId } : {}), g },
          }),
        300 + Math.random() * 1500,
      )
    })
  }

  if (asAttendee && scenario === "questions") {
    fromHost(
      {
        t: "sb1/config",
        s: "mock-session",
        m: "attributes",
        r: [],
        c: [
          ["country", "Country", ["United States", "United Kingdom", "Netherlands", "Other"]],
          ["language", "Language", ["English", "Spanish", "Arabic", "Other"]],
          ["childAge", "Child's age", ["0–4", "5–11", "12–14", "15–18"]],
        ],
      },
      800,
    )
  } else if (asAttendee && scenario === "round") {
    const endsAt = Date.now() + 66_000
    fromHost({ t: "sb1/round", a: "cafe", n: 2, o: 3, e: endsAt, p: "What would change if we started over tomorrow?" }, 800)
    fromHost({ t: "sb1/warning", s: 60 }, 6_000)
  } else if (asAttendee && scenario === "fishbowl") {
    fromHost({ t: "sb1/fishbowl", i: ["mock-1", "mock-2", "mock-3", "mock-4"] }, 800)
  } else if (asAttendee && scenario === "openspace") {
    fromHost({ t: "sb1/tables", s: "demo", n: 4, r: [["room-1", "Funding ideas", 3, 6], ["room-2", "Tools we love", 6, 6], ["room-3", "Hiring", 1, 0], ["room-4", "Wild card", 0, 4]] }, 800)
  } else if (asAttendee && scenario === "gallery") {
    fromHost({ t: "sb1/round", a: "gallery", n: 2, o: 4, e: Date.now() + 300_000, p: "What's missing from this idea?", l: "Station 2 of 4", h: 1 }, 800)
    fromHost({ t: "sb1/station", r: "Onboarding", m: [self.participantUUID], n: ["Pair new joiners with a buddy", "A first-week checklist"] }, 1_000)
  }

  /** In harvest steps, one person per room sends an insight. */
  function sendInsights() {
    const senders = rooms.rooms.flatMap((room) => (assigned.get(room.breakoutRoomId) ?? []).slice(0, 1))
    senders.forEach((uuid, i) =>
      setTimeout(
        () => emit("onMessage", { timestamp: Date.now(), participantUUID: uuid, payload: { t: "sb1/insight", x: MOCK_INSIGHTS[i % MOCK_INSIGHTS.length] } }),
        600 + i * 400,
      ),
    )
  }

  /** Open Space: with no assignments, attendees wander into tables. */
  function wanderIntoTables() {
    if (rooms.rooms.length === 0) return
    participants.slice(1).forEach((p, i) =>
      setTimeout(() => {
        if (rooms.state !== "open") return
        const room = pick(rooms.rooms)
        room.participants = [
          ...(room.participants ?? []),
          { participantId: i + 1, participantUUID: p.participantUUID, displayName: p.screenName, participantStatus: "joined" },
        ]
      }, 400 + Math.random() * 3000),
    )
  }

  function raiseSomeHands(onStage: string[]) {
    if (handsRaised) return
    handsRaised = true
    participants.slice(1).filter((p) => !onStage.includes(p.participantUUID)).slice(0, 3).forEach((p, i) =>
      setTimeout(
        () => emit("onMessage", { timestamp: Date.now(), participantUUID: p.participantUUID, payload: { t: "sb1/raise" } }),
        800 + i * 700,
      ),
    )
  }

  return {
    async getMeetingParticipants() {
      await delay(150)
      return { participants: [...participants] }
    },
    async createBreakoutRooms({ names, numberOfRooms }) {
      await delay(300)
      const list = names ?? Array.from({ length: numberOfRooms }, (_, i) => `Room ${i + 1}`)
      assigned.clear()
      rooms = {
        state: "closed",
        rooms: list.map((name, i) => ({ breakoutRoomId: `room-${i + 1}`, name, participants: [] })),
        unassigned: [],
      }
      return rooms
    },
    async configureBreakoutRooms(options) {
      await delay(150)
      return {
        allowParticipantsChooseRoom: options.allowParticipantsChooseRoom ? 1 : 0,
        allowParticipantsReturnToMainSession: options.allowParticipantsReturnToMainSession ? 1 : 0,
        automaticallyMoveParticipantsIntoRooms: options.automaticallyMoveParticipantsIntoRooms ? 1 : 0,
        automaticallyMoveParticipantsIntoMainRoom: 0,
        closeAfter: options.closeAfter ?? 0,
        countDown: options.countDown ?? 0,
      }
    },
    async assignParticipantToBreakoutRoom({ uuid, participantUUID }) {
      await delay(40)
      if (flaky() || !participants.some((p) => p.participantUUID === participantUUID)) {
        throw { code: "10094", message: "The id of the user is incorrect." }
      }
      if (uuid && participantUUID) assigned.set(uuid, [...(assigned.get(uuid) ?? []), participantUUID])
      return ok
    },
    async openBreakoutRooms() {
      await delay(300)
      rooms = { ...rooms, state: "open" }
      if (assigned.size === 0) wanderIntoTables()
      return ok
    },
    async closeBreakoutRooms() {
      if (rooms.state !== "open") throw { code: "10092", message: "Breakout Rooms are not open." }
      // Like Zoom, rooms finish closing after the countdown.
      setTimeout(() => {
        rooms = { ...rooms, state: "closed" }
      }, closeDelayMs)
      return ok
    },
    async getBreakoutRoomList() {
      return rooms
    },
    async sendMessage({ payload }) {
      await delay(50)
      if (flaky()) throw { code: "10038", message: "Failed to post message." }
      if (!asAttendee && payload.t === "sb1/config") answerQuestionnaire(payload)
      if (!asAttendee && payload.t === "sb1/fishbowl") raiseSomeHands((payload.i as string[]) ?? [])
      if (!asAttendee && payload.t === "sb1/round" && payload.h === 1 && payload.k !== "m") sendInsights()
      return ok
    },
    async changeBreakoutRoom() {
      await delay(100)
      return ok
    },
    async addParticipantSpotlight({ participantUUID }) {
      await delay(60)
      if (spotlights.length >= 9) throw { code: "10230", message: "Too many users spotlighted (maximum: 9)" }
      if (!spotlights.includes(participantUUID)) spotlights = [...spotlights, participantUUID]
      return ok
    },
    async removeParticipantSpotlights({ participantUUIDs }) {
      await delay(60)
      spotlights = spotlights.filter((uuid) => !participantUUIDs.includes(uuid))
      return ok
    },
    async getParticipantSpotlights() {
      return { participantUUIDs: spotlights }
    },
    async sendAppInvitationToAllParticipants() {
      return { invitationUUID: "mock-invitation" }
    },
    addEventListener(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(handler)
    },
    removeEventListener(event, handler) {
      listeners.get(event)?.delete(handler)
    },
  }
}
