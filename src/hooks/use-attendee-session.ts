import type { OnMessageEvent } from "@zoom/appssdk"
import { useCallback, useEffect, useRef, useState } from "react"

import type { Answers } from "@/lib/matchmaking/types"
import { decode, encode, type Questionnaire, type RoundInfo } from "@/lib/messages"
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
  const sessionId = useRef<string | null>(null)

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
            if (prev?.number !== message.round.number) setWarning(null)
            return message.round
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

  return {
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
