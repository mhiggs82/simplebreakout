import type { OnMessageEvent } from "@zoom/appssdk"
import { useCallback, useEffect, useRef, useState } from "react"

import type { Answers } from "@/lib/matchmaking/types"
import {
  decode,
  encode,
  type HarvestItem,
  type OpenTable,
  type PulseQuestion,
  type PulseResults,
  type Questionnaire,
  type RoundInfo,
  type Vote,
} from "@/lib/messages"
import type { ZoomClient } from "@/lib/zoom-client"

/**
 * Attendee side: receive the host's questions and send back answers, follow
 * timed rounds (prompt, countdown, closing warning) and take part in a
 * Fishbowl (see who's on stage, raise a hand to join).
 */
export function useAttendeeSession(client: ZoomClient, selfUuid: string) {
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null)
  const [submitted, setSubmitted] = useState<Answers | null>(null)
  const [started, setStarted] = useState(false)
  const [round, setRound] = useState<RoundInfo | null>(null)
  const [warning, setWarning] = useState<number | null>(null)
  const [stage, setStage] = useState<string[] | null>(null)
  const [handRaised, setHandRaised] = useState(false)
  const [poll, setPoll] = useState<PulseQuestion | null>(null)
  const [myVote, setMyVote] = useState<Vote | null>(null)
  const [results, setResults] = useState<PulseResults | null>(null)
  const [harvest, setHarvest] = useState<HarvestItem[] | null>(null)
  const [station, setStation] = useState<{ room: string; notes: string[] } | null>(null)
  const [tables, setTables] = useState<OpenTable[] | null>(null)
  const [insightsSent, setInsightsSent] = useState(0)
  const sessionId = useRef<string | null>(null)
  const tablesSession = useRef<string | null>(null)

  useEffect(() => {
    const onMessage = (event: OnMessageEvent) => {
      const message = decode(event.payload)
      switch (message?.type) {
        case "config":
          // New round of questions: earlier answers no longer apply.
          if (sessionId.current !== message.questionnaire.sessionId) {
            sessionId.current = message.questionnaire.sessionId
            setSubmitted(null)
            setStarted(false)
          }
          setQuestionnaire(message.questionnaire)
          break
        case "started":
          if (message.sessionId === sessionId.current) setStarted(true)
          break
        case "round":
          setRound((prev) => {
            if (prev?.number !== message.round.number) {
              setWarning(null)
              setInsightsSent(0)
            }
            return message.round
          })
          break
        case "poll":
          setPoll(message.poll)
          setMyVote(null)
          setResults(null)
          break
        case "results":
          setResults(message.results)
          break
        case "harvest":
          setHarvest(message.items)
          break
        case "station":
          if (message.members.includes(selfUuid)) setStation({ room: message.room, notes: message.notes })
          break
        case "tables":
          setTables((prev) => {
            // A new Open Space session replaces the list; chunks of the same session merge.
            const base = tablesSession.current === message.sessionId && prev ? prev : []
            tablesSession.current = message.sessionId
            const byUuid = new Map(base.map((t) => [t.uuid, t]))
            for (const table of message.tables) byUuid.set(table.uuid, table)
            return [...byUuid.values()].slice(0, message.total)
          })
          break
        case "warning":
          setWarning(message.secondsLeft)
          break
        case "ended":
          setRound(null)
          setWarning(null)
          setStage(null)
          setHandRaised(false)
          setPoll(null)
          setResults(null)
          setStation(null)
          setTables(null)
          break
        case "fishbowl":
          setStage(message.inner)
          if (message.inner.includes(selfUuid)) setHandRaised(false)
          break
      }
    }
    client.addEventListener("onMessage", onMessage)
    // Ask the host to (re)send the questions in case we opened the app late.
    void client.sendMessage({ payload: encode({ type: "hello" }) }).catch(() => {})
    return () => client.removeEventListener("onMessage", onMessage)
  }, [client, selfUuid])

  const submit = useCallback(
    async (answers: Answers) => {
      if (!questionnaire) return
      await client.sendMessage({
        payload: encode({ type: "answer", sessionId: questionnaire.sessionId, answers }),
      })
      setSubmitted(answers)
    },
    [client, questionnaire],
  )

  const setHand = useCallback(
    async (raised: boolean) => {
      await client.sendMessage({ payload: encode({ type: raised ? "raise" : "lower" }) })
      setHandRaised(raised)
    },
    [client],
  )

  const vote = useCallback(
    async (next: Vote) => {
      if (!poll) return
      await client.sendMessage({ payload: encode({ type: "vote", pollId: poll.id, vote: next }) })
      setMyVote(next)
    },
    [client, poll],
  )

  const sendInsight = useCallback(
    async (text: string) => {
      await client.sendMessage({ payload: encode({ type: "insight", text: text.trim().slice(0, 200) }) })
      setInsightsSent((n) => n + 1)
    },
    [client],
  )

  const joinTable = useCallback(
    (uuid: string) => client.changeBreakoutRoom({ action: "join", uuid }),
    [client],
  )

  return {
    poll,
    myVote,
    vote,
    results,
    harvest,
    station,
    tables,
    joinTable,
    sendInsight,
    insightsSent,
    questionnaire,
    submitted,
    started,
    submit,
    round,
    warning,
    stage,
    onStage: stage?.includes(selfUuid) ?? false,
    handRaised,
    setHand,
  }
}
