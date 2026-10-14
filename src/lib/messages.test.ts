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
