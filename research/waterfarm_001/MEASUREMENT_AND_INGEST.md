# WATERFARM-001 | Evidence intake + bench instrument plan, v0.4

**Research-only. No hardware ordered, wired, installed, water distributed or outreach sent.** This is a candidate protocol for qualified personnel to review, not an engineering certification or operating manual.

## Daily observation ingestion
- `observation_ingest.py` accepts externally provided NOAA Daily Summaries-style CSV columns `STATION,DATE,PRCP`. Only explicitly labeled metric PRCP values in **mm** are accepted.
- The caller must provide requested calendar dates and independently measured/declared daily site water demand. It rejects nonconsecutive coverage, station mismatches, duplicates, missing values, trace codes (such as T), negative numbers, NaN, infinity, and ambiguous units. Missing is **UNKNOWN**, never zero.
- Emits cryptographic SHA256 digest of supplied CSV bytes + record count/date range/station/precipitation total. This is a reproducibility receipt, **not authenticity or QC certification**. Values are labeled `SUPPLIED_CSV_UNVERIFIED_NOAA_OR_QC`.
- NOAA's official public data service is a prospective feed, not connected to this code: https://www.ncei.noaa.gov/access/services/data/v1?dataset=daily-summaries&stations=USW00024243&startDate=2025-01-01&endDate=2025-12-31&dataTypes=PRCP&units=metric&format=csv .
- Site operators and experienced weather analysts must review quality flags, missing traces, snow water equivalent and localized bias before using water-yield predictions in design.
- No API token, address, landowner info or customer data enters this public research branch.

## Bench measurement plan, not approval to purchase
| Measurement | Device class to evaluate | Validation |
| --- | --- | --- |
| Starting/source water + recovered condensate | 0.1–0.5 kg resolution bench scale / tested liquid-flow measurement | Calibrated weighed volume, temperature check, signed calibration receipt |
| Ambient and chamber RH + temperature | At least two independent T/RH sensors, logged UTC | Co-located calibration and drift comparison |
| Dew point / coil temperature | Temperature probe + measured RH processing | Compare dew point and saturation calculation, reject impossible yield |
| Electrical cost (including fans/pumps/control) | Plug-in watt-hour meter appropriate for the rig | Log power with and without condenser, include ancillary consumption |
| Rain and tank storage (later) | Tipping-bucket gauge or official station daily data, measured tank level | Verify timescale, precipitation flags and collection surface eligibility |
| Water safety | Sealed isolated sample container + accredited water-quality lab protocol | No release to crops or drinking lines before verified, authorized treatment and end-use decision |

### Candidate controlled study
- Baseline: same crop/conditions with conventional ventilation/dehumidification; experimental: condensate recapture, scientifically matched temperatures, humidity, airflow and lighting.
- Pre-register minimum run time and sampling, and compare plant physiology, outside water addition, condensate mass, power, all losses and true water avoided.
- Engineering and operator review of mold, electrical risks around water, overflow, contamination, scalding, cross-connections and acceptable disposal before bench operation.
- Use only labeled catch vessels; no reintroduction into irrigation or any drinking-water plumbing.
- Acquisition should wait until scope and existing available instruments are inventoried and an accountable person signs safety controls.

### Admission to partner-ready stage
- Source-verified daily weather, including valid dates/units/gaps and provenance; cross-check precipitation against NOAA official station file.
- Observed site irrigation water meter data, hourly or daily, and a crop/greenhouse candidate.
- Sensitivity including 0–1 mm first flush, winter snow availability, 250–20,000 L storage and rainfall event timing.
- Full economic table with site-specific marginal water cost, electricity price, meter calibration uncertainty, OPEX, CAPEX, risk and least-cost incumbent comparison.
- Pilot scientific experimental design reviewed and documented; no public claim of novel physics or guaranteed yields.

**Decision:** keep the two WSU/SYCD Gmail drafts unsent. WSU technical input may eventually be valuable to validate the bench plan even without building hardware, but don't solicit a resource commitment on unverified numbers.
