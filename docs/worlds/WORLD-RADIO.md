# Evercraft Worlds · Live World Radio (WORLDS-LIVE-RADIO-001)

**Status: implementation on feature branch only. Real KCWU live-stream media startup was observed in CI Chromium on November 9 (Pacific time); physical device audio, live Systemia admission, station rights review, and owned public deployment are not verified.** Systemia intake: https://github.com/jgaethle10/forge-operator/issues/1845

## Experience
The existing `/worlds/` first-person WebGL experience exposes an optional **📻 Radio** control. The hosted Yakima historical reconstruction at `/worlds/hidden-world/yakima-standalone.html` also exposes an opt-in **Live Yakima radio** control; all stations remain explicitly present-day, not archival audio. The reconstruction's standalone `file:` offline behavior is preserved. A visitor can select Yakima, Seattle, NYC, London, Tokyo or São Paulo, or click arbitrary coordinates on a small illustrative world map. The browser first requests radio stations by radius. For known city presets it retries with a documented country/state candidate search if needed; all records are independently filtered using reported coordinates within 350 km. URLs are HTTPS-only. Real stations may be absent or unplayable. The site never claims that a returned station is physically broadcasting from the exact selected map point.

Users choose a listed station or tap an available radio marker to start playback. Radio continues while visitors navigate the 3D scene until they pause or switch stations. Closing the station drawer leaves a compact, keyboard-accessible mini-player with Pause/Resume, Stations and Stop buttons. Stop removes the audio source to disconnect the broadcaster; the mini-player appears only after a visitor selects a station. **There is no automatic station switching based on player position, no 3D positional audio, and no globe teleport yet.** The location is an independent audio/map selection layer, not the character position.

## Architecture
- `public/worlds/world-radio-core.mjs`: pure geographic projection, distance, query and station normalization
- `public/worlds/world-radio.mjs`: opt-in UI and direct browser playback, no framework/dependency
- `public/worlds/world-radio.css`: responsive panel
- `public/worlds/index.html`: loads the radio layer alongside the existing 3D app
- `public/worlds/hidden-world/yakima-standalone.html`: opt-in present-day radio in Yakima interpretation, only on HTTP(S)
- `scripts/probe-worlds-radio-browser.mjs`: deterministic desktop, phone and Yakima phone-emulation UI checks
- `scripts/probe-worlds-radio-live.mjs`: non-gating *read-only* directory metadata probe; logs no stream URLs, never plays audio
- `scripts/probe-worlds-radio-playback.mjs`: non-gating live Yakima browser probe, attempts user-click-triggered stream playback in GitHub-hosted Chromium and checks media events; never records audio or stores stream URLs. A `playing` event demonstrates media-element decode/start on the CI host, **not** audible speakers, Safari, or rights.
- `scripts/probe-worlds-radio-webkit.mjs`: Playwright WebKit test using an emulated iPhone layout and **synthetic** station metadata; checks opt-in behavior, mobile layout and mini-player lifecycle. Runs on the macOS CI job with an enforced test result because WebKit could not launch on Ubuntu due to missing host libraries. This is Safari-engine compatibility evidence only, not a test on physical iOS hardware.
- `tests/world-radio.test.mjs`: Node 22 builtin tests, no live service. Additional synthetic Playwright desktop and phone-emulation radio tests run in the Worlds browser workflow
- Geographic source: https://docs.radio-browser.info/ (community-maintained and potentially unavailable). Mirrors `de1.api.radio-browser.info`, `nl1.api.radio-browser.info`. Discovery is not owned and is **not** a permanent SLA. The API may return no healthy or geographically accurate entries.
- Only HTTPS audio URLs are allowed; some broadcasters may still refuse playback because of codec, CORS, geography, or browser policy. In particular, a catalog record with `lastcheckok` is not proof that a current stream will play.
- The geographic map includes deliberately simplified illustrative landforms, not authoritative boundaries or verified terrain.
- The radio experience is original Evercraft UI, not a copy of Orbe.

## Run locally
From repository root:
```bash
node --test tests/world-radio.test.mjs
python3 -m http.server 8766 -d public
# Open http://127.0.0.1:8766/worlds/
```
Tap **📻 Radio**, choose **Yakima, Washington**, and tap **Find nearby stations**. Station catalogs and streams require internet access. The local page does not provide production HTTPS/CORS verification.

## Safety, rights, privacy
- No listening or streaming begins until the visitor chooses a station. Searching sends selected coordinates, IP and browser request details to the Radio Browser service. Playback connects **directly from the device to the broadcaster**; stations see the listener's IP. Worlds does not proxy, record, redistribute or cache broadcast media.
- A directory entry **does not establish a broadcaster license or rights to commercial distribution, rebroadcasting or recording**. Before a public launch, verify each station's applicable permissions, metadata/branding usage and geographic restrictions, and publish clear privacy disclosures.
- No map interaction uses user geolocation or asks for location access. City coordinates are built-in presets or visitor map clicks. No station IDs, streams or locations are written into world saves.
- Timewalk/historical radio is **not implemented**. Any future historical content must be licensed or clearly disclosed as recreation, with date/source provenance.

## Browser playback milestone (Nov 9, 2026, Pacific time)
The dedicated live-browser-media probe in [GitHub Actions run 42742124652](https://github.com/jgaethle10/forge-operator/actions/runs/42742124652) observed a **real** Yakima-region directory response, a user-initiated click on KCWU-FM 88.1 The 'Burg, an HTMLAudioElement `playing` event, `readyState: 3` and `error_code: null` on GitHub-hosted Chromium. Audio bytes and stream URLs were not retained by the probe. This is verified browser media startup, **not** verified physical speaker sound, iOS Safari playback, the station's content license, or production deployment. The result is historical evidence for that run and is not a live-availability guarantee.

## Release gates
1. CI Node tests and desktop browser smoke for opening, closing, city switch, map click, accessible controls, player.
2. Validate real directory responses for Yakima and at least two other cities. The non-gating live-directory probe emits separate evidence; do not invent a stream when none is found. A directory metadata hit is not a successful playback test.
3. Check non-gating real Chromium browser-media receipt for `playing` with decodable data, then WebKit iPhone-layout compatibility with synthetic fixtures; separately validate Chrome/Safari on physical devices. Browser startup is not physical audio, and no station is guaranteed to work. Verify mirrors, CORS and HTTPS.
4. Station/operator permissions and privacy/attribution review.
5. Admit in actual live Systemia/Saban mission workflow, retain receipt.
6. Verify owned public Worlds DNS/TLS/static route; record actual production deployment receipt.

Passing the Node and simulated browser tests only proves deterministic discovery and UI behavior. Non-gating real browser-media observation can provide stronger evidence about an actual browser and a live station, but it is not a station license or physical-phone test. It does not by itself establish reproducible playback on all devices, that third-party terms permit the intended public distribution, that mobile audio works, or that Worlds is public.
