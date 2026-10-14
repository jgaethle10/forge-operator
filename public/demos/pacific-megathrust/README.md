# Pacific Megathrust Atlas · RC1 research branch

Systemia intake: `pacific-megathrust-intelligence-20261014` (FounderDirectiveDraft; **awaiting canonical admission**). Do not treat this as dispatch, deployment approval, or an Evercraft emergency alert.

## What actually works in this prototype
- A responsive ocean-science map with separate Kuril/Nemuro and Cascadia exploration windows. **Rectangles are search windows, not fault polygons.**
- Live fetch of the [USGS M4.5+ past-7-day GeoJSON catalog](https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson); validates geometry, magnitude, event timestamps, HTTPS source link, and source type before displaying, with explicit failed/stale states rather than fabricated data.
- Optional visual overlays using the [Washington Geological Survey production ArcGIS service](https://gis.dnr.wa.gov/site3/rest/services/Geology/Tsunami_Hazard/MapServer): **M9.0 Cascadia L1 tsunami inundation extent layer 29**, and **evacuation route layer 20**. These are *modeled/planning* layers, not live tsunami observations.
- The [peer-reviewed 2026 Tomita et al. study](https://www.nature.com/articles/s43247-026-03297-2) is linked as geophysical context. Repeated GNSS-acoustic survey campaigns were 2019–2024; **20.5–30m over approximately 400 years is a research estimate**, not an instrument's direct strain reading and not an earthquake clock.
- Linked [NOAA NCEI tsunami history](https://www.ncei.noaa.gov/products/natural-hazards/tsunamis-earthquakes-volcanoes/tsunamis/global-historical-data), not yet an integrated data layer.

## Preview and tests
Serve the repository with the existing local Vite dev setup (`npm run dev`), then visit `/demos/pacific-megathrust/`. To run isolated source checks without installing app dependencies:

```bash
node --test public/demos/pacific-megathrust/atlas.test.mjs
```

The webpage loads pinned Leaflet 1.9.4 and Esri Leaflet 3.0.12 from CDN, and CARTO/OSM base tiles; this requires internet. CDN availability, browser CORS, the WGS layer imagery, and cross-device behavior must be independently validated before calling this a usable live product. The official map layer is source-served; no hazard boundaries are re-created in this code.

## Limitations and production gates
1. Current USGS feed is not a fault-locking sensor; catalog scarcity cannot establish safety or danger.
2. Quake location/event filters are deliberately broad study-region bounding rectangles, not rupture segment attribution.
3. WA DNR scenario layer does **not** extend to Japan or permit trans-Pacific runup extrapolation.
4. No automatic official warnings or conditional public safety messages are generated. Refer users to https://www.tsunami.gov/.
5. No prediction of the date, probability, or magnitude of a future earthquake.
6. This branch is research-only. **No merge, auto-deploy, syndication or emergency operations** without canonical Systemia acceptance, QA, source licensing checks, real-browser validation and appropriate human review.

## Next evidence receipts
- Independently verify real-browser fetch/CORS, WA production MapServer render, mobile click/legend and degraded behavior.
- Verify comparative literature and geodesy source licensing; incorporate seafloor site observations with correct campaign metadata only if rights and coordinates are validated.
- Add NOAA tsunami event histories as a distinct historical record layer.
- Hook findings into the existing Earth Atlas/FAIE/TOWI paths *after* canonical Systemia routing, not by inventing a second mission ledger.
