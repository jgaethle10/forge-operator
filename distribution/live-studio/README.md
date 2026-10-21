# Evercraft LIVE Studio RC03: Broadcast Director

**Release state:** reviewed local prototype, not a deployed streaming service. The contents of this GitHub proposal are safe demo code only; no private internal Drive/Systemia links included.

## What works

- Maintains six interactive illustrative worlds from RC02 (Earthworks, Network, Biology, Storms, Creative, Workflow).
- Adds timed scene playlists in the producer UI. A strict local JSON playlist importer supports at most 40 cues, 12-300 seconds each, and only one of the six fixed worlds. Every scene is marked as an illustration or simulation, never live telemetry.
- Director offers Start, Hold/Resume, Next Cue and Stop; auto-rotates scenes and provides cue countdowns. It clears independently staged video/proof cards before rotation, and pauses if a card is staged while it is operating.
- Retains the manual media privacy review gate, self-contained browser runtime, 9:16 audience framing, and source-backed receipt cards of RC02. No public destinations are bundled.

## Use it

1. Open `index.html` locally with Chrome, Edge, or Safari. For GitHub PR review download the file, since GitHub does not execute HTML previews.
2. Select **Start director** to rotate the six demonstrations using default 25-second cues, or import the example curated playlist.
3. Select **9:16** and **Enter LIVE view** for a portrait visual source. Starting a real broadcast must happen separately with approved software/account features.
4. Keep the tab visible and a producer present; hidden-tab timers and OS power-saving prevent browser-only uptime guarantees.
5. Don't stream your entire browser, private chats, authentication UI, or minors. Use the isolated public-safe scene only.

## Safety and constraints

- **Not TikTok automation:** No account authentication, audio, RTMP output, ingestion endpoint, OBS control, or scheduler is included.
- **Not unattended live Systemia:** A genuine adapter must authorize each approved artifact, check SHA-256/media identity and expiration, and write public releases to a cache without exposing private RLS-backed records. `reviewed_for_public` on a playlist JSON is not a cryptographic approval, and only permits selecting built-in fictional scenes.
- **Not production evidence:** Real operator-reviewed video/receipts may be staged manually, but the browser cannot independently validate source authenticity or publication rights. No automatic private artifact sharing.
- **Not 24/7 reliability yet:** Timer progression depends on browser process, focus, and system sleep. A resilient dedicated broadcast machine/server, failure slate, health monitor, and applicable platform permissions are future tasks.
- **Not a website deployment:** GitHub branch/PR is code review, not publication.

## Planned RC04

Build a signed public-release manifest reader with fail-closed expiry, media hash, rights scope and approved source identity; a per-scene failure slate; local watchdog; and an isolated broadcast renderer. Connect through Systemia mission intake and independent production QA. Only then investigate TikTok LIVE Studio/OBS platform compatibility and authorization.
