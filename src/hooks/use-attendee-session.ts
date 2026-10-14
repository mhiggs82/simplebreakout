import type { OnMessageEvent } from "@zoom/appssdk"
import { useCallback, useEffect, useRef, useState } from "react"

import type { Answers } from "@/lib/matchmaking/types"
import { decode, encode, type Questionnaire } from "@/lib/messages"
import type { ZoomClient } from "@/lib/zoom-client"

/** Attendee side: receive the host's questions, send back answers. */
export function useAttendeeSession(client: ZoomClient) {
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null)
  const [submitted, setSubmitted] = useState<Answers | null>(null)
  const [started, setStarted] = useState(false)
  const sessionId = useRef<string | null>(null)

  useEffect(() => {
    const onMessage = (event: OnMessageEvent) => {
      const message = decode(event.payload)
      if (message?.type === "config") {
        // New round of questions: earlier answers no longer apply.
        if (sessionId.current !== message.questionnaire.sessionId) {
          sessionId.current = message.questionnaire.sessionId
          setSubmitted(null)
          setStarted(false)
        }
        setQuestionnaire(message.questionnaire)
      } else if (message?.type === "started" && message.sessionId === sessionId.current) {
        setStarted(true)
      }
    }
    client.addEventListener("onMessage", onMessage)
    // Ask the host to (re)send the questions in case we opened the app late.
    void client.sendMessage({ payload: encode({ type: "hello" }) }).catch(() => {})
    return () => client.removeEventListener("onMessage", onMessage)
  }, [client])

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

  return { questionnaire, submitted, started, submit }
}
