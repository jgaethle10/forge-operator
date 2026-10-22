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
- Washington **statewide**, seasonally adjusted September unemployment (4.8%) and preliminary payroll movement (-15,400), from ESD's October 14 release;
- **separately**, Yakima County August unemployment rate (5.5%) and nonfarm payroll employment (89,100). No September county figure is inferred from statewide data.

## Verified CPI snapshot (2026-10-14)

BLS September 2026 CPI: all-items +3.7% over twelve months; gasoline +9.1% seasonally adjusted in September and +34.2% year over year. The overall monthly CPI increase was +0.6%. National figures only.
Official archived release: https://www.bls.gov/news.release/archives/cpi_10142026.htm

Yakima's August 2026 unemployment reading is 5.5%; do not relabel it as September:
https://esd.wa.gov/jobs-and-training/labor-market-information/reports-and-research/labor-market-county-profiles/yakima-county-profile

Use date-specific evidence snapshots and revision records. A hard-coded snapshot is **not** a live feed.

## Actionable but not fabricated: manually reviewed assistance doors

`economic-pressure-review-referrals.json` contains a **reviewed, time-bounded informational seed**, currently three official provider pages for Basic Food, LIHEAP and Washington 211. An independent person must confirm eligibility and program availability. No amounts, awards, enrollments, current provider capacity or automatic collections are claimed. The original October 14 seed expired October 21 and was not silently extended. On October 21 its three official landing pages were manually reverified and reissued as a new, dated review seed, expiring October 28 (2026-10-29T00:00Z). Its cost and eligibility claims remain zero/unknown. Note that DSHS's 2026 SNAP/LIHEAP utility-deduction changes may affect some households, and must be considered before presenting the combination as financial relief. Review the source guidance: https://www.dshs.wa.gov/sites/default/files/SUA_LIHEAP_Final_Version.pdf. The engine continues to mark other local categories as degraded instead of imagining prices or job vacancies.

A reproducible read-only proof, now with seven explicitly reviewed national/state/county context signals, can be produced using `node systemia/household-fabric/economic-pressure-proof.mjs`. Its benefit cards are **not** proof an application was filed or that the household saved money. Monetary value remains zero until attributable, verified evidence exists. The 0 net value is a deliberate unknown, not a judgment about a program's usefulness.

## October 21 review and time semantics

- The proof runner uses the actual evaluation time by default, never a frozen October 14 date. Historical examples must pass an explicit date.
- Household Fabric now rejects observations dated in the future; expiry removes stale referrals, and missing collection coverage remains degraded.
- Primary assistance sources: https://www.dshs.wa.gov/family-food-and-housing-services/food-assistance/basic-food-benefits ; https://www.commerce.wa.gov/community-opportunities/liheap/ ; https://search.wa211.org/ . These are **information and application directions**, not proofs of capacity, funding, or approvals.
- Source-specific Yakima September county data was scheduled for October 20, but the ESD county-profile page still exposes the August series at the time of this review. Do not manufacture a September county rate. Recheck county releases before using a more current number.

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
