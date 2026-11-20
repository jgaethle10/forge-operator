# FAIE

FAIE is Evercraft's evidence-first field, agriculture, land, water, production and resilience investigation engine.

It is no longer only a discovery record. This directory contains the owned runtime that receives Systemia Worldstate observations, preserves evidence state and provenance, maintains a durable signal store, and produces bounded investigations for a specific geography, asset, crop, water source or operating question.

## Role in the stack

Systemia Radar asks:

> What materially changed?

FAIE asks:

> What evidence is relevant to this farm, watershed, greenhouse, parcel, crop, production system or resilience question, and what remains unknown?

FAIE is a specialist consumer of the shared Systemia Worldstate fabric. It does not replace Radar, TOWI, Evermaps, Sentinel or the shared observation layer.

## Evidence contract

FAIE keeps the upstream Worldstate evidence states distinct:

- MODELED
- REPORTED
- OBSERVED
- VERIFIED

A model never silently becomes an observation. A report never silently becomes verified evidence. Missing evidence is not converted to a zero or a clean bill of health.

Each admitted signal carries source system, source family, observed timestamp, region keys, domains, FAIE dimensions, reliability, severity, signal score, provenance references, and explicit false publication/decision authority.

## Investigation contract

A bounded investigation accepts a question plus optional region keys, asset types, crop, water source and horizon in days.

It returns ranked relevant findings, evidence-state labels, source-family diversity, an evidence ledger, a bounded evidence-coverage confidence value, unknowns, evidence still needed and explicit decision/publication boundaries.

The confidence value is not a probability that an event will occur and is not a recommendation to take a consequential action.

## Runtime

Default durable state:

    .runtime/faie/
      state.json
      public-latest.json
      receipts.jsonl
      investigations/
        <investigation-id>.json
        <investigation-id>.md

Environment:

- FAIE_RESIDENT_ENABLED=true|false
- FAIE_INTERVAL_MS=300000
- FAIE_STATE_DIR=/persistent/path
- FAIE_INTERNAL_TOKEN=...
- FAIE_OFFICIAL_COLLECTORS_ENABLED=true|false
- FAIE_NWS_ENABLED=true|false
- FAIE_USDM_ENABLED=true|false (defaults true only with the verified Yakima Basin profile)
- FAIE_REGION_PROFILE=yakima-basin-wa (optional verified Sentinel profile)
- FAIE_NWS_AREA=WA (optional override; empty means the profile area or national active-alert feed)
- FAIE_USGS_WATER_SITES=USGS-12484500,... (optional)
- FAIE_USGS_WATER_PARAMETERS=00060,00065
- FAIE_NWPS_GAUGES=<gauge-id>,... (optional)

Production defaults the FAIE resident on. Development defaults it off unless enabled.

## APIs

Public evidence-support surfaces:

- GET /api/faie/health
- GET /api/faie/signals
- POST /api/faie/investigate
- POST /api/faie/compare
- GET /mcp/faie?action=health
- POST /mcp/faie

Public investigation requests are ephemeral previews. They are rate limited by the Forge runtime and are not written into the shared investigation archive.

The native FAIE MCP exposes four read-only tools:

- investigate_faie_evidence
- compare_faie_candidates
- get_faie_signal_snapshot
- get_faie_health

The MCP uses the same in-process FAIE runtime as the HTTP API. Its investigation tool calls the non-persisting preview path, so an agent cannot silently add a caller question to the internal archive.

Internal investigation and write surfaces require FAIE_INTERNAL_TOKEN:

- GET /api/faie/investigations
- GET /api/faie/investigations/:id
- GET /api/faie/investigations/:id/markdown
- POST /api/faie/investigations
- POST /api/faie/ingest
- POST /api/faie/acquire/soil
- POST /api/faie/rivet-context
- POST /api/faie/worldstate-dispatch
- POST /api/faie/run

Human UI:

- /faie/


## Comparative underwriting

FAIE can apply the same evidence rubric across two to eight candidate regions or sites with `POST /api/faie/compare` or the read-only MCP tool `compare_faie_candidates`.

The output ranks **evidence readiness**, not site suitability. A candidate with better source coverage, more independent corroboration, stronger evidence and fewer missing dimensions may rank higher even when its underlying operating conditions are worse. FAIE therefore returns `site_suitability_verdict=null` and `investment_recommendation=null` for every candidate.

Public comparisons are ephemeral previews. Internal authorized comparisons may be persisted into the FAIE state and comparison archive.

## Saban specialist swarm

FAIE is registered in the governed Saban multiplication fabric as `software_id=faie`. The bounded specialist roles are soil systems, water systems, climate/resilience, energy/infrastructure, logistics/market, labor/economics, policy/permitting, production systems, provenance, adversarial challenge, thesis memory, and reconciliation.

The FAIE Saban contract is deny-by-default. It cannot independently send outreach, file public-records requests, publish, create checkout, accept contracts, move money, mutate production systems, or make consequential decisions. Its composite output must pass full role coverage, reconciliation, and source-integrity checks.

Run the current proof:

    npm run proof:saban-faie

The current public design-partner review item lives in `systemia/faie/saban-review-queue.json`. It is a public-evidence product test, not private customer data and not an assertion about undisclosed customer architecture.

## Thesis memory and evidence acquisition

An investigation may include `thesis_assumptions`. FAIE assigns stable assumption IDs and links current relevant evidence without converting related evidence into a verdict. Each assumption remains explicitly bounded by `verdict_authority=false`.

Missing decision dimensions are also converted into a structured `evidence_acquisition_queue`. Each queue item records the gap, priority, preferred evidence types, and the fact that no external action has been taken. Acquisition that requires field work, records requests, operator records, or other consequential steps stays human- or separately-authorized.

## AgNormal / regional food-infrastructure pilot path

The real FAIE UI at `/faie/` contains a one-click AgNormal regional food-infrastructure pilot scope. It does not switch to a canned demo or prewritten answer. The preset only fills the live investigation inputs and sends them through the same FAIE runtime used by every other public investigation.

Regional food-infrastructure scopes are treated as multi-domain evidence problems. FAIE expects coverage across water, soil, heat, energy, infrastructure, logistics, labor, economics, policy, crop health and resilience when those dimensions are relevant. The packet exposes which dimensions are covered, which are missing, independent source-family count, strong-evidence count and decision-readiness state.

The public packet follows the product workflow:

    SENSE
      -> current relevant evidence + source links
    CHALLENGE
      -> uncertainty + missing domains + corroboration gaps
    DECIDE
      -> next evidence required before consequential operator review

The packet can be copied or downloaded as JSON client-side without persisting the caller's public question.

Pilot acceptance gate:

- real FAIE runtime, not a separate demo engine
- no login required for the public preview
- source lineage visible when a public provenance URL exists
- missing evidence stays visible
- controlled-environment coverage gaps are explicit
- one-click Yakima Valley food-infrastructure scope is available on the real UI
- human review remains required before consequential action

### FEMA NFHL effective flood-hazard point lookup (first insurance intelligence layer)

The Evercraft-owned edge provides `POST /api/faie/flood/preview` for an explicitly supplied WGS84 latitude/longitude within the contiguous United States. This is an **opt-in** addition to the site scan and is not an insurance-quote, claims or underwriting endpoint. Coordinates are sent to FEMA's official National Flood Hazard Layer ArcGIS REST service to query:

- **Flood Hazard Zones (layer 28)**: a point-intersection against effective `S_FLD_HAZ_AR` polygon features. Return reported FEMA `FLD_ZONE`, `ZONE_SUBTY`, `SFHA_TF` (true/false only when explicitly provided), source references, and map metadata. Official provenance: https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28.
- **FIRM Panels (layer 3)**: independent intersecting effective FIRM panel reference and `EFF_DATE` when provided, including missing date or unavailable panel as unknown. Official provenance: https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/3.

The endpoint uses a fixed allowlisted FEMA host, two bounded point queries (geometry only in the upstream query; no raw arbitrary geometry returned), strict response and field parsing, modest rate/concurrency limits, no state writes, and no automated decision or publication authority. FEMA data classification is **REPORTED** official regulatory mapping, not measured flood depth, a property survey, an insurer quote, insurance coverage or eligibility, or a guarantee of flood safety.

**Negative inference is prohibited:** when an official query returns zero hazard polygons, FAIE says so literally. Even a matching FIRM panel does **not** make it safe; no returned panel and zero polygons is coverage **unverified**. Source failures return 502 rather than an invented zone or low-risk score. Effective mapping cannot represent all flash floods, local drainage events, future climate conditions or flood damage, and must be checked against LOMR/LOMA, FEMA Map Service Center, county/local administrators and historic loss data.

Source adapter tests: `systemia/faie/fema-flood-point.test.mjs`; owned-route/limits/privacy tests: `systemia/mcp/fabric-faie-flood-preview.test.mjs`; web acceptance: `scripts/faie-browser-partner-acceptance.mjs`; real upstream gate: `scripts/faie-fema-flood-live-acceptance.mjs`. The public test point is **46.6021, -120.5059**, and the gate must receive actual FEMA zone or panel context before the source can be described as verified live.

Next, add anonymized OpenFEMA NFIP claim history at its available publication granularity and USDA RMA county/crop cause-of-loss payouts. Those sources remain separate **area-level** evidence, never evidence that a named private property filed a claim.

### NOAA NCEI historic station context (optional, Yakima pilot)

The owned edge exposes `POST /api/faie/climate/history` for **explicitly supplied coordinates** within 40 km of NOAA's Yakima Airport GHCN-Daily station `USW00024243` (NOAA record 46.56398, -120.53488). It is **not a nearest-station search**: points outside the verified station radius receive a 422 hold. The user interface keeps history behind an optional action, separate from the fast soil + NWS forecast scan.

The source is the official NOAA NCEI Access Data Service `/access/services/data/v1`, dataset `daily-summaries`, station `USW00024243`, complete calendar years **2023 and 2024**, daily `TMAX`, `TMIN`, `PRCP`, standard Fahrenheit/inches, with available quality attributes. Both years must be available; an official response with no trustworthy data, sparse coverage, unexpected station ID, invalid dates or quality-flagged readings is never promoted into a complete historical sample. A 70% valid-day coverage requirement applies separately to each of the three measures. Counts are not divided by missing days.

The report provides **observed** counts and actual denominators for station maximum temperature >=95°F, station minimum temperature <=32°F and precipitation >=0.01 inch; station distance, period, missing/quality-excluded readings, official source URLs and downloadable JSON. Two years are **not 30-year climate normals**, a forecast, a site microclimate, or evidence of crop or investment viability. No site approval or rights inference is ever made.

The endpoint uses a low-volume public rate limit, single concurrent NOAA archive scan and bounded fixed official URLs. It never persists user coordinates or results in FAIE regional observations, investigations or comparisons. User coordinates are used to check the nearby official station, but the NOAA request itself is station-bound and contains **no customer coordinates**. The public live acceptance gate uses only the already-public Yakima sample point 46.6021, -120.5059 and requires actual NCEI observations to pass.

QA: `systemia/faie/ncei-climate-history.test.mjs`, `systemia/mcp/fabric-faie-climate-history.test.mjs`, source UI contract, and external `scripts/faie-climate-live-acceptance.mjs`. Source metadata: https://www.ncei.noaa.gov/cdo-web/datasets/GHCND/stations/GHCND%3AUSW00024243/detail . API documentation: https://www.ncei.noaa.gov/access/search/documentation/data-service/ .

### FAIE V12 point-operating site scan

The public, owned-Evercraft `POST /api/faie/site/scan` is a **user-initiated, point-scoped** scan. It combines **two distinct official products** without treating them as one fake confidence score:

1. **USDA NRCS Soil Data Access / SSURGO**: mapped survey map units, source update date, farmland classification, major components and slope. `REPORTED` mapped survey evidence, never current site soil sampling.
2. **NOAA National Weather Service**: `/points/{latitude},{longitude}` discovery followed by an **allowlisted** `api.weather.gov/gridpoints/{office}/{x},{y}/forecast` URL. Includes issued-at timestamp, up to 14 future forecast periods and short operating-window screening cues for temperature >=95°F, temperature <=32°F, rain probability >=60%, and wind max >=25 mph. `MODELED` forecasts, not observed site weather or crop-specific models.

The website offers a **Run two-source site scan** button alongside the existing soil-only lookup, plus a public sample point (46.6021, -120.5059). It renders evidence, source provenance and dates, transparent heuristic flags, missing inputs, next checks and a downloadable **JSON receipt**. Public point scans cannot infer parcel bounds, ownership, legal water rights, irrigation allocations, zoning, actual field soils, energy tariffs, logistics or profitability, and they do not issue a suitability/investment verdict.

**Authority and safety**: coordinates are explicitly supplied by the visitor and sent to NOAA and USDA; public scan requests are not written to shared FAIE history. All output remains read-only, no automatic publication or decision authority. The shared per-client/global request budget and concurrent upstream call limit apply to soil-only and combined scans. Forecast URLs coming from the official discovery response must pass a strict HTTPS host/path allowlist to prevent remote redirects or SSRF. Missing, stale or failed official feeds remain `unavailable` or `partial_evidence`; two unavailable feeds fail closed. Do not call a partial scan complete.

**Acceptance**: source-specific parser/SSRF/uncertainty tests in `systemia/faie/nws-site-forecast.test.mjs`, source merging in `systemia/faie/site-scan.test.mjs`, actual owned-edge route tests in `systemia/mcp/fabric-faie-site-scan.test.mjs`, and public release proof `scripts/faie-site-scan-live-acceptance.mjs`. The acceptance script uses only a fixed public sample point; it requires genuine NOAA and USDA responses on the live owned edge.

Official API: https://www.weather.gov/documentation/services-web-api and https://sdmdataaccess.nrcs.usda.gov/WebServiceHelp.aspx.

### Public mapped-soil point preview

The Evercraft-owned Fabric edge provides `POST /api/faie/soil/preview` for an explicitly supplied latitude/longitude in the contiguous United States. A visitor opens the collapsed "Have a specific location?" panel, enters the coordinates, and submits an opt-in on-demand request. The server performs a bounded read from USDA NRCS Soil Data Access with fixed SQL and capped provider concurrency, checks rate limits, and returns a compact `evercraft.faie.public-soil-preview.v1` response.

- Public coordinates and soil results are **not ingested into FAIE shared investigation history**, nor does this route save the visitor's requested location in FAIE state. The upstream USDA service receives the coordinates to make the query.
- No parcel owner or individual is looked up; source evidence remains `REPORTED` mapped survey context, **not field sampling** or an automatic site or investment verdict.
- If USDA returns no map unit, FAIE says no mapped soil was returned, not that no soil exists. On provider errors, it returns a fail-closed 502.
- If official survey-update metadata are unavailable, survey date is unknown; the retrieval date never masquerades as an official survey update.
- The sample startup and QA harness use injected fixtures, never real third-party source calls. Source details and privacy/rate limits are covered in `systemia/mcp/fabric-faie-soil-preview.test.mjs`.

### USDA NRCS site soil acquisition

The internal `POST /api/faie/acquire/soil` route performs a bounded read from USDA NRCS Soil Data Access when an exact latitude and longitude are supplied. It uses the official WGS84 map-unit intersection function and retrieves SSURGO map-unit, component, horizon and texture-related fields.

Soil Data Access is treated as official mapped survey evidence, not a live field soil test. FAIE preserves the survey-area `saverest` update date as the observation timestamp when available, labels the evidence `REPORTED`, and carries an explicit field-verification requirement for consequential site, crop, engineering or capital decisions.

FAIE does not substitute a regional centroid or arbitrary sample point when exact site coordinates are missing.

## Owned evidence bridges

FAIE can consume neutral site evidence already acquired by other Evercraft systems rather than forcing each specialist to rebuild the same source adapters.

The internal `POST /api/faie/rivet-context` route accepts an authorized RIVET/AliEV site-intelligence snapshot and converts only reusable physical-site evidence into FAIE observations:

- utility service-area and tariff candidates
- traffic and freight context
- parcel/planning context
- incentive/program context

The bridge explicitly excludes charger inventory, EV adoption, charging-session utilization, EV sales angles and EV-specific modeled demand. It does not upgrade the upstream evidence state or create site-suitability authority.

## Autonomous loop

The resident runtime can continuously bridge material Systemia Radar signals into FAIE while direct Worldstate dispatches can feed the specialist with the broader domain stream. The Radar bridge is deliberately a fallback/secondary path, not a replacement for the Worldstate subscription contract.

FAIE also reuses existing Sentinel official-source adapters. NWS active alerts are enabled by default. USGS Water Data and NOAA/NWS National Water Prediction Service gauges turn on when monitoring IDs are configured. A verified Sentinel region profile can supply those source IDs as a single bounded configuration; for example, `FAIE_REGION_PROFILE=yakima-basin-wa` inherits the existing Yakima Basin NWS/USGS source set. Their upstream evidence ceilings, reliability, provenance and coarse-location rules are preserved rather than reinterpreted as stronger evidence.

### Independent U.S. Drought Monitor county evidence

The bounded collector in `usdm-source.mjs` reads the official National Drought Mitigation Center/USDA/NOAA U.S. Drought Monitor CountyStatistics percent-area REST service, using **traditional cumulative** D0–D4 percentages and the actual weekly `MapDate`. Its initial whitelist is Yakima County (53077), Benton County (53005), and Franklin County (53021), with region labels `yakima-wa` and `tri-cities-wa`. It is enabled automatically only for the independently configured `yakima-basin-wa` profile; other profiles fail closed until explicitly mapped. County observations remain `REPORTED`, not field measurements. The FAIE dimension classifier treats those county drought assessments as **resilience** context only, regardless of soil, water-right or crop caveats in the text. Previously admitted USDM signal dimensions are reconciled conservatively on runtime startup and recorded in a source-scope repair receipt; a drought report does not satisfy a soil or crop-evidence gap. FAIE never infers a parcel's water rights, crop viability, buildability, or irrigation allocation from county statistics. An unavailable, stale, future, wrong-county, malformed, or internally inconsistent result yields an error/partial receipt, not a made-up signal. The source is independent of USGS stream monitoring but still is **not** a site-level decision.

Official API documentation: https://droughtmonitor.unl.edu/DmData/DataDownload/WebServiceInfo.aspx

The first release therefore has an actual closed loop:

    WORLDSTATE / RADAR
      -> FAIE INGEST
      -> NORMALIZE
      -> PRESERVE EVIDENCE STATE
      -> CLASSIFY FIELD DIMENSIONS
      -> SCORE SIGNAL
      -> PERSIST + RECEIPT
      -> SCOPED INVESTIGATION
      -> EVIDENCE LEDGER + UNKNOWNS
      -> HUMAN / AGENT CONSUMPTION

## Commands

    npm run test:faie
    npm run faie:once
    npm run faie:resident

## Boundaries

FAIE is evidence support. Public previews do not persist the visitor's question into the shared archive. FAIE does not autonomously publish, move money, make regulatory determinations, issue emergency orders, prescribe agricultural chemicals, control irrigation equipment, or make other consequential decisions. Those actions require the appropriate human or separately authorized system.

Unknown is a valid result.

### OpenFEMA NFIP historical claims (source adapter staging, NOT live)

The `systemia/faie/nfip-claims-v3.mjs` adapter targets FEMA's **NFIP Redacted Claims - v3** dataset at `https://www.fema.gov/api/open/v3/NfipClaims`. This first bounded, testable stage accepts only an **explicit two-letter state and inclusive loss-year range**. It never accepts visitor point coordinates, property addresses, insurer records or caller-supplied claim identifiers. It selects only loss-year and payment fields, pages bounded official API results, requires full pagination before returning a receipt, suppresses aggregates with fewer than 11 transactions, and returns no raw claim rows.

The adapter is **not yet wired to the public FAIE page or an active endpoint**. It has deterministic mocked official-source tests; successful tests do **not** prove FEMA's live v3 response, deployed Fabric readiness, data freshness, or permission to infer individual property losses. Only a separately verified public source can advance release status. Do not combine state-wide historical claim totals with a point-specific FEMA flood map as a parcel insurance or safety decision.

Staged test: `node --test systemia/faie/nfip-claims-v3.test.mjs`. Next gates: independently verify current FEMA v3 API schema and year-scope semantics, add a rate-limited owned Fabric route, choose the correct county geographic relationship with independently sourced FIPS evidence, then attach a human-readable, area-labeled historical-loss panel to the scan. Continue to hold public claims of live verification until every owned-edge and privacy gate passes.
