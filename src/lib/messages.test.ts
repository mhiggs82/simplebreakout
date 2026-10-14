import { describe, expect, it } from "vitest"

import type { MatchConfig } from "@/lib/matchmaking/types"
import {
  byteSize,
  decode,
  encode,
  fitChunks,
  fitLatest,
  MAX_MESSAGE_BYTES,
  questionnaireFor,
  sanitizeAnswers,
} from "./messages"

const config: MatchConfig = {
  mode: "attributes",
  groupSize: 4,
  roles: [{ id: "host", label: "Table Host" }],
  anchorRoleId: "host",
  categories: [
    { id: "country", label: "Country", options: ["United States", "United Kingdom", "Netherlands", "Saudi Arabia", "Other"] },
    { id: "city", label: "City", options: ["New York", "London", "Amsterdam", "Riyadh", "Other"] },
    { id: "childAge", label: "Child's age", options: ["0–4", "5–11", "12–14", "15–18"] },
    { id: "language", label: "Language", options: ["English", "Spanish", "Arabic", "Dutch", "Other"] },
  ],
  matchOn: ["country"],
  attributeStrategy: "similar",
  roomLabels: [],
}

describe("messages", () => {
  it("round-trips a questionnaire", () => {
    const questionnaire = questionnaireFor(config, "s1")!
    const decoded = decode(encode({ type: "config", questionnaire }))
    expect(decoded).toEqual({ type: "config", questionnaire })
  })

  it("keeps the default questionnaire under Zoom's 1 KB limit", () => {
    const payload = encode({ type: "config", questionnaire: questionnaireFor(config, "abcdef12")! })
    expect(byteSize(payload)).toBeLessThan(MAX_MESSAGE_BYTES)
  })

  it("round-trips an answer", () => {
    const message = { type: "answer" as const, sessionId: "s1", answers: { roleId: "host", tags: { country: "Other" } } }
    expect(decode(encode(message))).toEqual(message)
  })

  it("ignores foreign and malformed payloads", () => {
    expect(decode({ hello: "world" })).toBeNull()
    expect(decode({ t: "sb1/answer", s: "s1", g: "nope" })).toBeNull()
    expect(decode({ t: "sb1/config", s: "s1", m: "random", r: [], c: [] })).toBeNull()
    expect(decode(null)).toBeNull()
  })

  it("drops answers that are not among the host's options", () => {
    expect(
      sanitizeAnswers({ roleId: "admin", tags: { country: "Atlantis", city: "London", extra: "x" } }, config),
    ).toEqual({ roleId: undefined, tags: { city: "London" } })
  })

  it("has no questionnaire in random mode", () => {
    expect(questionnaireFor({ ...config, mode: "random" }, "s1")).toBeNull()
  })
})

describe("interaction messages", () => {
  const messages = [
    { type: "round" as const, round: { activity: "cafe" as const, number: 2, total: 3, prompt: "What surprised you?", endsAt: 1_700_000_000_000, kind: "rooms" as const, harvest: false } },
    { type: "round" as const, round: { activity: "oneTwoFour" as const, number: 1, total: 4, prompt: "Reflect alone", endsAt: 5, kind: "main" as const, label: "On your own", harvest: true } },
    { type: "round" as const, round: { activity: "speed" as const, number: 1, total: 5, prompt: undefined, endsAt: null, kind: "rooms" as const, label: undefined, harvest: false } },
    { type: "warning" as const, secondsLeft: 60 },
    { type: "ended" as const },
    { type: "seat" as const, participantUUID: "p1", roomUuid: "room-1", roomName: "Scaling" },
    { type: "fishbowl" as const, inner: ["a", "b"] },
    { type: "raise" as const },
    { type: "lower" as const },
    { type: "insight" as const, text: "Trust is built in small moments" },
    { type: "harvest" as const, items: [{ room: "Room 1", text: "Listen first" }] },
    { type: "station" as const, room: "Station A", members: ["u1", "u2"], notes: ["Note one"] },
    { type: "tables" as const, sessionId: "s1", total: 2, tables: [{ uuid: "r1", name: "Ideas", count: 3, limit: 5 }] },
  ]

  it.each(messages)("round-trips $type", (message) => {
    expect(decode(encode(message))).toEqual(message)
  })

  it("rejects malformed rounds and oversized fishbowls", () => {
    expect(decode({ t: "sb1/round", a: "cafe", n: 0, o: 3, e: null })).toBeNull()
    expect(decode({ t: "sb1/round", a: "fishbowl", n: 1, o: 3, e: null })).toBeNull()
    expect(decode({ t: "sb1/fishbowl", i: Array(10).fill("x") })).toBeNull()
  })

  it("keeps a full fishbowl stage under the size limit", () => {
    const inner = Array.from({ length: 9 }, () => "abcdefgh-1234-5678-9abc-def012345678")
    expect(byteSize(encode({ type: "fishbowl", inner }))).toBeLessThan(MAX_MESSAGE_BYTES)
  })
})

describe("size fitting", () => {
  it("keeps the latest harvest items that fit", () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ room: `Room ${i}`, text: `Insight number ${i} `.repeat(4) }))
    const message = fitLatest(items, (kept) => ({ type: "harvest", items: kept }))
    expect(byteSize(encode(message))).toBeLessThanOrEqual(MAX_MESSAGE_BYTES)
    expect(message.type === "harvest" && message.items.at(-1)?.room).toBe("Room 39")
  })

  it("splits many Open Space tables across messages", () => {
    const tables = Array.from({ length: 30 }, (_, i) => ({
      uuid: `{${"x".repeat(36)}-${i}}`,
      name: `A fairly long table name ${i}`,
      count: i,
      limit: 8,
    }))
    const messages = fitChunks(tables, (chunk) => ({ type: "tables", sessionId: "s", total: 30, tables: chunk }))
    expect(messages.length).toBeGreaterThan(1)
    for (const m of messages) expect(byteSize(encode(m))).toBeLessThanOrEqual(MAX_MESSAGE_BYTES)
    expect(messages.flatMap((m) => (m.type === "tables" ? m.tables : []))).toHaveLength(30)
  })
})
