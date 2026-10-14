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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const ok = { message: "Success" as const }

/** What a simulated host does for a mock attendee (`?mock=attendee&scenario=...`). */
export type MockScenario =
  | "questions"
  | "round"
  | "fishbowl"
  | "poll"
  | "cloud"
  | "spectrum"
  | "openspace"
  | "gallery"

export const MOCK_SCENARIOS: readonly MockScenario[] = [
  "questions",
  "round",
  "fishbowl",
  "poll",
  "cloud",
  "spectrum",
  "openspace",
  "gallery",
]

const MOCK_WORDS = ["curious", "energised", "tired", "hopeful", "curious", "focused", "curious", "hopeful", "calm"]
const MOCK_INSIGHTS = [
  "Small experiments beat big plans",
  "We need clearer ownership",
  "Listening first changed the conversation",
  "Trust grows when people see follow-through",
  "Make space for quieter voices",
]

export interface MockOptions {
  scenario?: MockScenario
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
  { scenario = "questions", closeDelayMs = 1500 }: MockOptions = {},
): ZoomClient {
  const listeners = new Map<string, Set<Listener>>()
  const emit = (event: string, data: unknown) =>
    listeners.get(event)?.forEach((listener) => listener(data))

  const participants: Participant[] = [
    self,
    ...MOCK_NAMES.map((screenName, i) => ({
      screenName,
      participantId: String(i + 1),
      participantUUID: `mock-${i + 1}`,
      role: "attendee",
    })),
  ]
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
  } else if (asAttendee && scenario === "poll") {
    fromHost({ t: "sb1/poll", i: "demo", k: "poll", q: "How's your energy right now?", o: ["1 · Running on empty", "2", "3", "4", "5 · Fully charged"] }, 800)
    fromHost({ t: "sb1/results", i: "demo", k: "poll", q: "How's your energy right now?", o: ["1 · Running on empty", "2", "3", "4", "5 · Fully charged"], n: [1, 3, 7, 6, 2] }, 5_000)
  } else if (asAttendee && scenario === "cloud") {
    fromHost({ t: "sb1/poll", i: "demo", k: "cloud", q: "One word for how you're arriving today" }, 800)
    fromHost({ t: "sb1/results", i: "demo", k: "cloud", q: "One word for how you're arriving today", w: [["curious", 6], ["hopeful", 4], ["tired", 3], ["focused", 2], ["calm", 1], ["excited", 1]] }, 5_000)
  } else if (asAttendee && scenario === "spectrum") {
    fromHost({ t: "sb1/poll", i: "demo", k: "spectrum", q: "Remote work makes collaboration easier", b: ["Strongly disagree", "Strongly agree"] }, 800)
  } else if (asAttendee && scenario === "openspace") {
    fromHost({ t: "sb1/tables", s: "demo", n: 4, r: [["room-1", "Funding ideas", 3, 6], ["room-2", "Tools we love", 6, 6], ["room-3", "Hiring", 1, 0], ["room-4", "Wild card", 0, 4]] }, 800)
  } else if (asAttendee && scenario === "gallery") {
    fromHost({ t: "sb1/round", a: "gallery", n: 2, o: 4, e: Date.now() + 300_000, p: "What's missing from this idea?", l: "Station 2 of 4", h: 1 }, 800)
    fromHost({ t: "sb1/station", r: "Onboarding", m: [self.participantUUID], n: ["Pair new joiners with a buddy", "A first-week checklist"] }, 1_000)
  }

  /** Simulated attendees answer the host's live question. */
  function vote(payload: Record<string, unknown>) {
    const options = (payload.o as string[]) ?? []
    participants.slice(1).forEach((p, i) => {
      if (i % 6 === 5) return // a few people don't answer
      const v =
        payload.k === "poll"
          ? { c: Math.min(options.length - 1, Math.floor((Math.random() + Math.random()) * options.length / 2)) }
          : payload.k === "cloud"
            ? { x: pick(MOCK_WORDS) }
            : { v: i < 10 ? 1 + Math.floor(Math.random() * 4) : 6 + Math.floor(Math.random() * 5) }
      setTimeout(
        () => emit("onMessage", { timestamp: Date.now(), participantUUID: p.participantUUID, payload: { t: "sb1/vote", i: payload.i, ...v } }),
        300 + Math.random() * 1500,
      )
    })
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

  function raiseSomeHands() {
    if (handsRaised) return
    handsRaised = true
    participants.slice(5, 8).forEach((p, i) =>
      setTimeout(
        () => emit("onMessage", { timestamp: Date.now(), participantUUID: p.participantUUID, payload: { t: "sb1/raise" } }),
        800 + i * 700,
      ),
    )
  }

  return {
    async getMeetingParticipants() {
      await delay(150)
      return { participants }
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
      if (!asAttendee && payload.t === "sb1/config") answerQuestionnaire(payload)
      if (!asAttendee && payload.t === "sb1/fishbowl") raiseSomeHands()
      if (!asAttendee && payload.t === "sb1/poll") vote(payload)
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
