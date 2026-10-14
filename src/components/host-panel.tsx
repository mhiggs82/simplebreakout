import { useEffect, useRef, useState } from "react"

import { ActivityNav } from "@/components/activity-nav"
import { CafeSettingsCard } from "@/components/cafe-settings-card"
import { FishbowlCard } from "@/components/fishbowl-card"
import { HarvestBoard } from "@/components/harvest-board"
import { MatchSettingsCard } from "@/components/match-settings-card"
import { OpenSpaceCard } from "@/components/open-space-card"
import { OrchestrateCard } from "@/components/orchestrate-card"
import { ParticipantsCard } from "@/components/participants-card"
import { PulseCard } from "@/components/pulse-card"
import { RoomSettingsCard, type RoomSettings } from "@/components/room-settings-card"
import { RoundControlCard } from "@/components/round-control-card"
import { SpectrumCard, type SpectrumGrouping } from "@/components/spectrum-card"
import { SpeedSettingsCard } from "@/components/speed-settings-card"
import {
  GalleryCard,
  ONE_TWO_FOUR_STEPS,
  OneTwoFourCard,
  TPS_STEPS,
  TpsCard,
} from "@/components/step-format-cards"
import { useActivitySettings, type ActivitySettings } from "@/hooks/use-activity-settings"
import { useFishbowl } from "@/hooks/use-fishbowl"
import { useHarvest } from "@/hooks/use-harvest"
import { useHostSession } from "@/hooks/use-host-session"
import { useOpenSpace } from "@/hooks/use-open-space"
import { usePulse } from "@/hooks/use-pulse"
import { useRoundRunner, type StartOptions } from "@/hooks/use-round-runner"
import { useSeatListener } from "@/hooks/use-seat-listener"
import { uniqueNames } from "@/lib/matchmaking/engine"
import {
  formGalleryGroups,
  mergeGroups,
  planCafeRound,
  planGalleryRound,
  planSpeedRound,
  promptFor,
} from "@/lib/matchmaking/rounds"
import type { Activity, Candidate, TimedActivity } from "@/lib/matchmaking/types"
import { groupSimilar, pairOpposites, type SpectrumPoint } from "@/lib/pulse"
import type { ZoomClient } from "@/lib/zoom-client"

const PRIVILEGED = new Set(["host", "coHost"])

/** Formats where groups send key insights to the harvest board. */
const HARVESTING = new Set<Activity>(["oneTwoFour", "tps", "gallery"])

/** Minutes for the current step, for the round progress bar. */
function stepMinutes(activity: Activity, a: ActivitySettings, round: number): number {
  switch (activity) {
    case "cafe":
      return a.cafe.minutes
    case "speed":
      return a.speed.minutes
    case "oneTwoFour":
      return a.oneTwoFour.steps[Math.min(round, 3)].minutes
    case "tps":
      return a.tps[TPS_STEPS[Math.min(round, 2)].key].minutes
    case "gallery":
      return a.gallery.minutes
    default:
      return a.spectrum.minutes
  }
}

export function HostPanel({ client, selfUuid }: { client: ZoomClient; selfUuid: string }) {
  const session = useHostSession(client, selfUuid)
  const [activities, setActivities] = useActivitySettings()
  const runner = useRoundRunner()
  const fishbowl = useFishbowl(client)
  const pulse = usePulse(client)
  const seat = useSeatListener(client, selfUuid)
  const harvest = useHarvest(client, runner.state?.plan ?? null, true)
  const [running, setRunning] = useState<TimedActivity | null>(null)
  const [settings, setSettings] = useState<RoomSettings>({
    automaticallyMoveParticipantsIntoRooms: true,
    allowParticipantsReturnToMainSession: true,
    allowParticipantsChooseRoom: false,
    closeAfter: 0,
    countDown: 30,
  })

  // The runner calls back into these between rounds, so it always sees the
  // people in the meeting right now.
  const latest = useRef({ session, activities, votes: pulse.votes })
  const galleryGroups = useRef<Candidate[][]>([])
  useEffect(() => {
    latest.current = { session, activities, votes: pulse.votes }
  })

  /** Pinned people the SDK can't assign: you and other hosts / co-hosts. */
  const selfSeated = (uuid: string) => {
    const person = latest.current.session.people.find((p) => p.uuid === uuid)
    return person !== undefined && (person.isSelf || PRIVILEGED.has(person.zoomRole))
  }
  const openSpace = useOpenSpace(client, selfSeated)

  const { activity, cafe, speed, oneTwoFour, tps, gallery, spectrum } = activities
  const locked = runner.active || openSpace.phase === "open" || openSpace.phase === "opening"
  const setActivity = (value: Activity) => setActivities((a) => ({ ...a, activity: value }))
  const update = <K extends keyof ActivitySettings>(key: K) => (next: ActivitySettings[K]) =>
    setActivities((a) => ({ ...a, [key]: next }))

  const candidates = () => latest.current.session.candidates
  const timedSettings = { ...settings, closeAfter: 0 }

  function optionsFor(kind: TimedActivity, grouping?: SpectrumGrouping): StartOptions {
    const a = latest.current.activities
    const base = { client, activity: kind, settings: timedSettings, selfUuid }
    switch (kind) {
      case "cafe":
        return {
          ...base,
          rounds: a.cafe.rounds,
          minutes: a.cafe.minutes,
          prompt: (r) => promptFor(latest.current.activities.cafe.prompts, r),
          plan: (_r, history) =>
            planCafeRound(
              latest.current.activities.cafe.tables,
              candidates().filter((c) => !selfSeated(c.uuid)),
              history,
            ),
          seats: () => {
            const tables = latest.current.activities.cafe.tables
            const names = uniqueNames(tables.map((t) => ({ name: t.name, members: [] }))).map((r) => r.name)
            return tables.flatMap((t, i) =>
              t.pinned.filter(selfSeated).map((participantUUID) => ({ participantUUID, roomName: names[i] })),
            )
          },
        }
      case "speed":
        return {
          ...base,
          rounds: a.speed.rounds,
          minutes: a.speed.minutes,
          prompt: (r) => promptFor(a.speed.prompts, r),
          plan: (_r, history) =>
            planSpeedRound(candidates(), a.speed.groupSize, history, Math.random, a.speed.roomLabels),
        }
      case "oneTwoFour":
        return {
          ...base,
          rounds: 4,
          minutes: (r) => a.oneTwoFour.steps[r].minutes,
          prompt: (r) => a.oneTwoFour.steps[r].prompt || undefined,
          kind: (r) => (r === 0 || r === 3 ? "main" : "rooms"),
          label: (r) => ONE_TWO_FOUR_STEPS[r].label,
          harvest: (r) => r === 2,
          plan: (r, history, previous) =>
            r === 1 ? planSpeedRound(candidates(), 2, history) : mergeGroups(previous, candidates()),
        }
      case "tps":
        return {
          ...base,
          rounds: 3,
          minutes: (r) => a.tps[TPS_STEPS[r].key].minutes,
          prompt: (r) => a.tps[TPS_STEPS[r].key].prompt || undefined,
          kind: (r) => (r === 1 ? "rooms" : "main"),
          label: (r) => TPS_STEPS[r].label,
          harvest: (r) => r === 1,
          plan: (_r, history) => planSpeedRound(candidates(), 2, history),
        }
      case "gallery": {
        const stations = a.gallery.stations
        return {
          ...base,
          rounds: stations.length,
          minutes: a.gallery.minutes,
          prompt: (r) => promptFor(a.gallery.prompts, r),
          label: (r) => `Station ${r + 1} of ${stations.length}`,
          harvest: () => true,
          plan: (r) => {
            if (r === 0) galleryGroups.current = formGalleryGroups(candidates(), stations.length)
            return planGalleryRound(stations, galleryGroups.current, candidates(), r)
          },
        }
      }
      case "spectrum":
        return {
          ...base,
          rounds: 1,
          minutes: a.spectrum.minutes,
          prompt: () => latest.current.activities.spectrum.prompt || undefined,
          plan: () => {
            const { votes } = latest.current
            const points: SpectrumPoint[] = []
            const unanswered: Candidate[] = []
            for (const person of candidates()) {
              const vote = votes.get(person.uuid)
              if (vote && "value" in vote) points.push({ person, value: vote.value })
              else unanswered.push(person)
            }
            return grouping === "similar"
              ? groupSimilar(points, latest.current.activities.spectrum.groupSize, unanswered)
              : pairOpposites(points, unanswered)
          },
        }
    }
  }

  const start = (kind: TimedActivity, grouping?: SpectrumGrouping) => {
    if (HARVESTING.has(kind)) harvest.clear()
    setRunning(kind)
    runner.start(optionsFor(kind, grouping))
  }

  // Gallery walk: as each station round opens, show the group the notes left there before.
  // Think-Pair-Share / 1-2-4-All: when the final whole-group step opens, share the harvest.
  const handled = useRef("")
  const state = runner.state
  useEffect(() => {
    if (!state || state.phase !== "open" || !running) return
    const key = `${running}:${state.round}`
    if (handled.current === key) return
    handled.current = key
    if (running === "gallery" && state.plan) void harvest.sendStations(state.plan)
    if ((running === "tps" || running === "oneTwoFour") && state.kind === "main" && state.round > 0) {
      void harvest.share()
    }
  }, [state, running, harvest])

  const hint = (() => {
    const n = session.candidates.length
    switch (activity) {
      case "cafe": {
        const unhosted = cafe.tables.filter((t) => t.pinned.length === 0).length
        return unhosted > 0
          ? `${unhosted} table(s) have no Table Host yet.`
          : `${cafe.rounds} rotations of ${cafe.minutes} min across ${cafe.tables.length} tables.`
      }
      case "speed":
        return `${speed.rounds} rounds of ${speed.minutes} min, groups of ${speed.groupSize}.`
      case "oneTwoFour":
        return `${oneTwoFour.steps.reduce((t, s) => t + s.minutes, 0)} min in total for ${n} people.`
      case "tps":
        return `${tps.think.minutes + tps.pair.minutes + tps.share.minutes} min in total for ${n} people.`
      case "gallery":
        return `${gallery.stations.length} stations × ${gallery.minutes} min.`
      default:
        return undefined
    }
  })()

  const timedSetup = (kind: TimedActivity) => {
    switch (kind) {
      case "cafe":
        return <CafeSettingsCard value={cafe} onChange={update("cafe")} people={session.people} disabled={runner.active} />
      case "speed":
        return <SpeedSettingsCard value={speed} onChange={update("speed")} disabled={runner.active} />
      case "oneTwoFour":
        return <OneTwoFourCard value={oneTwoFour} onChange={update("oneTwoFour")} disabled={runner.active} />
      case "tps":
        return <TpsCard value={tps} onChange={update("tps")} disabled={runner.active} />
      case "gallery":
        return <GalleryCard value={gallery} onChange={update("gallery")} disabled={runner.active} />
      default:
        return null
    }
  }

  const controls = (kind: TimedActivity, hideStart = false) => (
    <RoundControlCard
      title={kind === "spectrum" ? "Rooms" : "Run it"}
      description="Steps advance automatically. You stay in the main room and can visit any room."
      runner={runner}
      minutes={stepMinutes(running ?? kind, activities, state?.round ?? 0)}
      canStart={session.candidates.length >= 2 && (kind !== "gallery" || gallery.stations.length >= 2)}
      startHint={hint}
      onStart={() => start(kind)}
      config={session.config}
      client={client}
      hideStart={hideStart}
    />
  )

  const isTimedSetup = activity === "cafe" || activity === "speed" || activity === "oneTwoFour" || activity === "tps" || activity === "gallery"

  return (
    <>
      {seat && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          You're hosting <strong>{seat.roomName}</strong>.{seat.error && ` ${seat.error}`}
        </p>
      )}
      <ActivityNav value={activity} onChange={setActivity} locked={locked} />

      {activity === "match" && (
        <>
          <MatchSettingsCard session={session} disabled={false} />
          <ParticipantsCard session={session} />
          <RoomSettingsCard settings={settings} onChange={setSettings} timed={false} />
          <OrchestrateCard client={client} session={session} settings={settings} />
        </>
      )}

      {isTimedSetup && (
        <>
          {timedSetup(activity)}
          <ParticipantsCard session={session} showAnswers={false} />
          <RoomSettingsCard settings={settings} onChange={setSettings} timed />
          {controls(activity)}
          {HARVESTING.has(activity) && (
            <HarvestBoard
              items={harvest.items}
              onRemove={harvest.remove}
              onShare={harvest.share}
              title={activity === "gallery" ? "Station notes" : "Harvest"}
              description={
                activity === "gallery"
                  ? "Notes each group leaves at a station. The next group at that station sees them."
                  : "Key insights groups send from their app panel. Shared automatically when everyone is back together."
              }
            />
          )}
        </>
      )}

      {activity === "openSpace" && (
        <>
          <OpenSpaceCard
            value={activities.openSpace}
            onChange={update("openSpace")}
            people={session.people}
            space={openSpace}
            client={client}
            onOpen={() =>
              void openSpace.open(activities.openSpace.tables, {
                ...settings,
                closeAfter: activities.openSpace.minutes,
              })
            }
          />
          <RoomSettingsCard settings={settings} onChange={setSettings} timed forceChoose />
        </>
      )}

      {activity === "pulse" && <PulseCard pulse={pulse} people={Math.max(0, session.people.length - 1)} />}

      {activity === "spectrum" && (
        <>
          <SpectrumCard
            pulse={pulse}
            people={session.people}
            value={spectrum}
            onChange={update("spectrum")}
            onGroup={(grouping) => start("spectrum", grouping)}
            running={runner.active}
          />
          {(runner.active || (running === "spectrum" && state)) && controls("spectrum", true)}
        </>
      )}

      {activity === "fishbowl" && (
        <FishbowlCard value={activities.fishbowl} onChange={update("fishbowl")} people={session.people} fishbowl={fishbowl} />
      )}
    </>
  )
}
