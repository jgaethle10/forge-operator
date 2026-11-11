# Evercraft Subsea Watch · Dive Replay Lab (prototype)

**Customer route (after public HTTPS check):** https://jgaethle10.github.io/forge-operator/subsea-watch/

## Two separate prototype surfaces

- **Telemetry lab:** https://jgaethle10.github.io/forge-operator/subsea-watch/ . Depth profiles and source-checked recorded positions, with strict refusal to fabricate underwater X/Y.
- **Immersive WebGL concept:** https://jgaethle10.github.io/forge-operator/subsea-watch/immersive/ . A separate original 3D renderer with procedural fictional seafloor, a deliberately simplified diver mesh, illustrative pipe geometry, orbit/follow camera, pinch-to-zoom and playback scrub. The built-in mission remains **synthetic**. The new local JSON/CSV import can replay user-declared timed X/Y/depth telemetry; real imports deliberately hide the fictional seabed, illustrative pipe and debris. Files are read only in the browser and are not sent to Evercraft. A depth-only or partial-position file does **not** render a 3D route. Do not mistake an imported track for sonar reconstruction or safety-grade positioning.

The immersive experiment does not replace the evidence lab. It now accepts local replay telemetry, but the product still requires a trustworthy source-to-scene mapping for real dive logs, video and surveyed site geometry before any reconstructed real missions can be shown. Neither route is authorized for underwater navigation, intake avoidance, or dive clearance.

## Replay import boundary (new)

1. In the **immersive view**, select **Import dive JSON / CSV** and choose a local file. Use the same documented schema as the telemetry lab: `t_s,depth_m,x_m,y_m,position_source` for spatial replay, or `t_s,depth_m` for depth only. The UI displays a user-file / unverified status and the claimed positioning method.
2. When local X/Y/depth and a consistent declared source are all available, the immersive view renders the imported path and a generic marker in an empty 3D coordinate space. The view is **not a reconstruction of a real underwater scene**. All synthetic site elements are hidden; no underwater hazards, pipelines, seabed or scale registration are inferred.
3. If horizontal positioning is absent, partial or inconsistently attributed, the immersive scene **draws no route or diver** and gives a clear explanation. Gaps over 15 seconds are not bridged. Discontinuous points remain evidence gaps, not safe travel corridors.
4. **Reset demo** returns to the fictional environment. Imported data stays in the browser session, is not uploaded by the page, and cannot certify positioning, hazards, visibility, isolation or clearance.
5. Do not publish the imported data or represent its user-declared positioning source as independently verified. A later real reconstruction needs independently sourced survey geometry, coordinate registration, uncertainty and video timestamps, with independent operator review.

## First real-data source packet: NOAA EX2306 DIVE02 (research preview)

**First-party discovery route:** `/subsea-watch/field-archive/`. It shows a documented NOAA Ocean Exploration video segment from the Kodiak Seep ROV dive, with a user-initiated preview, original NOAA clip citation and direct file download. It also links the original DIVE02 track KML, ROV ancillary ZIP and CTD/sensor ZIP. The first two have now been byte-audited; the CTD ZIP remains uninspected. None is certified for spatial reconstruction or video synchronization.

The first-party registry is `field-archive/sources.json`, with stable source IDs, original provider links, credit/rights notes, published metadata, access status, and explicit evidence boundaries. The mobile page uses only first-party JavaScript and defers fetching the external NOAA MP4 until the viewer chooses **Preview NOAA footage**.

- **Source verified by metadata:** NOAA EX2306 DIVE02 Kodiak Seep; one 299-second HD camera segment starting 2023-08-25 18:30:00 UTC; original low-res H.264 MP4 URL published in NCEI metadata. NOAA's Ocean Exploration Video Portal describes its video as public domain; credit NOAA Ocean Exploration and preserve the dataset citation.
- **Actual downloaded originals (Nov 10, 2026):** KML 79,769 bytes SHA256 `57b9fcffe9faf8a1a7157ba728a05ae0cff9fb80db2086115ef8a970cc4b3fe2`, one untimed LineString with 1,963 coordinate tokens. Ancillary ZIP 15,727,951 bytes SHA256 `b83df8dd9ae8ebeee7e23c5b1d8a2550b192137bbe7f1e394e551ee4124dda61`, seven members including a 26,092-row 1Hz track CSV. The original CTD ZIP remains not byte-verified.
- **Future geometry exploration:** NCEI bathymetry, the public-domain GEBCO_2026 global grid (with measured/predicted TID distinctions), NOAA BlueTopo (with uncertainty/contributor layers), and NOAA's photogrammetry collection are discovery links only, not surveyed local models for the Kodiak Seep dive. GEBCO requires attribution and must not be used for safety at sea; BlueTopo source-contributor restrictions and coverage quality must be checked; partner-hosted photogrammetry needs separate license verification before use.
- **No synthetic contamination:** The real NOAA clip is never mapped onto the fictional diver, pipe or seafloor; there is no imported real XY route unless an actual validated sensor adapter produces one. Public video alone cannot establish depth, camera pose, bathymetry or the location of underwater structures.
- **Safety and ethics:** No recorded visual is a safe-route claim, clearance to dive or automated hazard detection. Keep exact source, licensing, clock uncertainty and limitations attached in downstream outputs.

**Do not ingest as free commercial footage:** MBARI VARS materials have separate data use restrictions and require permission; discovery does not confer reuse rights.

**Original records:** https://www.ncei.noaa.gov/waf/okeanos-rov-cruises/ex2306/ and https://www.ncei.noaa.gov/metadata/granule/geoportal/rest/metadata/item/EX2306_DIVE02_20230825T183000Z_ROVHD/html

### Source-byte audit contract (engineering gate)

The original EX2306 DIVE02 KML and ROV ancillary ZIP were successfully audited by the first-party `Subsea NOAA source byte audit` GitHub Actions workflow. The owning script is `scripts/audit-noaa-subsea-sources.py`, with offline guardrail tests in `tests/test_subsea_noaa_audit.py`.

- Fetches **only** two hard-coded NOAA/MS State archive URLs over HTTPS with guarded redirects and bounded reads (KML 500 KB, ancillary ZIP 24 MB).
- Records actual response metadata, byte count and SHA-256. The KML inspector inventories geometry and timestamp tags but **never converts** KML elevation into diver depth or claims underwater position accuracy.
- The ZIP inspector inventories up to 80 member names, checks path traversal, encryption and declared expansion size, and extracts only bounded textual schema hints from up to eight members. Raw archives are not uploaded or checked into the repository.
- The workflow saves a sanitized JSON receipt artifact. When downloads fail, its `SOURCE_ACCESS_INCOMPLETE` status and detailed blockers are preserved. An HTTP success alone is **not** a schema validation or a licensed 3D reconstruction.
- Even when both sources are byte-audited, the receipt says `BYTE_AUDIT_COMPLETE_SCHEMA_UNVERIFIED`. A separate engineering review must establish instrument identification, UTC clock, coordinate datum, depth reference, uncertainty and video alignment before adapting any positions into `evercraft.subsea.replay.v1`.

This workflow is neither a commercial dive data certification nor approval for live navigation. See engineering issue #1982 for the next acceptance steps.

### Next adapter gate

The bytes are now audited; next validate schema and measurement provenance before writing a reconstruction converter. Verify which measurements correspond to the **ROV** versus the camera platform or ship. Explicitly establish time basis, UTC offsets, horizontal measurement method, position validity, coordinate datum, local origin and depth sign/reference. Build a converter that emits `evercraft.subsea.replay.v1` **only for validated fields** and leaves missing XY unknown. Never interpolate unknown positions across long intervals or imply video-frame accuracy without a verified clock alignment.

## Local footage / mission clock pairing (experimental)

This next increment adds **local video preview**, **manual clock alignment**, and playback alongside the imported telemetry. It does **not** automatically discover or validate camera start times, derive survey geometry from frames, or produce a synchronized evidence package.

1. In the immersive view, **Import dive JSON / CSV** first. Camera footage is disabled for the built-in fictional mission to avoid implying a real dive happened at the fictional site.
2. Choose **Camera footage**, then **Choose local video**. The browser uses a temporary `blob:` object URL for the user-selected file, does not transmit the file, and revokes that URL when replacing footage, changing telemetry, resetting the demo, or navigating away. The local video preview is limited to nonempty files under 2 GB; actual playback depends on codec support in the user's browser.
3. **Video begins at mission second** accepts a signed offset. For example, if the imported mission started at `t=0` and the camera starts 25 seconds into the dive, enter `25`. If the recording started 5 seconds before the first mission reading, enter `-5`. This is a **user-entered alignment**, not a validated clock correlation.
4. The playback/scrub timeline remains the mission clock. Footage outside its own known duration appears explicitly **unavailable**, before or after the recording. Browser codec, seek accuracy and device playback restrictions can affect synchronization; the indicated time is approximate and must not be described as frame-accurate.
5. Muted playback is the default; **Sound on** is a voluntary user control. The feature is intended for post-dive review, not real-time monitoring, navigation, dive safety clearance, or automatic hazard recognition.
6. No uploader, tracking service, remote transcoder, third-party CDN, or cloud video analysis is added. No synchronized export or evidence claim is produced by this preview. A later professionally validated release needs independently verified time bases, sensor calibration, audit trail and protected evidence retention.

## Experience quality gates

1. **Believable movement:** A visible diver/ROV and structures, correct viewpoint, fluid mobile camera and uncluttered controls. No tiny moving dot masquerading as a complete dive.
2. **Data fidelity:** Recorded depth, horizontal positioning (when actually measured), video timecodes, source freshness and uncertainty displayed independently. Missing telemetry stays unknown, never interpolated through long gaps.
3. **Real site reconstruction:** With permission, import surveyed geometry (sonar/CAD/photogrammetry) with coordinate systems, scale, registration error, timestamps and who verified it. Never use procedural scenery as evidence.
4. **Mission after-action:** Align camera footage, dive-computer samples, diver/ROV track and operator events, with provenance recorded for every claim.
5. **Field usability:** Validate mobile performance, daylight readability, accessible controls, offline access and protected site data with practicing dive supervisors and ROV teams. Do not claim safety certification or commercial readiness from a browser render.
6. **Commercial proof:** Obtain a real, permissioned test dive and a qualified operator evaluation, then package evidence-backed post-dive reviews rather than promising real-time hazard avoidance.

## What ships in this proof

- A browser-rendered, rotatable **3D trajectory** that only appears when timed depth **and** valid local X/Y coordinates with a declared positioning method are supplied.
- A sample 180-second mission with a clearly labeled **fictional diver route** and **illustrative pipe**. No real site, hazard, diver, or intake status is implied.
- Playback, timeline scrubbing, speed changes, orbit/zoom, synchronized depth profile, local file import and text evidence export.
- Import from private JSON or CSV files, processed in-browser. Nothing is uploaded by this prototype.
- If only depth is recorded, display the depth profile and refuse to create an X/Y route.

## Import a dive

CSV headers: `t_s,depth_m` for depth-only or `t_s,depth_m,x_m,y_m,position_source` for spatial replay.

Supported declared source labels for horizontal coordinates: `USBL`, `LBL`, `DVL_INS`, `ROV_TRACK`, `SURVEYED`, `SIMULATED`. These labels are **user-provided provenance claims**, not automatic certification. Samples must have increasing timestamps; movement is not interpolated across intervals longer than 15 s.

JSON example (all coordinates local relative meters, **not** latitude/longitude):

```json
{
  "title": "Example dive, depth only",
  "provenance": "Exported from operator-owned dive computer",
  "points": [
    {"t_s": 0, "depth_m": 1.2},
    {"t_s": 10, "depth_m": 7.4},
    {"t_s": 20, "depth_m": 4.0}
  ]
}
```

Only add `x_m`, `y_m` and declared `position_source` when actual independently sourced horizontal underwater position records are available. Never synthesize X/Y from a pressure sensor, surface GPS fix, compass, photo count or timestamp.

## Evidence and safety rules

1. Visualization is **not live diver navigation, a verified bathymetric map, a safe-route generator, or clearance to dive**.
2. No pipe geometry exists for a private imported file unless actual facility drawings / sonar / surveyed structures are separately verified in a later product feature. The illustrated sample pipe is *fictional* and its flow/isolation state is unknown.
3. No inferred safe perimeter, Delta-P risk score, pressure gradient or valve state. Site operator and dive supervisor must perform independent hazard identification, isolation and verification.
4. No cloud rendering, uploads, personal tracking, or third-party hosted generation is required for this prototype.
5. A replayed point is not a high-precision reconstruction. Long positioning gaps must never be interpolated into apparent certainty. A 3D track alone is not underwater photogrammetry.

## Product steps after proof

- **Evidence adapters:** dive computer XML/UDDF/FIT profile imports (via explicit conversion), ROV/USBL/LBL/DVL positioning, synchronized camera timecodes.
- **Spatial site evidence:** facility-provided GIS/CAD, sonar bathymetry and photogrammetry meshes with source, survey date and uncertainty.
- **After-action replay:** synced diver/ROV path, camera footage, operator logs, work events, notes and versioned provenance.
- **Pre-dive briefing:** qualified dive supervisor and facility operator checklists including Delta-P hazard review and verified isolation. No automated 'safe to dive' decision.
- **Commercial path:** paid site-specific records and post-dive evidence packages for contractors and infrastructure operators, only after validation with dive professionals.

## Technical and prior art

Conceptual workflow comparison: **Open DroneLog** by Arpan Ghosh, a separate original open-source drone log replay project. This Subsea Watch prototype is independently implemented; no Open DroneLog code was copied. Its AGPL-3.0 license is not an authorization to silently reuse it as Evercraft-owned product code.

External references:
- https://github.com/arpanghosh8453/open-dronelog/blob/main/docs/manual.md
- https://subsurface-divelog.org/subsurface-user-manual/
- https://oceanexplorer.noaa.gov/technology/photogrammetry/
- https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.421
- https://www.osha.gov/commercial-diving

Status: **Prototype**, not commercially validated safety software or a certified dive apparatus.
