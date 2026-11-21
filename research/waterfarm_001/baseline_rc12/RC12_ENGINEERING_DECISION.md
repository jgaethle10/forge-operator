# Evercraft Aqua | RC12 single-meter field-baseline path

**Research branch only. November 9, 2026.** No real customer/site data collected in this revision, no field deployment, no water savings or leak proven, no equipment purchase, no outside outreach, no scientific or permit endorsement.

## Why this was necessary

Aqua RC11's high-evidence intake required *two water meters* (source and irrigation) with known boundaries plus energy. This is valuable for a particular topology but excludes prospective research hosts who only have a main source meter. Requiring a fictional downstream meter or treating unobserved water as zero would be scientifically unacceptable.

**RC12 introduces a parallel, explicitly lower-evidence mode:** 15 consecutive daily cumulative readings from **one existing source meter**, which yield 14 daily *withdrawal intervals*. Pump energy is optional. Every difference is a totalizer delta, not water loss. The prior two-meter, separately reviewed boundary-analysis code remains unchanged and separately available in RC11.

### What the implementation can legitimately answer

1. How many liters passed the named totalizer over the observed 14+ daily intervals? Source arithmetic, subject to operator-supplied units/reading validity, not independently verified.
2. What was the average withdrawal per observation interval?
3. If *all* associated interval pump-energy measurements exist, what was total kWh and kWh per cubic meter of source withdrawals? If any readings are missing, energy intensity remains **unknown**, not zero.
4. What needs validation next: meter calibration, same-time daily reading cadence, boundary/topology, other water uses, independent review, crop needs, weather, and whether any change can be attributed to an intervention?

### What the tool must NOT answer

No source authenticity, water rights, water quality, irrigation efficiency, crop water stress, leak location, leakage volume, recovered water, proven savings, comparative treatment effects, or financial ROI. The calculator is **no substitute** for professional site review and does not actuate equipment.

## Engineering delivered

- `app/core.mjs`: strict RFC-like quoted CSV reader, safe finite decimal checks, ISO dates, contiguous readings, no reset/rollover, stable meter ID, unit choice L / US_GAL / M3, explicit source provenance, energy missingness, machine-readable data boundary. Demo reupload marked HOLD, and obviously fictional IDs blocked even if mislabeled.
- `app/index.template.html` and `build.py`: offline, responsive one-file 390px phone-width and desktop interface. Paste CSV or choose local CSV, download dynamically dated blank 15-reading template, run synthetic demo, inspect daily graph and download audit JSON. No backend, third-party JS, tracker, cookies, persistent data storage or network integration. A changed/invalid input clears the previous report. An invalid async file selection cannot preserve previous results.
- SHA256 of *decoded text* in audit receipt. This is NOT the physical file's cryptographic signature after possible encoding or byte-order-mark normalization; only content integrity reference.
- `research/single_meter.py`: independent Python implementation, not just a wrapper around the JS code; cross-language checks on liters, U.S. gallons, cubic meters, optional energy and rejection cases.
- `tests/core.test.mjs`, `tests/parity.py`, `tests/browser_qa.py`: local 24 unit tests, three cross-language parity scenarios + rejection cases, plus Chromium desktop/390px phone emulation. Browser QA uses document injection because this container's Chromium navigation to local file/localhost was blocked by administrator. **Native iPhone Safari, actual on-device File import and GitHub CI remain unverified.**

### Key limitations

- Daily readings should be taken at consistent times and same time zone; the format does not authenticate time-of-day and is not suitable for precision leak claims.
- U.S. liquid gallons: 3.785411784 L; m³: 1,000 L. Meter units must be confirmed from actual device markings. Estimated readings or counter resets hold.
- The blank template is *not* real evidence; no populated real-customer file is bundled.
- We cannot infer a system's site boundary or a physical conservation outcome from one meter's readings.
- Mobile screenshots depict actual browser-rendered UI with clearly synthetic demo content, **not a commercial deployed service**.

## Site trial gate (human, private, passive)

1. Site owner/operator explicitly consents to a private observational audit, specifies data retention and permitted use, and identifies meter totalizer + actual units; no public transmission of customer/site details.
2. Record meter photos/serial, existing calibration log, time of day and station/crop context, and obtain 15 same-time daily readings plus optional pump kWh logs; if only 14 readings exist there are 13 intervals and the program correctly holds.
3. Run in a private local environment and have an operator/professional review raw inputs and site boundary. Source observations are still UNVERIFIED until authenticated outside software.
4. Only after observing an actual baseline, compare actual site improvement opportunities (scheduling, pressure, repairs) with lowest-cost lawful alternatives. Require a matched, independently reviewed experiment before asserting saved water or a greenhouse-recovery effect.

## Weather, film and partnership status

NOAA's official Access Data Service documentation remains a credible *public* API reference, but **2022/23 full official Yakima Airport station files were not acquired in this execution session** (web fetch cannot return file; runtime DNS unavailable). Existing 2024 observed daily series and known 2025 missing May 22 remain as prior evidence. No fabricated three-year study. Sources:
- https://www.ncei.noaa.gov/support/access-data-service-api-user-documentation
- https://www.ncei.noaa.gov/access/services/data/v1?dataset=daily-summaries&stations=USW00024243&startDate=2022-01-01&endDate=2022-12-31&dataTypes=PRCP&units=metric&format=csv&includeAttributes=true

The real-camera Aqua short film still lacks acquired rights-cleared footage. The earlier rejected abstract motion design is **not** a released film. Prior WSU/SYCD outreach drafts remain UNSENT. No production deployment, purchases, physical plumbing, crop reuse or partner commitments are implied.

**Next decision:** start with the low-friction withdrawal-baseline offering, then add instrument/site authentication and a controlled, independently reviewed comparison. Not another speculative large reservoir.
