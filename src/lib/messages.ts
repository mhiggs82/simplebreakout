import type { JSONObject } from "@zoom/appssdk"

import {
  TIMED_ACTIVITIES,
  type Answers,
  type CategoryDef,
  type MatchConfig,
  type MatchMode,
  type RoleDef,
  type TimedActivity,
} from "@/lib/matchmaking/types"

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
  | { type: "poll"; poll: PulseQuestion }
  | { type: "vote"; pollId: string; vote: Vote }
  | { type: "results"; results: PulseResults }
  | { type: "insight"; text: string }
  | { type: "harvest"; items: HarvestItem[] }
  | { type: "station"; room: string; members: string[]; notes: string[] }
  | { type: "tables"; sessionId: string; total: number; tables: OpenTable[] }

export type PulseKind = "poll" | "cloud" | "spectrum"

/** A live question: a single-choice poll, a word cloud or a 1–10 spectrum. */
export interface PulseQuestion {
  id: string
  kind: PulseKind
  question: string
  /** Poll answer options. */
  options?: string[]
  /** Spectrum end labels: [left, right]. */
  labels?: [string, string]
}

export type Vote = { choice: number } | { text: string } | { value: number }

/** Anonymous results the host chooses to share. */
export interface PulseResults {
  id: string
  kind: PulseKind
  question: string
  /** Poll: count per option. Spectrum: count per value 1–10. */
  counts?: number[]
  options?: string[]
  labels?: [string, string]
  /** Word cloud: [word, count], most frequent first. */
  words?: [string, number][]
}

export interface HarvestItem {
  room: string
  text: string
}

/** An Open Space table as attendees see it. */
export interface OpenTable {
  uuid: string
  name: string
  count: number
  /** 0 = no limit. */
  limit: number
}

/** What attendees see during a timed round. */
export interface RoundInfo {
  activity: TimedActivity
  /** Main-room steps (e.g. silent reflection) have no breakout rooms. */
  kind: "rooms" | "main"
  /** Step name, e.g. "Pairs". */
  label?: string
  /** Attendees can send a key insight during this step. */
  harvest: boolean
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
        ...(r.kind === "main" ? { k: "m" } : {}),
        ...(r.label ? { l: r.label } : {}),
        ...(r.harvest ? { h: 1 } : {}),
      }
    }
    case "warning":
      return { t: PREFIX + "warning", s: message.secondsLeft }
    case "seat":
      return { t: PREFIX + "seat", u: message.participantUUID, r: message.roomUuid, n: message.roomName }
    case "fishbowl":
      return { t: PREFIX + "fishbowl", i: message.inner }
    case "poll": {
      const q = message.poll
      return {
        t: PREFIX + "poll",
        i: q.id,
        k: q.kind,
        q: q.question,
        ...(q.options ? { o: q.options } : {}),
        ...(q.labels ? { b: q.labels } : {}),
      }
    }
    case "vote": {
      const v = message.vote
      return {
        t: PREFIX + "vote",
        i: message.pollId,
        ...("choice" in v ? { c: v.choice } : "text" in v ? { x: v.text } : { v: v.value }),
      }
    }
    case "results": {
      const r = message.results
      return {
        t: PREFIX + "results",
        i: r.id,
        k: r.kind,
        q: r.question,
        ...(r.counts ? { n: r.counts } : {}),
        ...(r.options ? { o: r.options } : {}),
        ...(r.labels ? { b: r.labels } : {}),
        ...(r.words ? { w: r.words } : {}),
      }
    }
    case "insight":
      return { t: PREFIX + "insight", x: message.text }
    case "harvest":
      return { t: PREFIX + "harvest", h: message.items.map((i) => [i.room, i.text]) }
    case "station":
      return { t: PREFIX + "station", r: message.room, m: message.members, n: message.notes }
    case "tables":
      return {
        t: PREFIX + "tables",
        s: message.sessionId,
        n: message.total,
        r: message.tables.map((t) => [t.uuid, t.name, t.count, t.limit]),
      }
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
const isPair = (v: unknown): v is [string, string] =>
  Array.isArray(v) && v.length === 2 && isString(v[0]) && isString(v[1])
const isKind = (v: unknown): v is PulseKind => v === "poll" || v === "cloud" || v === "spectrum"

/**
 * Keep as many items as fit in one message. `make` builds the message from
 * a prefix of the items; items are dropped from the front (oldest first).
 */
export function fitLatest<T>(items: T[], make: (items: T[]) => Message): Message {
  for (let start = 0; start <= items.length; start++) {
    const message = make(items.slice(start))
    if (byteSize(encode(message)) <= MAX_MESSAGE_BYTES) return message
  }
  return make([])
}

/** Split a list into as many messages as needed to stay under the size limit. */
export function fitChunks<T>(items: T[], make: (items: T[]) => Message): Message[] {
  const out: Message[] = []
  let chunk: T[] = []
  for (const item of items) {
    const next = [...chunk, item]
    if (chunk.length > 0 && byteSize(encode(make(next))) > MAX_MESSAGE_BYTES) {
      out.push(make(chunk))
      chunk = [item]
    } else {
      chunk = next
    }
  }
  if (chunk.length > 0 || out.length === 0) out.push(make(chunk))
  return out
}

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
      if (!TIMED_ACTIVITIES.includes(p.a as TimedActivity) || !isCount(p.n) || !isCount(p.o)) return null
      if (p.e !== null && typeof p.e !== "number") return null
      return {
        type: "round",
        round: {
          activity: p.a as TimedActivity,
          number: p.n,
          total: p.o,
          endsAt: p.e,
          prompt: isString(p.p) ? p.p : undefined,
          kind: p.k === "m" ? "main" : "rooms",
          label: isString(p.l) ? p.l : undefined,
          harvest: p.h === 1,
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
    case "poll": {
      if (!isString(p.i) || !isKind(p.k) || !isString(p.q)) return null
      const options = isStringArray(p.o) && p.o.length >= 2 && p.o.length <= 8 ? p.o : undefined
      const labels = isPair(p.b) ? p.b : undefined
      if (p.k === "poll" && !options) return null
      return { type: "poll", poll: { id: p.i, kind: p.k, question: p.q, options, labels } }
    }
    case "vote": {
      if (!isString(p.i)) return null
      let vote: Vote | null = null
      if (Number.isInteger(p.c) && (p.c as number) >= 0 && (p.c as number) < 8) vote = { choice: p.c as number }
      else if (isString(p.x) && p.x.trim()) vote = { text: p.x.slice(0, 60) }
      else if (Number.isInteger(p.v) && (p.v as number) >= 1 && (p.v as number) <= 10) vote = { value: p.v as number }
      return vote ? { type: "vote", pollId: p.i, vote } : null
    }
    case "results": {
      if (!isString(p.i) || !isKind(p.k) || !isString(p.q)) return null
      const counts = Array.isArray(p.n) && p.n.every((c) => Number.isInteger(c) && c >= 0) ? (p.n as number[]) : undefined
      const words = Array.isArray(p.w)
        ? (p.w.filter((w) => Array.isArray(w) && isString(w[0]) && Number.isInteger(w[1])) as [string, number][])
        : undefined
      return {
        type: "results",
        results: {
          id: p.i,
          kind: p.k,
          question: p.q,
          counts,
          words,
          options: isStringArray(p.o) ? p.o : undefined,
          labels: isPair(p.b) ? p.b : undefined,
        },
      }
    }
    case "insight":
      return isString(p.x) && p.x.trim() ? { type: "insight", text: p.x.trim() } : null
    case "harvest":
      if (!Array.isArray(p.h)) return null
      return {
        type: "harvest",
        items: p.h.filter(isPair).map(([room, text]) => ({ room, text })),
      }
    case "station":
      if (!isString(p.r) || !isStringArray(p.m) || !isStringArray(p.n)) return null
      return { type: "station", room: p.r, members: p.m, notes: p.n }
    case "tables": {
      if (!isString(p.s) || !Number.isInteger(p.n) || !Array.isArray(p.r)) return null
      const tables = p.r.filter(
        (t): t is [string, string, number, number] =>
          Array.isArray(t) && isString(t[0]) && isString(t[1]) && Number.isInteger(t[2]) && Number.isInteger(t[3]),
      )
      return {
        type: "tables",
        sessionId: p.s,
        total: p.n as number,
        tables: tables.map(([uuid, name, count, limit]) => ({ uuid, name, count, limit })),
      }
    }
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
