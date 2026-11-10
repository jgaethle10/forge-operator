# The Art of Becoming
Evercraft-owned, mobile-first, privacy-first habit-art MVP. Working name only.

## The premise
A person selects an intention and self-reports days that supported it. Each completed day paints one more part of an original procedural SVG. Seven completed days finish a downloadable artwork. Difficult days do **not** erase previously completed days or finished artworks. The artwork can be saved as an SVG, and reflection records can be exported as JSON.

This is a prototype, not a launched product, treatment service, or sobriety verification tool.

## Start
Static frontend: `public/art-of-becoming/index.html`
Pure logic: `public/art-of-becoming/engine.mjs`

Serve from the repository root with any local static server and visit `/public/art-of-becoming/`. Do not use `file://` for a module-based preview.

Run `node --test tests/art-of-becoming.test.mjs` for the domain and privacy-contract tests.

## Behavior
- Six separate intentions: alcohol-free, nicotine-free, movement, nourishment, reading, rest.
- Daily reflections for today or any of the previous 30 days, editable/clearable.
- Self-reported consecutive check-ins and cumulative completed days are separate metrics.
- Unknown/missing check-ins are **not** called relapses.
- Seven **distinct self-reported followed-through dates** earn a finished, deterministic canvas; no requirement that they be consecutive. Art marks are issued once per distinct date and cannot be earned again by toggling that date.
- Three procedural styles: garden, constellation, mosaic. Each canvas locks its style when completed so subsequent theme changes do not redraw earned paintings.
- Current and completed canvases can be saved locally as portable SVG. Earned art marks are retained separately from the editable reflection records; correcting a previously successful day decreases the current success count but does not revoke a completed canvas.
- Entries use browser `localStorage`; individual goals remain separate.
- JSON export, validated user-confirmed JSON restore, and explicit full-device-data deletion. No analytics, cloud database, account, tracking beacon, payment link, or external assets.

## Safety and privacy decisions
1. A hard day never deletes earlier progress or completed paintings. Streaks are descriptive, not a punishment.
2. Missing check-ins are unknown. Streaks never certify sobriety, treatment adherence, or recovery.
3. No relapse predictions, public leaderboards, financial stakes, shaming language, or automated drug/alcohol claims.
4. No personal medical or sobriety details leave the browser through the application. Browser storage and downloaded files are **not** encrypted; shared devices are not private storage.
5. The interface contains a withdrawal-safety caveat. Before public addiction/recovery marketing, obtain qualified clinical, privacy, accessibility, and consumer-safety review.
6. Static browser storage can be wiped by cache clearing/device loss. The permanent gallery is device-local until an opt-in secure backup exists.

## Non-goals for MVP
- Account creation, cross-device sync, automatic reminders, social sharing, clinician dashboards, subscriptions, medical advice, or emergency intervention.
- AI-generated imagery. This version uses local seeded vector art without inference cost.
- Server-side authorization or validated behavioral claims.

## Prelaunch gates
- Run the isolated Playwright Chromium desktop/phone-width smoke (`scripts/probe-art-of-becoming-browser.mjs`) and inspect its screenshots/receipt. Exercise the experience separately in **real Safari on iPhone** and desktop Firefox, including offline/blocked storage, downloads, keyboard/screen-reader navigation, and reduced-motion support.
- Verify GitHub Pages/build routing and privacy policy, not just source correctness.
- Add transparent consent and encryption for any future cross-device journal sync. Never silently move local reflections to Systemia or analytics.
- User-test language and the difficult-day flow with people who have lived experience; seek clinical input for addiction-specific positioning.
- Check working product name and rights before public branding.
- Design print ordering and checkout separately with an explicit, verifiable purchase flow.

## Suggested Systemia contract for future integration
`ArtOfBecoming.CheckInRecorded` -> `ArtEngine.RenderCanvas` -> `ArtGallery.MilestoneEarned` -> `ArtExport.DownloadRequested`.

This is a **proposed contract only**, not a claim that Systemia currently consumes these events. Only the owned GitHub implementation in this branch is present.
