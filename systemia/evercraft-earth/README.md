# Evercraft Earth / “What Changed Here?” / Pilot 001

**Status:** prototype on a feature branch. Not deployed, not a production public-safety product, not connected to live government feeds.

## Fit with the existing portfolio

- EverMaps remains the geospatial evidence projection and public-safe mapping capability.
- Evercraft Earth is a user-facing investigation experience built **on** EverMaps, not a replacement for it.
- Systemia/KAIDANCE retains work approval, evidence, publishing, and operational authority. This pilot does not connect to the heartbeat, add agent autonomy, or bypass any gate.
- EarthWorks Autonomy is a separate construction-equipment lane; it must not be conflated with this Earth intelligence pilot.
- The prototype is implemented at \`public/apps/evercraft-earth/index.html\`. It is a static client-side app with Leaflet and OpenStreetMap tiles. It uses external CDN/map tiles; it is not a fully offline app.

## Working interaction

1. Open the static HTML through an HTTP server (e.g. \`python3 -m http.server 8000 --directory public\`) at \`http://localhost:8000/apps/evercraft-earth/\`.
2. Choose a navigation location (Yakima Valley, Seattle, NYC). **Navigation anchors are not evidence**.
3. Choose Water/PFAS, Fire, Land, or Infrastructure and dates.
4. Press **Load synthetic demonstration** to see invented, conspicuously labeled values and comparisons.
5. Use **Import source-linked GeoJSON** to load your own normalized evidence records in the browser, without sending them to Evercraft servers.
6. Click a plotted point or a comparison card to inspect an observation. Each imported record has a date, a value, a unit, a site identifier, and a source link.
7. Switch dates and layers. Missing data appears as a coverage gap rather than a claim of no risk.

## Data contract

A GeoJSON \`FeatureCollection\` of Point features. Each \`properties\` object must include:

| Field | Type | Meaning |
|---|---|---|
| \`site_id\` | string | Stable *physical* monitoring point; never group unrelated points |
| \`name\` | string | Human-readable site label |
| \`topic\` | enum | \`pfas\`, \`fire\`, \`land\`, \`infrastructure\` |
| \`metric\` | string | Exact analyte/variable (e.g. \`PFOS\`), not a blended category |
| \`value\` | number | Valid observed numeric measurement; **never encode ND, below reporting limit, or absence as zero** |
| \`unit\` | string | Comparable physical unit; conversion is **not** done by this pilot |
| \`observed_at\` | YYYY-MM-DD | Date of measurement, not date of article publication |
| \`source_name\` | string | Issuing data publisher |
| \`source_url\` | HTTPS URL | Public direct provenance link; a generic website is insufficient for publication |

Coordinates are GeoJSON \`[longitude, latitude]\` in WGS84 (EPSG:4326). Valid rows are accepted by the browser, but **acceptance is not independent verification**. Each comparison groups \`site_id + topic + metric + unit\` and selects the latest record on or before each chosen cutoff. It compares values only when the observations fall on **different dates**. Duplicate same-date readings and data revisions are *not* reconciled in this pilot.

The sample format downloadable from the UI contains **invented** numbers and explicitly fake identifiers. Its example source URL is only a template hint. Never publish that template as real results.

### Before real PFAS ingestion

- Acquire the agency CSV and its data dictionary. Record download URL, retrieval timestamp, publication/revision date, row count and SHA-256.
- Map actual source IDs, sample IDs, analytes, concentrations, units, result qualifiers, detection limits, coordinates and sample dates. Do **not** guess headers.
- Distinguish non-detects, censored values, duplicates, blanks, rejected results and treatment status. The pilot currently has **no honest display for censored/non-detect values**, so exclude them from numeric comparisons pending a typed result model; never replace with \`0\`.
- Avoid converting between ng/L, ppt, ug/L until an audited conversion with units and analytes is implemented.
- Differentiate **source-water observations** from **finished distribution tap water**. A detection at a source cannot be extrapolated to every household or private well.
- Link all claims to exact water system, source and sample records. Dates, methods and jurisdiction-specific thresholds must be verified against currently effective rules.
- Do not infer health risk, MCL violations, trend significance, wildfire perimeters, or predictive outcomes from this MVP.

## Official data entry points verified 2026-10-23

- Washington DOH PFAS dashboard/download: https://doh.wa.gov/data-and-statistical-reports/washington-tracking-network-wtn/pfas/dashboard
- EPA UCMR 5 occurrence data: https://www.epa.gov/dwucmr/occurrence-data-unregulated-contaminant-monitoring-rule
- NASA FIRMS web services: https://firms.modaps.eosdis.nasa.gov/web-services/
- USGS EarthExplorer: https://earthexplorer.usgs.gov/

These are **research doors**, not proof of functioning API ingests. Some agency portals require authentication, dataset exports, licensing checks, attribution, rate limits, or server-side normalization. Never claim live freshness without a verified refresh receipt.

## Engineering gates before publishing a real investigation

1. **Source adapter:** deterministic parsing of an agency-exported file and separately validated source metadata.
2. **QA:** test normal results, non-detects, changing limits, duplicates, irregular samples, missing geolocation, mismatched units, altered locations, bad links, and implausible changes.
3. **Lineage:** immutable input hashes; transformation version; record-level provenance; independent fact checks.
4. **UX:** distinguish measured changes from changing monitoring coverage. Show *unknown*, not a synthetic negative.
5. **Accessibility/security:** keyboard and screen-reader review, CSP and self-hosted assets, stronger imported-file validation, title-safe DOM updates.
6. **Integration:** bring the verified map evidence product into existing EverMaps and World Engine routes through normal Systemia preflight. No automatic publishing or heartbeat mutations.
7. **Release gate:** human editorial approval; public-safety disclaimers; source rights; load/performance/privacy audit; functioning owned-host deployment; independent external canary and receipt.

## First useful editorial pilot

**Yakima Valley: What has actually been measured in public drinking-water sources?**

Start with Washington DOH's PFAS export; join against verified public water system/source identifiers; show sampling dates and provenance, including places where coverage is missing. Don't present a headline about contamination until evidence review supports it.

This project is **not** the earthmoving EarthWorks fleet autonomy product. No payment, agent action, production deployment, or vendor access is authorized here.
