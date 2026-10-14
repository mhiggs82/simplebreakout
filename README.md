# SimpleBreakout

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
3. Stub the matchmaking pipeline that turns participant lists into the breakout payload schema. ⏳

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

* `https://localhost:5173/?mock=host`: full host dashboard
* `https://localhost:5173/?mock=coHost`: co-host view
* `https://localhost:5173/?mock=attendee`: read-only view, orchestration disabled

### Configure the Zoom App (Marketplace)
1. **Home URL / OAuth Redirect URL:** `https://localhost:5173`
2. **Domain Allow List:** add `localhost`
3. **Features → Zoom App SDK:** enable the APIs listed in `ZOOM_CAPABILITIES` in `src/hooks/use-zoom-sdk.tsx` (`getMeetingContext`, `getUserContext`, `getMeetingParticipants`, `createBreakoutRooms`, `configureBreakoutRooms`, `openBreakoutRooms`, `closeBreakoutRooms`, `getBreakoutRoomList`, `assignParticipantToBreakoutRoom`, `onBreakoutRoomChange`, `onMyUserContextChange`, `connect`, `postMessage`, …)
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

Add more shadcn/ui components with `npx shadcn@latest add <component>`.

---

## Project Structure

```
src/
├── App.tsx                          # Wraps the dashboard in ZoomSdkProvider
├── main.tsx                         # Entry point + system dark-mode sync
├── index.css                        # Tailwind v4 + shadcn theme tokens
├── hooks/
│   └── use-zoom-sdk.tsx             # config() → connect() → meeting/user context, role check
├── components/
│   ├── breakout-dashboard.tsx       # Settings switches + "Orchestrate Matchmaking"
│   └── ui/                          # shadcn/ui primitives (Card, Button, Switch, …)
└── lib/
    └── utils.ts                     # cn() class-merging helper
vite.config.ts                       # HTTPS (mkcert), Zoom security headers, @/ alias
components.json                      # shadcn/ui configuration
```

### `useZoomSdk()`
```tsx
const zoom = useZoomSdk()

if (zoom.status === "ready" && zoom.isHostOrCoHost) {
  await zoom.sdk.configureBreakoutRooms({ automaticallyMoveParticipantsIntoRooms: true })
}
```
`status` is `"loading" | "error" | "ready"`. When ready, it exposes `meeting`, `user` (including `role`), `isHostOrCoHost`, `connected`, `isMock` and the `sdk` instance. The role updates live if the user is promoted or demoted during the meeting.

---

## Roadmap
- [ ] Matchmaking engine: fetch participants (`getMeetingParticipants`), group them, and build `{ roomName, participantUUIDs[] }[]`
- [ ] Orchestration: `createBreakoutRooms` → `configureBreakoutRooms` → `assignParticipantToBreakoutRoom` (per participant) → `openBreakoutRooms`
- [ ] Backend endpoint for sorting rules
- [ ] Progress UI and error recovery for partial assignments
