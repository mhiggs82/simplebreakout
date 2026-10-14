# Taking Global Breakout live in Zoom

This guide gets Global Breakout from this repository into real Zoom meetings with real people. There are three parts:

1. **Host the app**: put the built website on the internet over HTTPS.
2. **Register it with Zoom**: create the Zoom App in the Zoom Marketplace and point it at your website.
3. **Test with people**: what works without any Zoom approval, and when you'd need it.

Hosting is done (see below). The Zoom setup takes about 30 minutes the first time through.

---

## 1. Hosting (done)

Global Breakout is live:

| | |
| --- | --- |
| **Production URL (use this everywhere)** | **`https://breakout.getparentwise.com/`** |
| Vercel fallback address | `https://simplebreakout.vercel.app/` (same app; use only for troubleshooting) |
| Vercel project | `simplebreakout` (team: mhiggs82's projects, Hobby plan) |
| Source | GitHub `mhiggs82/simplebreakout` |
| DNS | Spaceship: CNAME `breakout` → Vercel |

**Always give Zoom the getparentwise.com address.** It's the one you control, and it stays the same even if the app moves to another host.

The app is a **static website**. There's no server or database: everything runs in the Zoom client and talks over Zoom's own messaging. One deployment serves every country. Each cohort (Saudi Arabia, Netherlands, …) is simply its own Zoom meeting.

### How updates go live
Vercel rebuilds automatically on every push. Whatever lands on the **production branch** goes live on `breakout.getparentwise.com` within about a minute.

Make sure the production branch is `main`: Vercel → `simplebreakout` → **Settings → Environments → Production → Branch Tracking** → `main` → **Save**. Every other branch gets its own preview link and never touches the live site.

### Check the headers Zoom requires
Run this after any hosting change:
```bash
curl -sI https://breakout.getparentwise.com/ | grep -iE "strict-transport|content-security|nosniff|referrer"
```
All four headers must appear; without them Zoom refuses to show the app. They come from `vercel.json`, and `public/_headers` covers Netlify or Cloudflare if you ever move.

---

## 2. Register the app in the Zoom Marketplace

Sign in at **marketplace.zoom.us** with the Zoom account you'll host meetings from.

1. **Develop → Build App → General App** (user-managed).
2. **Basic Information**
   - App name: **Global Breakout**
   - **OAuth Redirect URL**: `https://breakout.getparentwise.com/`. After someone adds the app, Zoom sends them here and they see a "Global Breakout is added to your Zoom" page.
   - **OAuth Allow List**: `https://breakout.getparentwise.com/`
3. **Features → Surface**
   - Select **Meetings**, i.e. the in-client app.
   - **Home URL**: `https://breakout.getparentwise.com/`
   - **Domain Allow List**: `breakout.getparentwise.com`
4. **Features → Zoom App SDK → Add APIs.** Add every API the app uses:
   `getMeetingContext`, `getUserContext`, `onMyUserContextChange`, `getRunningContext`, `getMeetingParticipants`, `onParticipantChange`, `createBreakoutRooms`, `configureBreakoutRooms`, `openBreakoutRooms`, `closeBreakoutRooms`, `getBreakoutRoomList`, `assignParticipantToBreakoutRoom`, `changeBreakoutRoom`, `onBreakoutRoomChange`, `sendMessage`, `onMessage`, `connect`, `onConnect`, `postMessage`, `sendAppInvitationToAllParticipants`, `addParticipantSpotlight`, `removeParticipantSpotlights`, `getParticipantSpotlights`.
5. **Scopes**: add `zoomapp:inmeeting`.
6. **Local Test → Add App Now.** Approve the permissions. You'll land on the "added" page.
7. Open the **Zoom desktop app** (version 5.15.5 or later), start a meeting, click **Apps**, then **Global Breakout**.

> Fill in the **Development** tab first; that's what Local Test uses. Put `https://breakout.getparentwise.com/` in both the Development and Production sections.

---

## 3. Testing with real people, and what needs Zoom approval

Zoom has three levels of access:

| Who can install the app | Zoom approval? | How |
| --- | --- | --- |
| **You** (the developer) | **No** | Local Test → Add App Now |
| **People in your own Zoom account** | **No** | Add them as users in your account, then share the app's authorization URL with them (Production → Beta Test → Share App). Zoom only allows this within your account. |
| **People outside your account** | **Yes** | **Beta:** "Request to Share", reviewed in 3–4 business days. Needs security information, lasts 4 weeks, with a limited number of testers. **Or publish** (it can be unlisted) after a full review. |

### The good news: most formats only need *you* to have the app
Breakout rooms are a built-in Zoom feature. When your app moves people into rooms, **participants don't need Global Breakout installed**: they just get Zoom's normal "Join breakout room" prompt. So you can run real sessions with **any attendees, from any account, today**, without approval:

| Format | Works for attendees without the app? |
| --- | --- |
| Match: Random | ✅ Fully |
| Match: Roles / Attributes | ✅ You set roles and answers for people from the Participants list. Attendees can't answer from their own panel. |
| World Café, Speed Networking | ✅ Fully. Round prompts appear only for people with the app, so read them aloud or paste them in chat. |
| 1-2-4-All, Think-Pair-Share, Gallery walk | ✅ The rooms and rotations work. ❌ Sending insights and notes needs the app. |
| Open Space | ✅ Self-select is on, so people pick tables from **Zoom's own Breakout Rooms menu**. ❌ The app's table picker with head-counts needs the app. |
| Fishbowl | ✅ The spotlight stage works. Observers use **Zoom's Raise Hand** instead of the app's button. |

**Suggested path**
1. **This week (no approval):** run real sessions where only you have the app, using Match, Café, Speed, 1-2-4-All and Open Space. Add 1–2 colleagues to your Zoom account so you can also test the attendee panel.
2. **Then:** request Beta sharing from Zoom to try the full attendee experience with outside testers.
3. **Later:** publish (unlisted, or publicly in the Marketplace) once you're happy.

---

## 4. First live test checklist (about 20 minutes, 3 people)

**Who you need:** you (host), one co-host, and one attendee. The attendee should ideally be a user in your account who has added the app.

1. **Open:** Apps → Global Breakout. Your role badge shows **Host**.
2. **Match (Random):** click **Orchestrate Matchmaking**. The rooms open and people get Zoom's join prompt. Then **Close rooms**.
3. **World Café:** 2 tables, co-host pinned to Table 1, 2 rotations of 1 minute.
   - Check the co-host's panel says "You're hosting Table 1" and they move automatically.
   - Check the attendee moves each round.
   - Check whether the attendee panel shows the prompt and countdown **while they're inside a room**. This is the key unknown.
4. **Visit a room:** use **Visit a room** and **Back to main room**.
5. **Open Space:** open it, then have the attendee pick a table from the app *and* from Zoom's Breakout Rooms menu.
6. **Fishbowl:** put the co-host on stage. Their video must be on for the spotlight.

Note anything odd: wording, waiting times, or anything that didn't move.

---

## Troubleshooting
| Symptom | Fix |
| --- | --- |
| Blank panel, or "Missing OWASP Secure Headers" | Check the four headers with `curl -sI`. Make sure `vercel.json` was deployed and the URL in Zoom is `https://breakout.getparentwise.com/`. |
| "Can't start Global Breakout: Could not reach the Zoom client" | You opened the URL in a normal browser. Open it from **Apps** inside a Zoom meeting. |
| A button does nothing or shows a permission error | The API isn't added in **Zoom App SDK → Add APIs**. Add it, then re-add the app (Local Test). |
| "Zoom only shares the participant list with the meeting host" | Start the meeting yourself, or make sure you're the host rather than a co-host. |
| Participants don't get moved | Check that breakout rooms are enabled in your Zoom web settings (Settings → In Meeting (Advanced) → Breakout room). |
