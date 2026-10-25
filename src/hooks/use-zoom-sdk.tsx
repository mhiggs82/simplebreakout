import zoomSdk from "@zoom/appssdk"
import type {
  Apis,
  GetMeetingContextResponse,
  GetUserContextResponse,
  OnMyUserContextChangeEvent,
  RunningContext,
} from "@zoom/appssdk"
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { createMockZoomClient, MOCK_SCENARIOS, type MockOptions, type ZoomClient } from "@/lib/zoom-client"

// Every API or event the app calls must be declared here AND enabled for the
// app in the Zoom Marketplace build flow, or the client rejects the call.
const ZOOM_CAPABILITIES: Apis[] = [
  "connect",
  "onConnect",
  "postMessage",
  "sendMessage",
  "onMessage",
  "getRunningContext",
  "getMeetingContext",
  "getUserContext",
  "onMyUserContextChange",
  "getMeetingParticipants",
  "onParticipantChange",
  "sendAppInvitationToAllParticipants",
  "sendMessageToChat",
  "createBreakoutRooms",
  "configureBreakoutRooms",
  "openBreakoutRooms",
  "closeBreakoutRooms",
  "getBreakoutRoomList",
  "assignParticipantToBreakoutRoom",
  "changeBreakoutRoom",
  "onBreakoutRoomChange",
  "addParticipantSpotlight",
  "removeParticipantSpotlights",
  "getParticipantSpotlights",
]

const PRIVILEGED_ROLES = new Set(["host", "coHost"])

type ZoomSdkState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | {
      status: "ready"
      runningContext: RunningContext
      meeting: GetMeetingContextResponse
      user: GetUserContextResponse
      isHostOrCoHost: boolean
      /** False when connect() failed; breakout APIs still work without it. */
      connected: boolean
      /** True when running outside Zoom with `?mock=host|attendee`. */
      isMock: boolean
      /** The SDK, or an in-browser simulation of it in mock mode. */
      client: ZoomClient
    }

type ZoomSdkContextValue = ZoomSdkState

const ZoomSdkContext = createContext<ZoomSdkContextValue | null>(null)

function getMockRole(): string | null {
  const mock = new URLSearchParams(window.location.search).get("mock")
  return mock === "host" || mock === "coHost" || mock === "attendee"
    ? mock
    : null
}

/** `?scenario=...` picks the mock attendee demo (see MOCK_SCENARIOS); `?fast=1` shortens closing. */
function mockOptions(): MockOptions {
  const params = new URLSearchParams(window.location.search)
  const scenario = params.get("scenario")
  return {
    scenario: MOCK_SCENARIOS.find((s) => s === scenario) ?? "questions",
    closeDelayMs: (params.has("fast") ? 500 : 3000) * (params.has("chaos") ? 3 : 1),
    people: Math.min(1000, Math.max(1, Number(params.get("people")) || 20)),
    cohosts: Math.max(0, Number(params.get("cohosts")) || 0),
    churn: params.has("churn"),
    chaos: params.has("chaos"),
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "object" && err && "message" in err) {
    return String((err as { message: unknown }).message)
  }
  return String(err)
}

async function initialize(): Promise<ZoomSdkState> {
  const mockRole = getMockRole()
  if (mockRole) {
    const self = {
      screenName: "Mock User",
      participantId: "0",
      participantUUID: "mock-participant",
      role: mockRole,
    }
    const isHostOrCoHost = PRIVILEGED_ROLES.has(mockRole)
    return {
      status: "ready",
      runningContext: "inMeeting",
      meeting: { meetingTopic: "Mock meeting", meetingID: "000-000-000" },
      user: { status: "authorized", ...self },
      isHostOrCoHost,
      connected: true,
      isMock: true,
      client: createMockZoomClient(self, !isHostOrCoHost, mockOptions()),
    }
  }

  const config = await zoomSdk.config({ capabilities: ZOOM_CAPABILITIES })

  if (config.runningContext !== "inMeeting") {
    return {
      status: "error",
      error: "Easy Breakouts works inside a Zoom meeting. Start or join a meeting, then open it from Apps.",
    }
  }

  // connect() links this instance to the app's other instances for
  // postMessage. It isn't required for breakout control, so a failure here
  // degrades gracefully instead of blocking the dashboard.
  let connected = true
  try {
    await zoomSdk.connect()
  } catch (err) {
    connected = false
    console.warn("zoomSdk.connect() failed:", errorMessage(err))
  }

  // getMeetingContext() only returns topic + ID; the participant's role
  // (host / coHost / attendee) comes from getUserContext().
  const [meeting, user] = await Promise.all([
    zoomSdk.getMeetingContext(),
    zoomSdk.getUserContext(),
  ])

  return {
    status: "ready",
    runningContext: config.runningContext,
    meeting,
    user,
    isHostOrCoHost: PRIVILEGED_ROLES.has(user.role),
    connected,
    isMock: false,
    client: zoomSdk,
  }
}

export function ZoomSdkProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ZoomSdkState>({ status: "loading" })
  // StrictMode mounts effects twice in dev; config() must only run once.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    initialize()
      .then(setState)
      .catch((err: unknown) =>
        setState({
          status: "error",
          error: `Could not reach the Zoom client: ${errorMessage(err)}. Open this app from inside a Zoom meeting, or add ?mock=host to preview it in a browser.`,
        }),
      )
  }, [])

  // Keep the role current if the host promotes or demotes this user mid-meeting.
  const isLive = state.status === "ready" && !state.isMock
  useEffect(() => {
    if (!isLive) return
    const handler = ({ role }: OnMyUserContextChangeEvent) => {
      setState((prev) =>
        prev.status === "ready"
          ? {
              ...prev,
              user: { ...prev.user, role },
              isHostOrCoHost: PRIVILEGED_ROLES.has(role),
            }
          : prev,
      )
    }
    zoomSdk.addEventListener("onMyUserContextChange", handler)
    return () => zoomSdk.removeEventListener("onMyUserContextChange", handler)
  }, [isLive])

  return (
    <ZoomSdkContext.Provider value={state}>
      {children}
    </ZoomSdkContext.Provider>
  )
}

export function useZoomSdk(): ZoomSdkContextValue {
  const ctx = useContext(ZoomSdkContext)
  if (!ctx) throw new Error("useZoomSdk must be used inside <ZoomSdkProvider>")
  return ctx
}
