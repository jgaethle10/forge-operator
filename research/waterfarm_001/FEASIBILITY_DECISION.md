# Evercraft Aqua / WATERFARM-001
## Scientific feasibility gate v0.2 — October 25, 2026

**Evidence classification: analytical and source-backed scenarios, NOT site observations, device tests, grant awards, patent validation or partner commitments.**

### Decision for now
Keep WSU and South Yakima Conservation District Gmail introductions as **unsent drafts** until an internally reviewable pre-pilot package exists. Scientific feedback may be requested afterward, while equipment procurement, physical plumbing, water applications, field installations and claims of water savings remain independently gated.

**Near-term product thesis:** irrigation water accounting, reuse feasibility analytics and measurement validation for controlled agriculture. Rainwater can supplement; dry-climate ambient air-to-water is *not* the initial low-cost agriculture product. Closed/semi-closed greenhouse condensate recovery is a potentially valuable experiment only where humidity control is already needed.

### Reproducible inputs and sample results
The included `climate_feasibility.py` builds an optimistic monthly rain collection envelope using reported Yakima Airport 1991–2020 monthly normals (station `USW00024243`), as reproduced by a secondary NOAA-normal publisher. Official NOAA archive cross-check is still required before partner use. Source: https://historicalclimate.com/stations/yakima-air-terminal-wa-us-usw00024243 ; methodology: https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals .

**Assumptions, NOT a real farm:** 100 m² already existing-purpose roof, 80% gross collection factor, 1,000 L/day continuous baseline nonpotable demand, 365-day non-leap year. Rainfall 8.01 in per year; roof capture **16,276 L/year optimistic gross** (4.46% of 365,000 L illustrative yearly demand, *before* snow/first-flush/contamination/event timing/storage losses and prior to checking permissions). July's 0.20 in normal yields just **406 L** gross vs July's **31,000 L** demand in that scenario. Monthly climate normals do NOT establish daily rain-event timing or available tank water.

**Psychrometric test case, NOT Yakima observed humidity:** 1,000 m³ one-pass of 30°C air at 80% RH hypothetically cooled to 15°C saturation has an upper condensable vapor envelope of **11.43 L**. At 30°C/20% RH with the same coil outlet, **0 L** would condense. These are ideal-air approximations, not promises of actual system yield. A continuous greenhouse cannot remove the same vapor from an unchanged air mass repeatedly; plant transpiration, ventilation and exchange must be measured.

**Energy stress:** selected 2026 literature describes dry-condition AWH electrical use of about 0.5–1.2 kWh/L; **1,000 L** production would therefore require **500–1,200 kWh** if those rates applied. At an illustrative $0.12/kWh that's **$60–$144 in electricity** for that volume (or $60–$144/m³); no capex, treatment, labor, equipment lifetime, fans and additional auxiliary losses beyond the cited SEC accounting. The illustrative tariff is NOT a utility quote. Source: https://doi.org/10.1016/j.ecmx.2026.101928.

A 2026 research greenhouse chamber report recovered 9.55 kg over 360 h, about 76.65% of evapotranspiration under tested conditions, with mean energy use of 1.44 kWh/kg. This does not transfer automatically to Yakima crop operations and it is not an economic demonstration. Source: https://www.sciencedirect.com/science/article/pii/S1359431126007945.

### Candidate lane assessment
| Lane | Scientific plausibility | Pilot usefulness | Constraint | Initial disposition |
| --- | --- | --- | --- | --- |
| Irrigation measurement / losses / crop water accounting | Established measurement practices | High, can instrument an existing site and generate reliable baseline | Data/site access, calibration, baseline comparability | **P0: start with metering and analytical product** |
| Existing-purpose roof rain storage | Established under restricted WA rules | Small supplemental yield at Yakima precip normals | Winter/snow, event timing, legal same-property/roof purpose, tanks & quality | **P1: simulate and validate** |
| Closed-greenhouse condensate recapture | Demonstrated in controlled papers | Interesting combined humidity + recirculation co-benefit | Energy, crop health, sterilization and treatment | **P1: bench-test only after A/B protocol** |
| Outdoor direct atmospheric condenser | Feasible technically | Unfavorable for cheap agricultural volume in arid climate | kWh/L and air moisture limits | **HOLD as first agricultural market** |
| Reclaimed wastewater / brackish desalination | Technically established | May scale at specific sites | Source rights, permits, quality, waste concentrate and qualified engineering | **Later partner-integrated option** |

### 3-stage engineering plan, no unapproved external action
1. **Digital screen (now):** audited calculations, provenance-rich normal values, uncertainty flags, sensitivity to roof area/efficiency/volume/RH/electricity, original sources. Pre-register alternate baselines: meter-only conservation, leak repair, irrigation scheduling, retention/standard tank, ventilation/dehumidification and approved reuse.
2. **Safe bench test:** qualified site and hazard review, calibration kit, 14+ days preliminary logged control/challenge observations. Compare conventional venting/humidity management against a recovery configuration at matched crop/thermal conditions. Collect condensate in isolated, labeled vessels. Recovered liters are *not* proven displaced demand until an authorized safe end-use trial measures the counterfactual.
3. **Readiness for research partner:** public-safe 2-page data sheet, raw data schema, independently rerunnable code/tests, approximate BOM with actual vendor quotes, stop conditions, end-use and water-right review, IP/data protocol. Ask research specialists to critique and improve design, not to endorse a claimed breakthrough.

### Proof gates for asking someone to commit resources
- [x] Annual rain volume order of magnitude and summer seasonality computed as an optimistic screen.
- [x] Moisture removal and energy-cost sensitivities modeled without using false measured readings.
- [x] Local tests for equations and invalid inputs, including physical saturation case (10 tests in v0.2).
- [ ] Verify the monthly precipitation time series against authoritative NOAA station CSV and attach source hash/record.
- [ ] Obtain hourly local ambient weather data and site-specific enclosed greenhouse environment readings (unknown now).
- [ ] Determine actual end use, permitted collection, water treatment and host-specific demand.
- [ ] Run sensitivity and uncertainty envelopes including first-flush, snow, event timing and storage sizes; monthly rain is insufficient to size hardware.
- [ ] Design matched A/B experiment and have independent agricultural engineer review it.
- [ ] Bill of materials, instrument datasheets, calibration logs, hazard review and vendor/contractor quotes.
- [ ] Initial field/crop data and cost comparison against cheapest compliant alternative.
- [ ] Review and approve outreach, privacy, IP and data-sharing scope.

### Safety
WA Ecology roof collection conditions include an existing structure with independent purpose and same-property use; source: https://ecology.wa.gov/water-shorelines/water-supply/water-recovery-solutions/rainwater-collection. This is not a source of blanket legal permission. Never place unverified condensation or nonpotable reclaimed water into a crop/potable distribution line. Engage accredited analytical laboratories, relevant qualified engineer, state/local regulators and agricultural specialists before reuse. No remotely actuated production equipment.

### Commercial hypothesis
What we may sell first is **water measurement and feasibility intelligence**; what we might engineer with partners later is the hardware-integrated WaterFarm. Preserve incumbent comparisons, publish negative findings, and don't assume water pricing, irrigation rights or greenhouse economics without a real customer site's data. No first-customer, yield, or revenue claim without receipts.
