import type { JSONObject } from "@zoom/appssdk"

import type { Activity, Answers, CategoryDef, MatchConfig, MatchMode, RoleDef } from "@/lib/matchmaking/types"

/**
 * Host ↔ attendee protocol over `zoomSdk.sendMessage`, which broadcasts to
 * every participant who has the app open. Payloads are capped at 1 KB.
 *
 * - host → all: `config` (the questions to answer), `started` (rooms open),
 *   `round` (round number, prompt, end time), `warning` (closing soon),
 *   `ended` (activity over), `seat` (tells one host/co-host which room to
 *   join themselves) and `fishbowl` (who is on stage)
 * - attendee → all: `hello` (asks the host to resend the questions),
 *   `answer`, and `raise` / `lower` (Fishbowl: ask to join the circle)
 *
 * Everyone receives every message, so each side ignores the ones not meant
 * for it, and the host validates answers against its own config.
 */
export const MAX_MESSAGE_BYTES = 1024

const PREFIX = "sb1/"

/** The questions attendees answer, as sent to them. */
export interface Questionnaire {
  /** Changes whenever the host starts a new round of questions. */
  sessionId: string
  mode: Exclude<MatchMode, "random">
  roles: RoleDef[]
  categories: CategoryDef[]
}

export type Message =
  | { type: "config"; questionnaire: Questionnaire }
  | { type: "started"; sessionId: string }
  | { type: "hello" }
  | { type: "answer"; sessionId: string; answers: Answers }
  | { type: "round"; round: RoundInfo }
  | { type: "warning"; secondsLeft: number }
  | { type: "ended" }
  | { type: "seat"; participantUUID: string; roomUuid: string; roomName: string }
  | { type: "fishbowl"; inner: string[] }
  | { type: "raise" }
  | { type: "lower" }

/** What attendees see during a timed round. */
export interface RoundInfo {
  activity: Exclude<Activity, "match" | "fishbowl">
  /** 1-based round number. */
  number: number
  total: number
  prompt?: string
  /** Epoch milliseconds when the round closes (null while paused). */
  endsAt: number | null
}

export function questionnaireFor(config: MatchConfig, sessionId: string): Questionnaire | null {
  if (config.mode === "random") return null
  return {
    sessionId,
    mode: config.mode,
    roles: config.mode === "roles" ? config.roles : [],
    categories: config.mode === "attributes" ? config.categories : [],
  }
}

export function encode(message: Message): JSONObject {
  switch (message.type) {
    case "config": {
      const q = message.questionnaire
      return {
        t: PREFIX + "config",
        s: q.sessionId,
        m: q.mode,
        r: q.roles.map((r) => [r.id, r.label]),
        c: q.categories.map((c) => [c.id, c.label, c.options]),
      }
    }
    case "started":
      return { t: PREFIX + "started", s: message.sessionId }
    case "hello":
    case "ended":
    case "raise":
    case "lower":
      return { t: PREFIX + message.type }
    case "round": {
      const r = message.round
      return {
        t: PREFIX + "round",
        a: r.activity,
        n: r.number,
        o: r.total,
        e: r.endsAt,
        ...(r.prompt ? { p: r.prompt } : {}),
      }
    }
    case "warning":
      return { t: PREFIX + "warning", s: message.secondsLeft }
    case "seat":
      return { t: PREFIX + "seat", u: message.participantUUID, r: message.roomUuid, n: message.roomName }
    case "fishbowl":
      return { t: PREFIX + "fishbowl", i: message.inner }
    case "answer":
      return {
        t: PREFIX + "answer",
        s: message.sessionId,
        ...(message.answers.roleId ? { r: message.answers.roleId } : {}),
        g: message.answers.tags,
      }
  }
}

export function byteSize(payload: JSONObject): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length
}

const isString = (v: unknown): v is string => typeof v === "string" && v.length <= 200
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString)

/** Parses an untrusted payload from another participant; returns null if it isn't ours or is malformed. */
export function decode(payload: unknown): Message | null {
  if (typeof payload !== "object" || payload === null) return null
  const p = payload as Record<string, unknown>
  if (!isString(p.t) || !p.t.startsWith(PREFIX)) return null

  switch (p.t.slice(PREFIX.length)) {
    case "config": {
      if (!isString(p.s) || (p.m !== "roles" && p.m !== "attributes")) return null
      if (!Array.isArray(p.r) || !Array.isArray(p.c)) return null
      const roles = p.r.filter(
        (r): r is [string, string] => Array.isArray(r) && isString(r[0]) && isString(r[1]),
      )
      const categories = p.c.filter(
        (c): c is [string, string, string[]] =>
          Array.isArray(c) && isString(c[0]) && isString(c[1]) && isStringArray(c[2]),
      )
      return {
        type: "config",
        questionnaire: {
          sessionId: p.s,
          mode: p.m,
          roles: roles.map(([id, label]) => ({ id, label })),
          categories: categories.map(([id, label, options]) => ({ id, label, options })),
        },
      }
    }
    case "started":
      return isString(p.s) ? { type: "started", sessionId: p.s } : null
    case "hello":
    case "ended":
    case "raise":
    case "lower":
      return { type: p.t.slice(PREFIX.length) as "hello" | "ended" | "raise" | "lower" }
    case "round": {
      const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0 && (v as number) < 1000
      if ((p.a !== "cafe" && p.a !== "speed") || !isCount(p.n) || !isCount(p.o)) return null
      if (p.e !== null && typeof p.e !== "number") return null
      return {
        type: "round",
        round: {
          activity: p.a,
          number: p.n,
          total: p.o,
          endsAt: p.e,
          prompt: isString(p.p) ? p.p : undefined,
        },
      }
    }
    case "warning":
      return typeof p.s === "number" && p.s >= 0 ? { type: "warning", secondsLeft: p.s } : null
    case "seat":
      return isString(p.u) && isString(p.r) && isString(p.n)
        ? { type: "seat", participantUUID: p.u, roomUuid: p.r, roomName: p.n }
        : null
    case "fishbowl":
      return isStringArray(p.i) && p.i.length <= 9 ? { type: "fishbowl", inner: p.i } : null
    case "answer": {
      if (!isString(p.s) || typeof p.g !== "object" || p.g === null) return null
      const tags: Record<string, string> = {}
      for (const [key, value] of Object.entries(p.g)) {
        if (isString(key) && isString(value)) tags[key] = value
      }
      return {
        type: "answer",
        sessionId: p.s,
        answers: { roleId: isString(p.r) ? p.r : undefined, tags },
      }
    }
    default:
      return null
  }
}

/** Keeps only answers that match the host's current questions. */
export function sanitizeAnswers(answers: Answers, config: MatchConfig): Answers {
  const roleId = config.roles.some((r) => r.id === answers.roleId) ? answers.roleId : undefined
  const tags: Record<string, string> = {}
  for (const category of config.categories) {
    const value = answers.tags[category.id]
    if (value !== undefined && category.options.includes(value)) tags[category.id] = value
  }
  return { roleId, tags }
}
