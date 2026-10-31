# Evercraft Aqua RC04 | Daily climate evidence and delivery feasibility

**Research preflight, October 25, 2026. No physical freshwater production or customer site has been tested.** Engineering branch remains in draft review. Real footage master is also still blocked on source-video rights and acquisition.

## Question answered by RC04 engineering
Can we move from optimistic monthly climate normals to an inspectable, *daily* water-delivery and tank-sizing screen without silently converting missing, trace, failed-QC or multi-day rainfall into ordinary daily zero/precipitation values? **Yes, in software, on synthetic offline fixtures.** The official station download and real daily station QC have NOT run successfully in this environment, so real Yakima yields and tank sizes remain **UNKNOWN**.

## Source and provenance
- NOAA GHCN-Daily README version 3.35, section III: https://www.ncei.noaa.gov/pub/data/ghcn/daily/readme.txt
- Yakima Airport station ID USW00024243: https://www.ncdc.noaa.gov/cdo-web/datasets/GHCND/stations/GHCND%3AUSW00024243/detail
- Exact official station source: https://www.ncei.noaa.gov/pub/data/ghcn/daily/all/USW00024243.dly
- PRCP is recorded in *tenths of millimeters*; **raw 0** is an observed zero; **-9999** is missing. MFLAG T trace, P presumed zero, H ambiguous '0/trace'; QFLAG nonblank failed data checks. MDPR is multiday precipitation, not a PRCP daily reading. All questionable records are held rather than silently zero-filled.
- Original station file covers many years and can be revised as QC updates. A source-byte SHA256 and response URL/header receipt accompany an explicitly requested download. Later parsing produces a per-day error audit with versioned source-hash-linked QC and normalized CSV artifacts.

## New code
- `noaa/ghcnd_source.py`: standard-library-only fixed-width NOAA station parser; strict station/year identity and calendar completeness; prints QC result; refuses to export a model-ready precipitation series on ANY held day. Valid source values with daily A-G aggregation are retained with explicit caveats about observation periods.
- `noaa/water_budget.py`: accepts only a QC-complete input series; evaluates how different **hypothetical** tank sizes convert daily station precipitation into modeled deliveries to an **assumed** daily nonpotable demand. Tracks admitted rain after assumed wet-day first flush, tank spill, stored water, delivery, makeup supply, dry stretches, water conservation residual, and source provenance. It is not a pump control service, treatment design or engineering certification.
- `tests/test_ghcnd_source.py`, `tests/test_ghcnd_download.py`, and `tests/test_water_budget.py`: simulated cases for missing months, leap days, source/quality/measurement flags, multiday exclusion, official URL boundary, incorrect data payload, source SHA, mass balance, storage monotonicity and no-data HOLD.

## Reproducible checks, no network required
```
cd aqua_rc04
python -m unittest discover -s tests -p 'test_*.py' -v
python -m compileall -q noaa science film
```

**58 local tests passing** (30 RC03 + 28 RC04), Python 3.13. GitHub CI has not independently run and external data accuracy has not been established by these tests. ALL generated data used for tests are synthetic. No Yakima station weather records were fabricated or inserted.

## NOAA file acquisition on authorized connected workstation
```
python noaa/ghcnd_source.py --input USW00024243.dly --download --year 2025 --output qc/
```
This fetches only the named public GHCN station file from NOAA with default TLS verification, bounded input size and origin check, logs SHA256, and then performs conservative QC. Use on a networked, authorized worker, not as an autonomous loop. If even one of 365 days is flagged/unavailable the result is HOLD. Don't make water-delivery claims from a failed or unreviewed yearly series. This command has NOT been successfully executed against live NOAA data in this artifact environment.

After QC success, to **model a scenario only**:
```
python noaa/water_budget.py --input USW00024243.dly --year 2025 --roof-m2 100 --daily-demand-l 1000 --tanks-l 250 1000 5000 20000 --out tank_screen.json
```
No field data or site-authorized water transfer are implied. The observed *station* rain is not rooftop catchment rain, especially with snow, timing, site microclimate, runoff quality and roof-use rules.

## Economic decision to pursue
The strongest immediate commercial hypothesis is **water measurement intelligence**: transparent measurement, time-aware storage/withdrawal modeling, and alternatives comparison for farms/greenhouses, rather than advertising water manufactured from ambient air. Preserve a site operator's true baseline and meter-quality evidence. Compare the least-cost legal irrigation-management option before any condensate unit proposal.

## Red lines and open blockers
1. Real official daily GHCN station source and its QC report not yet acquired. Do not present synthetic rainfall fixture as Yakima measured data.
2. No authorized farm/greenhouse daily withdrawals, crop coefficients, system energy profile or meter uncertainties measured.
3. No commissioned equipment, water treatment or lab data, state/local water rights or safe reuse authorization.
4. No causally identified field freshwater savings, ROI or independent scientific endorsement.
5. First real-camera Aqua film still requires footage acquisition, individual commercial license clearance and actual editing; old abstract video was rejected by owner.
6. WSU Prosser / South Yakima Conservation District Gmail drafts remain UNSENT. No partnership, purchase or deployment claimed.

**Acceptance for the next gate:** official-source verified 2025 daily data receipt; QC resolution without inventing zeros; actual site use case plus a reviewer-approved conservation/energy comparison protocol. If station QC has missing readings, report them and request alternate approved stations / dates rather than auto-fill.
