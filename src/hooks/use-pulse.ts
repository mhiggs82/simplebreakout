import type { OnMessageEvent } from "@zoom/appssdk"
import { useCallback, useEffect, useMemo, useState } from "react"

import { decode, encode, fitLatest, type PulseQuestion, type PulseResults, type Vote } from "@/lib/messages"
import { histogram, tallyPoll, wordCloud } from "@/lib/pulse"
import type { ZoomClient } from "@/lib/zoom-client"

const CLOUD_SHARE_LIMIT = 20

/**
 * Host side of polls, word clouds and the spectrum line: ask a question,
 * collect each person's latest answer, and share anonymous results when ready.
 */
export function usePulse(client: ZoomClient) {
  const [question, setQuestion] = useState<PulseQuestion | null>(null)
  const [votes, setVotes] = useState<Map<string, Vote>>(new Map())
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [shared, setShared] = useState(false)

  useEffect(() => {
    if (!question) return
    const onMessage = (event: OnMessageEvent) => {
      const message = decode(event.payload)
      const uuid = event.participantUUID
      if (message?.type !== "vote" || message.pollId !== question.id || !uuid) return
      const valid =
        question.kind === "poll"
          ? "choice" in message.vote && message.vote.choice < (question.options?.length ?? 0)
          : question.kind === "cloud"
            ? "text" in message.vote
            : "value" in message.vote
      if (valid) setVotes((prev) => new Map(prev).set(uuid, message.vote))
    }
    client.addEventListener("onMessage", onMessage)
    return () => client.removeEventListener("onMessage", onMessage)
  }, [client, question])

  const results: PulseResults | null = useMemo(() => {
    if (!question) return null
    const all = [...votes.values()]
    const base = { id: question.id, kind: question.kind, question: question.question }
    if (question.kind === "poll") {
      return { ...base, options: question.options, counts: tallyPoll(all, question.options?.length ?? 0) }
    }
    if (question.kind === "cloud") return { ...base, words: wordCloud(all, hidden) }
    return { ...base, labels: question.labels, counts: histogram(all) }
  }, [question, votes, hidden])

  const ask = useCallback(
    async (next: Omit<PulseQuestion, "id">) => {
      const poll = { ...next, id: Math.random().toString(36).slice(2, 8) }
      setQuestion(poll)
      setVotes(new Map())
      setHidden(new Set())
      setShared(false)
      await client.sendMessage({ payload: encode({ type: "poll", poll }) })
    },
    [client],
  )

  const share = useCallback(async () => {
    if (!results) return
    const message =
      results.kind === "cloud"
        ? fitLatest((results.words ?? []).slice(0, CLOUD_SHARE_LIMIT).reverse(), (words) => ({
            type: "results",
            results: { ...results, words: [...words].reverse() },
          }))
        : { type: "results" as const, results }
    await client.sendMessage({ payload: encode(message) })
    setShared(true)
  }, [client, results])

  const close = useCallback(async () => {
    setQuestion(null)
    setVotes(new Map())
    await client.sendMessage({ payload: encode({ type: "ended" }) }).catch(() => {})
  }, [client])

  return {
    question,
    votes,
    results,
    shared,
    ask,
    share,
    close,
    hideWord: useCallback((word: string) => setHidden((h) => new Set(h).add(word)), []),
  }
}
