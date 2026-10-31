# Evercraft Subsea Watch · Dive Replay Lab (prototype)

**Customer route (after public HTTPS check):** https://jgaethle10.github.io/forge-operator/subsea-watch/

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
