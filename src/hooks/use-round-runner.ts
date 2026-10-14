import { useCallback, useEffect, useRef, useState } from "react"

import { RoundRunner, type RoundRunnerOptions, type RunnerState } from "@/lib/round-runner"

export type StartOptions = Omit<RoundRunnerOptions, "onChange">

const ACTIVE = new Set<RunnerState["phase"]>(["preparing", "open", "paused", "closing"])

/** React wrapper around RoundRunner: exposes its state and controls. */
export function useRoundRunner() {
  const runner = useRef<RoundRunner | null>(null)
  const [state, setState] = useState<RunnerState | null>(null)

  useEffect(() => () => runner.current?.dispose(), [])

  const start = useCallback((options: StartOptions) => {
    runner.current?.dispose()
    const next = new RoundRunner({ ...options, onChange: setState })
    runner.current = next
    setState(next.current)
    void next.start()
  }, [])

  return {
    state,
    active: state !== null && ACTIVE.has(state.phase),
    start,
    pause: useCallback(() => runner.current?.pause(), []),
    resume: useCallback(() => runner.current?.resume(), []),
    extend: useCallback((minutes: number) => runner.current?.extend(minutes), []),
    skip: useCallback(() => runner.current?.skip(), []),
    end: useCallback(() => runner.current?.end(), []),
  }
}
