# EX2306 Dive 02 | Source-byte and telemetry quality report

**Mission:** Kodiak Seep, NOAA Okeanos Explorer EX2306, August 25, 2023.  
**Review date:** November 10, 2026.  
**State:** `BYTE_AUDIT_COMPLETE_SCHEMA_UNVERIFIED`, NOT a georeferenced 3D site reconstruction.  
**Original source:** https://www.ncei.noaa.gov/waf/okeanos-rov-cruises/ex2306/  
**Associated 299-second video:** https://www.ncei.noaa.gov/metadata/granule/geoportal/rest/metadata/item/EX2306_DIVE02_20230825T183000Z_ROVHD/html

## Confirmed source bytes

| File | Downloaded bytes | SHA-256 |
| --- | ---: | --- |
| `EX2306_DIVE02_Path.kml` | 79,769 | `57b9fcffe9faf8a1a7157ba728a05ae0cff9fb80db2086115ef8a970cc4b3fe2` |
| `ex2306-DIVE02-ancillary-data.zip` | 15,727,951 | `b83df8dd9ae8ebeee7e23c5b1d8a2550b192137bbe7f1e394e551ee4124dda61` |

Original source files were fetched into a GitHub Actions audit worker. The artifact contains a sanitized, machine-readable evidence receipt, not copies of the raw archives. Inspectors use guarded HTTPS downloads, byte caps, a no-extraction ZIP inventory and limited CSV reads.

## Actual KML observation

- One `LineString`, one `Placemark`, 1,963 coordinate tokens.
- Zero `<when>` timestamps and zero `gx:Track` time/coordinate pairs.
- **Cannot be used alone for a timed 3D replay.** Geographic positioning accuracy, vertical datum and synchronization remain unverified.

## Actual ROV ancillary ZIP observation

- Seven archive members, including `EX2306_DIVE02_RovTrack.csv` (71,159,696 uncompressed bytes), `EX2306_DIVE02_RovTrack1Hz.csv` (2,381,555 uncompressed bytes), dive summary, sensor inventory, and KMLs.
- The nominal 1Hz CSV contains **26,092 rows** and columns `DATE,TIME,UNIXTIME,DEPTH,ALT,LAT_DD,LON_DD`.
- All 26,092 rows have numeric UNIXTIME. The audit found **zero non-one-second timestamp steps**.
- **25,518** rows have valid latitude/longitude. **25,615** have numeric negative DEPTH. The remaining missing values MUST NOT be interpolated into real measured fixes.
- Published NCEI video window: `2023-08-25T18:30:00Z` through `2023-08-25T18:34:59Z`. **300** rows overlap; all 300 have numeric depth and latitude/longitude. **Clock overlap is not frame-accurate synchronization** and does not establish camera pose or survey registration.
- Dive summary reports Max Vehicle Depth 4,261.5 m and bottom time 2:14:37. CSV negative-depth convention, pressure reference, geodetic datum and uncertainty need source-level review.
- Original sensor inventory lists USBL (LinkQuest TN10015C), DVL (Tasman), PHINS and depth sensors. The presence of equipment does not identify which positioning solution generated `LAT_DD`/`LON_DD`, its accuracy, or how measurements were fused.

## Required next acceptance gate

1. Validate which hardware/processing stream produced the track lat/lon and depths. Document time basis, vertical reference, conversion rule for negative depths, ellipsoid/local tangent-frame registration, gaps and positioning uncertainty.
2. Cross-check vehicle track with event logs, KML coordinates and other independently sourced annotations. Do not infer coordinates from surface GPS.
3. Only then build a narrow importer for the 300-row 18:30 UTC clip into `evercraft.subsea.replay.v1`, preserve original raw CSV provenance, and keep site geometry absent.
4. Compare the media timestamps against an independent clock/timecode source. Until then label video time pairing provisional/manual, not synchronized.
5. Test 3D viewport for deep-water depth above 4 km. The core range was expanded from 450 m to 12,000 m for deep-ocean profiles, but this changes **display capability**, not positioning verification.
6. Obtain a professional ROV operator review before describing any result as an evidence-grade post-dive product.

**Hard boundary:** No safe route, operating pressure, pipe isolation, terrain reconstruction, or certified dive clearance is determined from these artifacts.

**Audit workflow:** https://github.com/jgaethle10/forge-operator/actions/runs/42959837823  
**Engineering follow-up:** https://github.com/jgaethle10/forge-operator/issues/1982
