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
export type MockScenario = "questions" | "round" | "fishbowl"

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
    async assignParticipantToBreakoutRoom() {
      await delay(40)
      return ok
    },
    async openBreakoutRooms() {
      await delay(300)
      rooms = { ...rooms, state: "open" }
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
