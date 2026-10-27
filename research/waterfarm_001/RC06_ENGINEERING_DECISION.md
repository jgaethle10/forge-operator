# Evercraft Aqua | RC06: agricultural-season mismatch and field pilot gate

**Evidence date:** 2026-10-27. **Status:** research-grade computational scenario; no operating pilot, measured farm demand, authorized water reuse or verified financial return.

## What changed from RC05
RC05 rightly reported 2024 Yakima Airport daily PRCP of 213.1 mm and a 100 m² roof / 80% effective capture modeled gross 17,048 L of water across the calendar year. It modeled **365/366-day water demand**. That is not a sufficient proxy for seasonal agricultural irrigation.

RC06 holds the prior weather **date/quantity series** fixed and explicitly shifts assumed water demand to **May 1–Sept 30 only**, 1,000 L/day. The 2024 date/quantity research fixture was reconstructed from the audited NOAA CSV enumerated in RC05; the raw NCEI API CSV and separate provenance are retained in GitHub `research/waterfarm_001/noaa/data_rc05/2024_yakima_prcp_ncei_attributed.csv`. The reconstruction is not a fresh independently retrieved raw file, and it normalizes source flags. Do not substitute it for the original raw observation when publishing or engineering a field design.

The main lesson: **annual volume is not annual useful delivery**. A tank can capture winter precipitation and still deliver relatively little in summer. The values below are hypothetical storage calculations using measured 2024 station PRCP **only**. Every other assumption (roof area, flow efficiency, crop demand, timing and capture permission) is unverified. A climate year is not a seasonal forecast.

## RC06 scenarios (reproduced with `seasonal_screen.py`)

| Assumptions | Modeled input L/year | Delivered L to assumed demand | Overflow L | Year-end stored L | May–Sep assumed demand L |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1,000 L tank; year-round demand | 17,048 | 16,584 | 464 | 0 | 153,000 |
| 1,000 L tank; May–Sep only | 17,048 | 2,456 | 13,592 | 1,000 | 153,000 |
| 5,000 L tank; May–Sep only | 17,048 | 6,456 | 5,592 | 5,000 | 153,000 |
| 20,000 L tank; May–Sep only | 17,048 | 7,888 | 0 | 9,160 | 153,000 |
| 5,000 L tank; May–Sep; no Nov–Feb roof capture (sensitivity only) | 3,504 | 2,944 | 0 | 560 | 153,000 |
| 5,000 L; May–Sep; 1 mm first flush **per wet day** | 11,536 | 4,680 | 1,856 | 5,000 | 153,000 |
| 5,000 L; May–Sep; 0.2% tank loss daily | 17,048 | ~6,393 | ~4,285 | 5,000 | 153,000 |

Using a 5,000 L tank, only **4.2%** of the assumed 153,000 L summer demand is met, despite 17,048 L modeled annual potential. Even the 20,000 L tank meets only **5.2%** of summer demand *in the modeled 2024 year*. No modeled deliveries qualify as verified outside-water displacement without a safe actual use. With year-end water remaining, one calendar year's totals cannot be extrapolated to a multi-year steady-state system. The tank starts empty on Jan 1. All rainfall is assumed available ahead of same-day demand; **snow and freeze timing are not modeled**, and losses generally are omitted except in the explicit sensitivity.

**Warning:** The winter-collection restriction is only a what-if scenario, not an estimate of snow fraction. First flush per wet day is not first flush per rainfall event. A 0.2% tank-loss fraction is arbitrary, not measured tank evaporation. No funding, water tariff, installer quote or weather projection is used.

## Roof-harvest economics stress test
Even if all 6.456 m³ of 5,000 L tank's **assumed seasonal delivery** displaced priced marginal freshwater, at illustrative water values of $3/m³ or $10/m³ that is only **$19.37 or $64.56/year** gross benefit before operating expenses. A $1,000 installed system with $50/year maintenance and 10-year life requires roughly **$23.23/m³** with no discounting, or a higher value with discounting, just to break even at that annual delivery. **This is a stress test, not a product quote.** Water value depends on water rights, scarcity, volumetric costs, applicable rates and ability to reduce actual purchases. If the only avoided cost is negligible, dollar savings may be negligible.

A 1,000 L roof tank supplies just **2.456 m³ of hypothetical summer demand** in 2024. Without a quantified high-value shortage, storage alone is unlikely to be our flagship agricultural product here.

## Engineering recommendation
**P0**: Build Evercraft Aqua Water Intelligence as a source-linked measurement and *diagnostic* service, not a claim that we created a new water source. Intake actual field water withdrawal, soil moisture, crop type, expected reference ET, irrigation application uniformity, daily pump/energy and priced marginal costs. Separate observation, model, owner authorization and regulatory approval. Compare low-cost leak fixes, irrigation scheduling and nozzle/drip maintenance before purchase of harvesting/condensing equipment. The user must be able to see why a recommendation was made and what remains unknown.

**P1**: Pair controlled greenhouse condensation research with safe water accounting and actual energy and crop-health measurements. Define control vs intervention and characterize external withdrawals, not just condensate mass. Require independent engineering review and water-quality approval before returning condensate to irrigation.

**P2**: Siting and hardware design across other climates, only after several quality-screened years and actual host-site demand data. Keep evapotranspiration sensitivity and rights/catchment limits explicit. Never extrapolate one Yakima year to global economics.

### Minimum real-world pilot measurement protocol
1. An authorized operator supplies the actual operating environment (non-confidential summary) and agrees to a baseline assessment; never imply a partner is secured.
2. Instrument measured freshwater inlet volume, irrigation delivery, off-spec discharge, greenhouse relative humidity/dewpoint/temperature, condensate **isolated** volume, measured electricity whole-system, and crop-stress indicator. Use time-synced calibrated sensors with IDs, units, meter uncertainties, QA flags and maintenance logs.
3. Set a comparable/control condition before recovery hardware experiments. Randomize or counterbalance operations where scientifically possible; work with agricultural researcher on repeated-day autocorrelation.
4. Pre-register calculation: external withdrawal reduction, incremental electrical kWh, crop/quality changes, uncertainty, capex/OPEX and legal end-use gating. Count recycled water once. A mere baseline–treatment difference isn't causality.
5. If independently reviewed water quality, water rights, plumbing safety, or site agreements are missing, HOLD physical return/distribution. No autonomous pumps/valves.

### Sources and code lineage
- Published original daily NOAA Daily Summaries CSV with attributes: `research/waterfarm_001/noaa/data_rc05/2024_yakima_prcp_ncei_attributed.csv`, from NCEI Access Data Service, station USW00024243, source and metrics logged in RC05.
- NOAA documentation: https://www.ncei.noaa.gov/support/access-data-service-api-user-documentation
- WSU irrigation-scheduling science: https://rex.libraries.wsu.edu/esploro/outputs/report/Using-an-atmometer-for-irrigation-scheduling/99900623600701842
- WA Ecology rooftop collection policy: https://ecology.wa.gov/water-shorelines/water-supply/water-recovery-solutions/rainwater-collection
- Every model output says scenario; no claims of water-safe agricultural reuse or developed technology.

### Verification
`PYTHONPATH=aqua_rc04/science:aqua_rc04/noaa:aqua_rc04/film:aqua_rc04/tests python -m unittest discover -s aqua_rc04/tests -p 'test_*.py' -q` = 58 tests, `cd aqua_rc05 && python -m unittest test_noaa_api_screen.py -q` = 8 tests, and `python -m unittest test_seasonal_screen.py -q` = 14 tests. Total **80 tests passing locally**, distributed across archived component environments; no remote CI verification. All files reviewed as a **draft research branch** before merging; independent science review outstanding.
