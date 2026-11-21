# Evercraft Aqua | RC05 Evidence Report

**Status:** actual NOAA station data ingested and QA-screened; hydraulic performance remains **hypothetical** and no physical pilot has run. October 26, 2026.

## Scientific advance
We retrieved NCEI's Yakima Airport daily-summaries precipitation series with `includeAttributes=true` through a public web-content fetch, then preserved the tool-extracted published CSV text in the separate GitHub research branch. This is NOAA's Daily Summaries **API subset**, not an independently fetched original GHCN `.dly` source. The published CSV includes a measurement flag (`T` = trace), quality flag, source code and observation-time field.

Official station: `USW00024243`, Yakima Airport, WA. Station details: https://www.ncdc.noaa.gov/cdo-web/datasets/GHCND/stations/GHCND%3AUSW00024243/detail
API request (2024): https://www.ncei.noaa.gov/access/services/data/v1?dataset=daily-summaries&stations=USW00024243&startDate=2024-01-01&endDate=2024-12-31&dataTypes=PRCP&units=metric&format=csv&includeAttributes=true
API parameter documentation: https://www.ncei.noaa.gov/support/access-data-service-api-user-documentation

### Raw source audit
| Year | Days expected | Daily rows in API | Measured days | Trace (T) days | Missing precipitation days | Bad quality flag days | Status |
| ---- | ----: | ----: | ----: | ----: | ----: | ---- | ---- |
| 2024 | 366 | 366 | 335 | 31 | 0 | 0 | **Pass** structural/attribute screen; suitable for conservative station-rainfall scenario |
| 2025 | 365 | 365 | 310 | 54 | **2025-05-22** | 0 | **HOLD:** no complete annual yield estimate |

Trace is precipitation below the reportable amount. It is explicitly recorded as *trace*, not a genuine dry day or a missing day. Because Aqua is screening gross **collectable volume**, RC05 uses a conservative zero-liter **lower bound** for a trace event. An unreported value is never silently converted into zero precipitation.

2024 sum of reported numerical (nontrace) precipitation: **213.1 mm**. This is station precipitation, including possible frozen precipitation. It is NOT rain caught on a test roof. Months January to December (mm): 48.6, 13.2, 14.8, 3.8, 7.0, 1.1, 1.3, 7.2, 1.6, 7.0, 49.3, 58.2.

## First actual-observation-driven storage comparison
These are **modeled facility scenarios** using observed 2024 Yakima Airport PRCP as an external weather input, not a field test. Assumptions: eligible existing-purpose roof area 100 m², capture coefficient 0.80, zero first-flush in this case, continuous hypothetical nonpotable demand 1,000 L/day, tank initially empty, each day's reported precipitation available before that day's demand, water quality/end-use approval hypothetical and outside model scope; no freeze/snow timing, plumbing, evaporation, treatment or roof contamination.

| Tank capacity | Modeled annual delivery | Modeled overflow | Ending tank |
| ---: | ---: | ---: | ---: |
| 250 L | 11,058 L | 5,990 L | 0 L |
| 1,000 L | 16,584 L | 464 L | 0 L |
| 5,000 L | 17,048 L | 0 L | 0 L |
| 20,000 L | 17,048 L | 0 L | 0 L |

At these assumptions the most an ideal 100 m² roof supplies is **17,048 L/year** against **366,000 L/year** assumed demand, about **4.66%**. At hypothetical marginal avoidable water cost **$3/m³**, that ideal gross volume is **$51.14 per year before CAPEX, OPEX, filters, energy, cleaning, disinfection, maintenance and permitted-disposal requirements**. This is a stress test, not a customer rate or bankable savings forecast.

Both a published 2024 source-attributes CSV and audit JSON are committed in `research/waterfarm_001/noaa/data_rc05/` in PR #1605. Python source `noaa_api_screen.py` strictly interprets supplied records, treats trace as a lower-bound zero, HOLDs missing readings and incompatible QA flags, and runs conservative tank mass-balance. A separate normalized 2024 values-only parity fixture was independently checked against the numbers above. The normalized file **is not represented as the official raw NOAA CSV**.

## Engineering conclusion
At Yakima precipitation and this scale, rooftop catchment alone cannot replace irrigation supply. Prioritize metering, leak diagnostics, irrigation scheduling, storage optimization, and a greenhouse experiment where recovering humidity is a useful **co-benefit** of conditions management. A water recovery project only proceeds if actual freshwater withdrawals decrease under controlled and verified safe conditions and the full cost is competitive.

## Next release gates
1. Direct-original `.dly` cross-check against NCEI's underlying published station file, plus correct handling of measurement/quality flags and recent corrections. A direct binary fetch from this working container failed due to DNS; the public API extraction worked through a connected web retrieval service.
2. Independent site roof/existing-purpose rights, catch quality and local conditions including frozen precipitation, effective first flush, interday/within-day timing and actual runoff efficiency.
3. Real grower or greenhouse meter baseline under signed consent, crop type, total environmental energy, end use and lab/regulatory requirements.
4. Independent experimental design and calibrated hardware trial; no claim of external-water savings solely because condensate was collected.
5. User-authorized commercial partner/outreach and publishing releases only after evidence review. Existing WSU/SYCD Gmail drafts remain unsent.

**Visual studio lane:** Real-camera-only source and rights gating is preserved from RC03. Actual live-action footage has not been acquired in this run and no new film master is claimed.
