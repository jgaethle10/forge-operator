# Economic Pressure Atlas × Systemia Household Fabric bridge

**Status:** source contract and tests only. This does not activate a collector, publish a website, generate monetary savings, admit a Systemia mission, or establish a public checkout.

## Why this is in Forge

The existing `systemia/household-fabric` engine ranks local household opportunities by actual net value, evidence, freshness, eligible audience, and friction. The Economic Pressure Atlas hosted in the separate Income War Map app explains broader economic pressure and points to official assistance.

This bridge joins **context** and **actions** without pretending one is the other. A national CPI measurement must never be emitted as a fresh Yakima gasoline price, estimated household saving, offer, eligibility determination or paid placement.

## Inputs and outputs

- `normalizeEconomicPressureSignal(raw, now)` accepts only **independently reviewed and pinned** metric, observed period, exact primary URL, geography, unit and numeric value combinations in `economic-pressure-reviewed-snapshots.json`. A link to an official domain is not evidence by itself. BLS release times are pinned. Yakima ESD currently supplies month-level publication dating, so the bridge does not invent an exact release timestamp.
- For a new data release: check the original authoritative report, add a reviewed immutable snapshot with its date precision, add a factual test, run CI, and obtain independent review. This static allowlist is deliberately *not* an automatic CPI pipeline.
- `buildEconomicPressureHouseholdView({signals, ledger, sourceRegistry, geography, now, householdOptions})` returns source-labeled macro/local measurements alongside the existing `buildHouseholdToday()` surface. It **does not** boost rankings, mint opportunities or claim a live source collector.

The pilot recognizes:
- U.S. CPI all-items annual, gasoline monthly and annual readings from BLS;
- Yakima County unemployment rate and nonfarm payroll employment from Washington ESD.

## Verified CPI snapshot (2026-10-14)

BLS September 2026 CPI: all-items +3.7% over twelve months; gasoline +9.1% seasonally adjusted in September and +34.2% year over year. The overall monthly CPI increase was +0.6%. National figures only.
Official archived release: https://www.bls.gov/news.release/archives/cpi_10142026.htm

Yakima's August 2026 unemployment reading is 5.5%; do not relabel it as September:
https://esd.wa.gov/jobs-and-training/labor-market-information/reports-and-research/labor-market-county-profiles/yakima-county-profile

Use date-specific evidence snapshots and revision records. A hard-coded snapshot is **not** a live feed.

## Actionable but not fabricated: manually reviewed assistance doors

`economic-pressure-review-referrals.json` contains a **reviewed, time-bounded informational seed**, currently three official provider pages for Basic Food, LIHEAP and Washington 211. An independent person must confirm eligibility and program availability. No amounts, awards, enrollments, current provider capacity or automatic collections are claimed. The seed expires October 21, 2026 and will drop out of the Household Fabric results unless reviewed and updated. The engine continues to mark other local categories as degraded instead of imagining prices or job vacancies.

A reproducible read-only proof can be produced using `node systemia/household-fabric/economic-pressure-proof.mjs`. Its benefit cards are **not** proof an application was filed or that the household saved money. Monetary value remains zero until attributable, verified evidence exists. The 0 net value is a deliberate unknown, not a judgment about a program's usefulness.

## Acceptance gates

1. `node --test systemia/household-fabric/economic-pressure-bridge.test.mjs` passes, including no future release, no forged local CPI, no savings generated from macro statistics, no ranking change from CPI, and truthful degraded coverage.
2. Existing Household Fabric tests continue to pass.
3. Source provenance and individual program links checked by independent review.
4. Systemia signed admission and deduplication, owned app release gate, independently opened public URL and mobile behavior verified before any `live` claim.
5. Do not add to public machine-discovery product catalog or drive traffic until the source application is genuinely accessible.
6. No personal hardship profiling, selling financial inputs, or automatic applications to assistance programs.

## Ownership boundary

Host source application: Base44 app `6a2f34f732bb19748527357c`, route `/economic-pressure`, code in that application's source, not copied into Forge. Use an explicitly governed migration path to Evercraft-owned deployment; this bridge is shared **data contract** only.
Systemia candidate mission: `evercraft-economic-pressure-atlas-yakima-20261012`; existence of a candidate record is not canonical admission.
