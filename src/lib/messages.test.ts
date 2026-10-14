import { describe, expect, it } from "vitest"

import type { MatchConfig } from "@/lib/matchmaking/types"
import { byteSize, decode, encode, MAX_MESSAGE_BYTES, questionnaireFor, sanitizeAnswers } from "./messages"

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
    { type: "round" as const, round: { activity: "cafe" as const, number: 2, total: 3, prompt: "What surprised you?", endsAt: 1_700_000_000_000 } },
    { type: "round" as const, round: { activity: "speed" as const, number: 1, total: 5, prompt: undefined, endsAt: null } },
    { type: "warning" as const, secondsLeft: 60 },
    { type: "ended" as const },
    { type: "seat" as const, participantUUID: "p1", roomUuid: "room-1", roomName: "Scaling" },
    { type: "fishbowl" as const, inner: ["a", "b"] },
    { type: "raise" as const },
    { type: "lower" as const },
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
