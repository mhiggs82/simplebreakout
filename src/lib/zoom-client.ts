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

/**
 * In-browser stand-in for the Zoom client (`?mock=...`). It simulates a
 * meeting of 20 people; when the host sends questions, most of them answer
 * with random choices a moment later. When `asAttendee` is set, a host
 * "sends" a questionnaire shortly after the app opens.
 */
export function createMockZoomClient(self: Participant, asAttendee: boolean): ZoomClient {
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

  if (asAttendee) {
    setTimeout(
      () =>
        emit("onMessage", {
          timestamp: Date.now(),
          participantUUID: "mock-host",
          payload: {
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
        }),
      800,
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
      await delay(300)
      rooms = { ...rooms, state: "closed" }
      return ok
    },
    async getBreakoutRoomList() {
      return rooms
    },
    async sendMessage({ payload }) {
      await delay(50)
      if (!asAttendee && payload.t === "sb1/config") answerQuestionnaire(payload)
      return ok
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
