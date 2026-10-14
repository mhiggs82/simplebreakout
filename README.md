# Global Breakout

A one-click breakout room organizer for Zoom meetings, built as a **Zoom App** with the Zoom Apps SDK and **shadcn/ui**. Inspired by [Twine for Zoom](https://marketplace.zoom.us/apps/-cYA3VcaQduxP8suHFGXiA).

---

## Project Blueprint

### 1. Architectural Breakdown
* **Frontend Web Technology:** React + Vite + TypeScript application running inside the Zoom client's embedded Chromium browser (WebView).
* **The Bridge SDK:** Talks to the Zoom desktop client through the [`@zoom/appssdk`](https://www.npmjs.com/package/@zoom/appssdk) package to read meeting state and send breakout room commands.
* **Backend Target:** Light API endpoints that run the matchmaking sort rules and return clean assignment arrays to the client.
* **Design Language:** Sleek, modern SaaS interface with dark mode and WCAG-compliant keyboard and screen-reader accessibility.

### 2. Technical Prerequisites & Scopes
* **Environment Configuration:** Local development runs over trusted HTTPS at `https://localhost:5173`.
* **App Context Type:** Zoom Apps (In-Meeting app configuration).
* **Required OAuth Scopes:**
  - `zoomapp:inmeeting`
  - Breakout room management (host/co-host status enforced client-side).

### 3. Targeted SDK Core Methods
* `zoomSdk.config()` & `zoomSdk.connect()`: set up the channel and lifecycle.
* `zoomSdk.getMeetingContext()` + `zoomSdk.getUserContext()`: read the meeting and check host/co-host permissions.
* `zoomSdk.createBreakoutRooms()`: create the rooms.
* `zoomSdk.configureBreakoutRooms()`: submit settings (timers, voluntary room entry options).
* `zoomSdk.assignParticipantToBreakoutRoom()`: map each participant UUID to a room ID for one-click orchestration.

### 4. UI Library: shadcn/ui (Tailwind CSS + Radix UI)
* **Accessibility:** Radix UI primitives handle focus management and ARIA behavior.
* **Aesthetic:** Minimalist SaaS look that matches modern workflow tools.
* **Tailwind architecture:** Components are copied into the codebase (`src/components/ui`), so they're easy to change directly.

### 5. Development Strategy
1. Build an automated local HTTPS Vite pipeline. ✅
2. Set up and test the connection between the SDK wrapper and a mock meeting context. ✅
3. Build the matchmaking engine and one-click orchestration. ✅

---

## SDK Notes (corrections to the original blueprint)

Checked against the type definitions in `@zoom/appssdk@0.16.x`:

| Blueprint said | Reality |
| --- | --- |
| Package `@zoom/app-sdk` | The npm package is **`@zoom/appssdk`**. |
| `getMeetingContext()` validates host/co-host | It returns only `meetingTopic` and `meetingID`. The role (`host`, `coHost`, `attendee`, `panelist`) comes from **`getUserContext()`**. |
| `assignParticipantsToBreakoutRooms()` | The typed method is **`assignParticipantToBreakoutRoom({ uuid, participantUUID })`**. It assigns **one participant per call**, so orchestration loops over the plan. |

Every API the app calls must be listed in `config({ capabilities })` (see `src/hooks/use-zoom-sdk.tsx`) **and** enabled for the app in the Zoom Marketplace. Otherwise the client rejects the call.

---

## Matchmaking Modes

Modelled on [Twine for Zoom's matchmaking modes](https://help.ambient.us/en/articles/6029642-twine-for-zoom-matchmaking-modes).

| Mode | Twine equivalent | How it groups people |
| --- | --- | --- |
| **Random** | Speed Networking | Shuffles everyone into evenly sized rooms. |
| **Roles** | A+B Matching | Participants pick a role (e.g. *Table Host*, *Table Guest*). With **One room per Table Host**, every Table Host gets their own room and everyone else is shared out evenly. Without an anchor, each room gets a balanced mix of every role. |
| **Attributes** | Multi-Tag Matching | The host defines questions with fixed answers (Country, City, Child's age, Language…) and switches on which ones to match on. **Group people with the same answers** puts alike people together, top question first. When exact matches run out, it relaxes the lowest-priority question and keeps near-matches together. **Mix different answers** spreads each answer across rooms instead. |

Rules that apply to every mode:
* **People per room** is a minimum. Leftovers join existing rooms, so you never get a room of one.
* Zoom allows at most **50 rooms**. The engine merges the smallest groups if needed.
* People who didn't answer are treated as "match with anyone" and fill the smallest rooms.
* The host is always left out. Other hosts and co-hosts start unticked, because the SDK can't assign them, but you can tick them.

### How answers are collected
1. The host clicks **Send questions to participants**. This uses `zoomSdk.sendMessage`, which broadcasts to every participant who has the app open. No backend is needed.
2. Attendees see a short form in their app panel and send back their answers. Anyone who opens the app later asks the host to resend the questions.
3. The host sees answers arrive in **Participants**, and can set answers by hand for people who don't have the app (the arrow next to each name).
4. **Orchestrate Matchmaking** builds the plan and creates, configures, assigns and opens the rooms in one click. **Preview** shows the plan first; **Reshuffle** draws a new random one.

`sendMessage` payloads are limited to **1 KB**. The app shows a warning if your questions get too long.

The host's roles and questions are saved in the browser, so they're ready next meeting.

---

## Audience Interactions

The host panel keeps the everyday formats up front: **Match | Café | Speed**. Everything else is tucked under **More**: 1-2-4-All, Open Space, Think-Pair-Share, Gallery walk and Fishbowl. Your tables, prompts and timings are remembered on this device.

**You stay in the main room.** For any format that uses breakout rooms, open **Visit a room** in the controls to drop into any room, and **Back to main room** to return.

### World Café
Themed tables with a **Table Host who stays put**, while everyone else ("travellers") moves to a new table each round.
* Name each table (e.g. *Sustainability*, *Scaling*) and pin a Table Host to it. The Table Host can be an attendee or a co-host. You stay in the main room and can visit any table.
* Set the number of rotations, minutes per round, and one prompt per round.
* Travellers are spread evenly. Each round prefers tables they haven't visited yet and people they haven't met.
* **Hosts and co-hosts can't be moved by the Zoom SDK.** So when one of them is pinned, their own Global Breakout panel joins the table for them (`changeBreakoutRoom`). They need the app open.

### Speed Networking
Short timed rounds of pairs or small groups.
* Every round reshuffles people to avoid repeat pairings. For example, 8 people in pairs can do 7 rounds where everyone meets everyone exactly once.
* Optional icebreaker prompts (**Add icebreakers** inserts a starter set) and optional room names.

### Round prompts and timers (every timed format)
* Rounds advance automatically: rooms open → countdown → rooms close (with Zoom's closing countdown) → the next rotation is calculated → rooms reopen.
* Host controls: **Pause/Resume**, **+2 min**, **Next round**, **End**.
* Attendees see the round number, a live countdown and the round's prompt in their app panel, plus a "1 minute left" warning.

### Fishbowl
A small inner circle talks on the **main stage** while everyone else watches.
* Choose up to 9 speakers and click **Put on stage**. The app spotlights them (`addParticipantSpotlight`).
* Observers tap **Ask to join the circle** in their panel. You see a queue of raised hands and click **Swap in** to replace a current speaker.
* Spotlight needs each speaker's video on. Use Zoom's *Mute all* to keep observers quiet.

### 1-2-4-All *(More)*
1. **On your own** in the main room (1 min).
2. **Pairs** in breakout rooms (2 min).
3. **Fours**: each pair joins another pair (4 min). Fours send a key insight from their panel.
4. **All** together in the main room. The harvest is shared with everyone automatically.

Minutes and the prompt for each step are editable.

### Think-Pair-Share + harvest *(More)*
**Think** alone in the main room, then **Pair** in breakout rooms, sending one key insight each, then **Share** back in the main room. The harvest board fills in live as insights arrive, labelled by room. It's shared with everyone when Share starts, and you can remove items or reshare at any time.

### Gallery walk *(More)*
Name the stations (rooms). Groups are formed once, stay together, and move one station per round until they've seen every station. At each station the group sees the notes earlier groups left there, and adds its own from the panel.

### Open Space / pick-a-table *(More)*
Name the tables. Each one can have a seat limit (0 means none) and a table host. Click **Open the space**, and attendees see the tables with live head-counts and **Join** buttons, so they can move whenever they like. Seat limits are **soft**: full tables are disabled in the app, but Zoom's own breakout menu still works, so nobody gets stuck. Optionally the space closes itself after a set number of minutes.

### Things to confirm in a real meeting
* Whether `sendMessage` reaches people already in breakout rooms. Insights, station notes and warnings depend on it. If it doesn't, prompts still arrive as each round starts, before people move, and Zoom's own closing countdown still warns everyone.
* Whether `changeBreakoutRoom` lets attendees join an Open Space table directly from the app panel while Zoom's self-select is on.
* Visiting rooms from the host panel uses `changeBreakoutRoom`, which Zoom documents for hosts.

---

## Going live

See **[GO-LIVE.md](GO-LIVE.md)** for hosting (Vercel, Cloudflare Pages or Netlify), Zoom Marketplace setup, what you can test without Zoom's approval, and a first live-test checklist.

---

## Getting Started

### Prerequisites
* Node.js 20.19+ (22 recommended)
* Zoom desktop client 5.13+
* A Zoom App created in the [Zoom App Marketplace](https://marketplace.zoom.us/) (Build App → General App)

### Install and run
```bash
npm install
npm run dev
```

The dev server runs on **https://localhost:5173**. On first run, [`vite-plugin-mkcert`](https://github.com/liuweiGL/vite-plugin-mkcert) downloads [mkcert](https://github.com/FiloSottile/mkcert), installs a local certificate authority (it may ask for your password), and issues a trusted certificate for `localhost`. The Zoom client's embedded browser then accepts the dev server.

Already have mkcert installed (for example `brew install mkcert`)? Point the plugin at it:
```bash
MKCERT_PATH=$(which mkcert) npm run dev
```

The dev and preview servers send the security headers Zoom requires: `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy` and `Content-Security-Policy`. Without them Zoom refuses to load the app.

### Preview outside Zoom
The SDK only works inside the Zoom client. To work on the UI in a normal browser, add a mock role:

* `https://localhost:5173/?mock=host`: host dashboard with 20 simulated participants. When you send questions, most of them answer within a couple of seconds, and orchestration runs against a simulated Zoom.
* `https://localhost:5173/?mock=coHost`: co-host view
* `https://localhost:5173/?mock=attendee`: attendee view. A simulated host sends questions after a moment.
* `?mock=attendee&scenario=round`: attendee during a café round (prompt, countdown, 1-minute warning).
* `?mock=attendee&scenario=fishbowl`: attendee watching a Fishbowl, with the raise-hand button.
* `?mock=attendee&scenario=openspace` or `gallery`: the attendee side of those More formats.
* Add `&fast=1` to make simulated rooms close quickly.
* Stress-test flags for `?mock=host`: `people=N` (meeting size, 1–200), `cohosts=K`, `churn=1` (people keep joining and leaving), `chaos=1` (about 10% of SDK calls fail, and rooms close slowly). For example: `?mock=host&fast=1&people=60&cohosts=2&churn=1&chaos=1`.

### Configure the Zoom App (Marketplace)
1. **Home URL / OAuth Redirect URL:** `https://localhost:5173`
2. **Domain Allow List:** add `localhost`
3. **Features → Zoom App SDK:** enable the APIs listed in `ZOOM_CAPABILITIES` in `src/hooks/use-zoom-sdk.tsx` (`getMeetingContext`, `getUserContext`, `getMeetingParticipants`, `onParticipantChange`, `createBreakoutRooms`, `configureBreakoutRooms`, `openBreakoutRooms`, `closeBreakoutRooms`, `getBreakoutRoomList`, `assignParticipantToBreakoutRoom`, `changeBreakoutRoom`, `sendMessage`, `onMessage`, `sendAppInvitationToAllParticipants`, `addParticipantSpotlight`, `removeParticipantSpotlights`, `getParticipantSpotlights`, `onMyUserContextChange`, …). `sendMessage` needs Zoom desktop client 5.15.5 or later.
4. **Scopes:** `zoomapp:inmeeting`
5. Add the app to your account (**Local Test → Add App Now**), start a meeting, and open it from the **Apps** panel.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | HTTPS dev server on port 5173 |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run preview` | Serve the production build over HTTPS |
| `npm run lint` | Lint with oxlint |
| `npm test` | Run unit tests (Vitest) |

Add more shadcn/ui components with `npx shadcn@latest add <component>`.

---

## Project Structure

```
src/
├── App.tsx                          # Wraps the dashboard in ZoomSdkProvider
├── main.tsx                         # Entry point + system dark-mode sync
├── index.css                        # Tailwind v4 + shadcn theme tokens
├── hooks/
│   ├── use-zoom-sdk.tsx             # config() → connect() → meeting/user context, role check
│   ├── use-host-session.ts          # Participants, questions, collected answers (host)
│   ├── use-attendee-session.ts      # Questions, round prompts/timer, Fishbowl hand (attendee)
│   ├── use-activity-settings.ts     # Activity choice + café/speed/fishbowl settings (saved)
│   ├── use-round-runner.ts          # React wrapper around the round runner
│   ├── use-harvest.ts               # Insights + gallery station notes (host)
│   ├── use-open-space.ts            # Open Space tables, live head-counts (host)
│   ├── use-seat-listener.ts         # Pinned hosts/co-hosts join their table themselves
│   └── use-fishbowl.ts              # Spotlight stage + raised-hand queue (host)
├── components/
│   ├── breakout-dashboard.tsx       # Host vs attendee layout
│   ├── host-panel.tsx               # Host: activity navigation + wiring for every format
│   ├── activity-nav.tsx             # Match | Café | Speed | More ▾
│   ├── orchestrate-card.tsx         # One-click matching: preview, orchestrate, close
│   ├── room-settings-card.tsx       # Zoom breakout room options
│   ├── room-visitor.tsx             # Host visits a room / returns to main room
│   ├── step-format-cards.tsx        # 1-2-4-All, Think-Pair-Share, Gallery walk setup
│   ├── open-space-card.tsx          # Open Space tables, limits, live counts
│   ├── harvest-board.tsx            # Collected insights / station notes
│   ├── match-settings-card.tsx      # Mode tabs, roles editor, questions editor
│   ├── participants-card.tsx        # Include/exclude, answers, host overrides
│   ├── room-plan.tsx                # Preview of planned rooms
│   ├── cafe-settings-card.tsx       # Named tables, pinned Table Hosts, rotations
│   ├── speed-settings-card.tsx      # Group size, rounds, icebreakers, room names
│   ├── round-control-card.tsx       # Start, countdown, pause / +2 min / next / end
│   ├── fishbowl-card.tsx            # Stage, raised hands, swap in
│   ├── attendee-panel.tsx           # Attendee questions, round prompt, Fishbowl
│   └── ui/                          # shadcn/ui primitives
└── lib/
    ├── matchmaking/engine.ts        # Pure matching logic for all three modes (+ tests)
    ├── matchmaking/rounds.ts        # Speed rounds, café rotations, 1-2-4 merging, gallery rotation (+ tests)
    ├── round-runner.ts              # Timed steps (rooms or main room) state machine (+ tests)
    ├── orchestrate.ts               # create → configure → assign → open (+ tests)
    ├── messages.ts                  # sendMessage protocol, validation, 1 KB check (+ tests)
    ├── zoom-client.ts               # SDK surface used + in-browser mock
    └── utils.ts                     # cn() class-merging helper
vite.config.ts                       # HTTPS (mkcert), Zoom security headers, @/ alias
components.json                      # shadcn/ui configuration
```

### `useZoomSdk()`
```tsx
const zoom = useZoomSdk()

if (zoom.status === "ready" && zoom.isHostOrCoHost) {
  await zoom.client.configureBreakoutRooms({ automaticallyMoveParticipantsIntoRooms: true })
}
```
`status` is `"loading" | "error" | "ready"`. When ready, it exposes `meeting`, `user` (including `role`), `isHostOrCoHost`, `connected`, `isMock` and `client`: the SDK, or an in-browser simulation of it in mock mode. The role updates live if the user is promoted or demoted during the meeting.

---

## Roadmap
- [x] Matchmaking engine: random, roles and attributes modes
- [x] One-click orchestration with progress and per-person error reporting
- [x] Attendee self-selection via `sendMessage`
- [x] World Café: named tables, pinned Table Hosts, rotating travellers; host visits from the main room
- [x] Speed Networking: timed rounds with no repeat pairings and icebreakers
- [x] Round prompts, live countdown and 1-minute warning
- [x] Fishbowl on the main stage with raised hands and swap-in
- [x] 1-2-4-All, Think-Pair-Share with harvest, Gallery walk
- [x] Open Space / pick-a-table with live head-counts
- [ ] Session agenda: chain several formats into one run (e.g. speed → café → harvest)
- [ ] Export the harvest (CSV / copy to clipboard)
- [ ] Strict matching option (leave people in the main room rather than mix)
