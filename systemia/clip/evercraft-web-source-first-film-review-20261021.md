# Evercraft Web: authenticated reality of the next product film

## Source-of-truth progress (2026-10-21)
GitHub Actions [run 39535736069](https://github.com/jgaethle10/forge-operator/actions/runs/39535736069) produced an artifact named `evercraft-web-ephemeral-fetch-receipt` on candidate owned Fetch branch PR #1385. The isolated runner **successfully initialized the owned MCP, discovered fetch_url, fetched https://example.com over real public HTTPS, returned two SHA-256 fields, and rejected a localhost/private target**. The exact public-safe record is pinned in `systemia/clip/evidence/evercraft-web-20261021-ci-fetch.json`.

### Non-negotiable meaning
- This is actual ephemeral execution, not proof of Evercraft's public production route. The report explicitly says `customer_access_verified:false`.
- A reproduced transcript or UI must be labeled **CI receipt replay**, never live customer SaaS or a production UI.
- The hashes are those emitted by the runtime, **not independently recomputed from full raw source bytes** in this document.
- Browser Worker, authenticated browsing, Search, instant customer access and checkout remain held, as in earlier PR notes.

## Recovered original production assets
- Source `cinematic.mov`, `educational.mov`, `commercial.mov`: Evercraft's original 4-second 3D camera studies, 640×360 / 480×480 / 360×640 at 24fps. They demonstrate perspective movement, not premium final assets.
- Original `SABAN_Original_Piano_Strings_Cue.wav` (46.1s) and `SABAN_Theme_03_Original_Felt_Piano.wav` (24.8s) were recovered from the founder's library. Original source score measures about 13.5 LU of dynamic range and felt piano about 7.2 LU; unlike RC02's 1.5-LU compressed synthetic accompaniment.
- `The_Weight_of_Silence_Piano_and_Strings.mp3` and the original V05 af_bella WAV recovered for human auditions. Saved original V05 research explicitly says **commercial use not approved**; don't publish this voice as an approved product voice.
- A 13.5-second Chromium-recorded review playback and three sound auditions were produced in the conversation artifact workspace, **not deployed**. They use actual CI receipt data and identify themselves as review footage, not published product UI.

## Creative direction
Stop recycling the giant headline/radar motif of RC01 and the fake product card construction of RC02. Next commercial sequence needs an approved real human situation, cine-grade source footage with clearance, a live customer-verified product screencast, and auditioned professionally judged performances. Fallen/Creative Council/Shot Tournament must evaluate those source artifacts. Do not present an animated evidence viewer as the finished premium commercial.

## Release gate
Continue independent external owned-HTTPS customer access test using `scripts/evercraft-web-cold-client-canary.mjs` from PR #1495. Even a successful temporary runner capture does **not** unlock advertising or public signup.