import type { OnMessageEvent } from "@zoom/appssdk"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { Answers, Candidate, CategoryDef, MatchConfig } from "@/lib/matchmaking/types"
import {
  byteSize,
  decode,
  encode,
  MAX_MESSAGE_BYTES,
  questionnaireFor,
  sanitizeAnswers,
} from "@/lib/messages"
import { answersFromName, hasAnswers, nameTagInstructions } from "@/lib/name-tags"
import type { ZoomClient } from "@/lib/zoom-client"

/** Parents: same country and city, with teens of a similar age. */
export const PARENT_QUESTIONS: CategoryDef[] = [
  { id: "country", label: "Country", options: ["Netherlands", "Saudi Arabia", "United Kingdom", "United States", "Other"] },
  { id: "city", label: "City", options: ["Amsterdam", "Riyadh", "Jeddah", "London", "Other"] },
  { id: "teenAge", label: "Teen's age", options: ["12–13", "14–15", "16–17", "18+"] },
]

export const DEFAULT_CONFIG: MatchConfig = {
  mode: "random",
  groupSize: 4,
  roles: [
    { id: "mentor", label: "Mentor" },
    { id: "mentee", label: "Mentee" },
  ],
  anchorRoleId: null,
  // Questions are tried top first; when there aren't enough exact matches,
  // the bottom one is relaxed and people go to the closest room.
  categories: [...PARENT_QUESTIONS],
  matchOn: PARENT_QUESTIONS.map((c) => c.id),
  attributeStrategy: "similar",
  roomLabels: [],
}

// The host's roles and questions are reused across meetings on this device.
const STORAGE_KEY = "simplebreakout.config.v1"

function loadConfig(): MatchConfig {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")
    if (saved && Array.isArray(saved.roles) && Array.isArray(saved.categories)) {
      return { ...DEFAULT_CONFIG, ...saved }
    }
  } catch {
    // Storage unavailable or corrupt: fall back to defaults.
  }
  return DEFAULT_CONFIG
}

export interface MeetingPerson {
  uuid: string
  name: string
  zoomRole: string
  isSelf: boolean
}

/**
 * Zoom display names aren't unique ("iPhone", two people called Sam), so
 * repeats get a number: "Sam", "Sam (2)". Otherwise the host can't tell
 * them apart when pinning hosts or reading room plans.
 */
export function withUniqueNames<T extends { name: string }>(people: T[]): T[] {
  const seen = new Map<string, number>()
  return people.map((person) => {
    const n = (seen.get(person.name) ?? 0) + 1
    seen.set(person.name, n)
    return n === 1 ? person : { ...person, name: `${person.name} (${n})` }
  })
}

/** "name": read from a tag in their Zoom name, e.g. "Sam - Mentor". */
type StoredAnswers = Answers & { source: "self" | "host" | "name" }

const PRIVILEGED_ROLES = new Set(["host", "coHost"])

export function useHostSession(client: ZoomClient, selfUuid: string) {
  const [config, setConfig] = useState<MatchConfig>(loadConfig)
  const [people, setPeople] = useState<MeetingPerson[]>([])
  const [participantsError, setParticipantsError] = useState<string | null>(null)
  const [stored, setAnswers] = useState<Record<string, StoredAnswers>>({})
  // Hosts and co-hosts can't be assigned by the SDK, so they start excluded.
  const [included, setIncluded] = useState<Record<string, boolean>>({})
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sentQuestions, setSentQuestions] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    } catch {
      // Ignore: persistence is a convenience.
    }
  }, [config])

  const refreshParticipants = useCallback(async () => {
    try {
      const { participants } = await client.getMeetingParticipants()
      setPeople(
        withUniqueNames(
          participants.map((p) => ({
            uuid: p.participantUUID,
            name: p.screenName.trim() || "Unnamed",
            zoomRole: p.role,
            isSelf: p.participantUUID === selfUuid,
          })),
        ),
      )
      setParticipantsError(null)
    } catch (err) {
      setParticipantsError(
        `Couldn't load participants (${(err as { message?: string })?.message ?? err}). Zoom only shares the participant list with the meeting host.`,
      )
    }
  }, [client, selfUuid])

  useEffect(() => {
    void refreshParticipants()
    let timer: ReturnType<typeof setTimeout> | undefined
    const onChange = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void refreshParticipants(), 500)
    }
    client.addEventListener("onParticipantChange", onChange)
    return () => {
      clearTimeout(timer)
      client.removeEventListener("onParticipantChange", onChange)
    }
  }, [client, refreshParticipants])

  const questionnaire = useMemo(() => questionnaireFor(config, sessionId ?? "pending"), [config, sessionId])
  const questionsPayload = questionnaire ? encode({ type: "config", questionnaire }) : null
  const questionsBytes = questionsPayload ? byteSize(questionsPayload) : 0
  const questionsKey = questionnaire
    ? JSON.stringify({ ...questionnaire, sessionId: undefined })
    : null
  const questionsOutdated = sessionId !== null && questionsKey !== sentQuestions

  // Handlers registered once read the latest values through refs.
  const latest = useRef({ config, sessionId, questionsPayload })
  useEffect(() => {
    latest.current = { config, sessionId, questionsPayload }
  })
  const lastResend = useRef(0)

  useEffect(() => {
    const onMessage = (event: OnMessageEvent) => {
      const message = decode(event.payload)
      const { sessionId, config, questionsPayload } = latest.current
      if (!message || !sessionId) return

      if (message.type === "answer" && event.participantUUID && message.sessionId === sessionId) {
        const uuid = event.participantUUID
        setAnswers((prev) =>
          // An answer the host typed in for someone takes precedence.
          prev[uuid]?.source === "host"
            ? prev
            : { ...prev, [uuid]: { ...sanitizeAnswers(message.answers, config), source: "self" } },
        )
      } else if (message.type === "hello" && questionsPayload && Date.now() - lastResend.current > 2000) {
        // Someone opened the app late: resend the questions (throttled).
        lastResend.current = Date.now()
        void client.sendMessage({ payload: questionsPayload }).catch(() => {})
      }
    }
    client.addEventListener("onMessage", onMessage)
    return () => client.removeEventListener("onMessage", onMessage)
  }, [client])

  const sendQuestions = useCallback(async () => {
    const next = questionnaireFor(config, Math.random().toString(36).slice(2, 10))
    if (!next) return
    const payload = encode({ type: "config", questionnaire: next })
    if (byteSize(payload) > MAX_MESSAGE_BYTES) {
      throw new Error("The questions are too long to send. Shorten some labels or options.")
    }
    // Set the session first so answers arriving right away are accepted.
    latest.current.sessionId = next.sessionId
    setSessionId(next.sessionId)
    setSentQuestions(JSON.stringify({ ...next, sessionId: undefined }))
    // Answers from the previous round may not fit the new questions.
    setAnswers((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([, a]) => a.source === "host")),
    )
    await client.sendMessage({ payload })
  }, [client, config])

  const inviteEveryone = useCallback(() => client.sendAppInvitationToAllParticipants(), [client])

  const announceStart = useCallback(async () => {
    if (sessionId) await client.sendMessage({ payload: encode({ type: "started", sessionId }) })
  }, [client, sessionId])

  const setAnswer = useCallback((uuid: string, update: Answers) => {
    setAnswers((prev) => ({ ...prev, [uuid]: { ...update, source: "host" } }))
  }, [])

  const isIncluded = useCallback(
    (person: MeetingPerson) =>
      !person.isSelf && (included[person.uuid] ?? !PRIVILEGED_ROLES.has(person.zoomRole)),
    [included],
  )

  const setIncludedMany = useCallback((uuids: string[], value: boolean) => {
    setIncluded((prev) => ({ ...prev, ...Object.fromEntries(uuids.map((uuid) => [uuid, value])) }))
  }, [])

  const setIncludedFor = useCallback((uuid: string, value: boolean) => {
    setIncluded((prev) => ({ ...prev, [uuid]: value }))
  }, [])

  // Answers from the app or set by the host win; otherwise use tags in the Zoom name.
  const answers = useMemo(() => {
    const merged: Record<string, StoredAnswers> = { ...stored }
    for (const person of people) {
      if (merged[person.uuid]) continue
      const fromName = answersFromName(person.name, config)
      if (hasAnswers(fromName)) merged[person.uuid] = { ...fromName, source: "name" }
    }
    return merged
  }, [stored, people, config])

  const askForNameTags = useCallback(async () => {
    const message = nameTagInstructions(config)
    if (message) await client.sendMessageToChat({ message })
  }, [client, config])

  const candidates: Candidate[] = useMemo(
    () =>
      people.filter(isIncluded).map((person) => ({
        uuid: person.uuid,
        name: person.name,
        ...sanitizeAnswers(answers[person.uuid] ?? { tags: {} }, config),
      })),
    [people, isIncluded, answers, config],
  )

  return {
    config,
    setConfig,
    people,
    participantsError,
    refreshParticipants,
    answers,
    setAnswer,
    isIncluded,
    setIncluded: setIncludedFor,
    setIncludedMany,
    candidates,
    collecting: sessionId !== null,
    questionsBytes,
    questionsOutdated,
    sendQuestions,
    inviteEveryone,
    askForNameTags,
    announceStart,
  }
}

export type HostSession = ReturnType<typeof useHostSession>
