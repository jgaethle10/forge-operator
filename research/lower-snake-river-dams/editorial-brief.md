# Lower Snake River Dams: what the 2026 transportation numbers do and do not prove
**Evercraft Journal / Evermaps / TOWI research packet | 21 October 2026 | DRAFT, NOT APPROVED FOR PUBLICATION**

## Editorial lead

A Facebook post describes the price of breaching four federal dams on Washington's lower Snake River as more than $5 billion for transport replacements, roughly $300 million more in annual highway maintenance, and another quarter-million tons of carbon emissions. The first figure reflects the scale of infrastructure challenges, but the second misidentifies total annual shipping expenses as additional highway maintenance, and the third reverses the comparison for some rail-centered alternatives. The real choice involves transportation, power reliability, tribal and fishery interests, irrigation, flood-adjacent facilities, freight competition, and who bears the costs.

This packet is **decision support, not advocacy for either breach or retention**. WSDOT says its study is neutral and does not address the entire dam system's costs and benefits. Its final transportation report is expected in December 2026. Numbers below are from reporting on the October public presentations, **not directly transcribed from an authenticated WSDOT final scenario table**.

## The six-scenario comparison

The baseline is **Scenario 3, projected 2045 transportation with the dams in place**, reported at $256.8 million in annual shipping cost and 253,000 tons of reported annual transportation GHG emissions. Calling this verified "today's shipping bill" would be inaccurate.

| WSDOT scenario | Annual shipping, $M | Change vs. 2045 baseline | Reported transport GHG, tons/year* | Change vs. baseline |
|---|---:|---:|---:|---:|
| 3: keep dams, reference | 256.8 | 0 | 253,000 | 0 |
| 4: breach, no transport upgrade | 331.9 | +75.1 | 394,000 | +141,000 |
| 5: river-parallel rail and terminals | 322.9 | +66.1 | 224,000 | -29,000 |
| 6: short-line rail | 316.4 | +59.6 | 239,000 | -14,000 |
| 7: comprehensive rail | 310.4 | +53.6 | 231,000 | -22,000 |
| 8: Class I rail investment | 322.7 | +65.9 | 205,000 | -48,000 |

**Critical interpretive control:** *GHG tons are copied from October reporting; the original WSDOT table is required to verify whether these are US short tons or metric tons, and CO₂ alone or CO₂e.* These emissions are modeled transport-system emissions, **not** the overall emissions impact after replacing hydropower, transmission services, and construction. Comparing the modeled transport figures with electricity emissions from a separate model without harmonizing years and assumptions would mislead readers.

## Capital costs: don't add numbers twice

The October coverage gives capital investment ranges around $4–5.03B for Scenario 5, $4.4–5.9B for Scenario 6, $4.4–5.8B for Scenario 7, and $3.8–5B for Scenario 8. A second local report gives $4–5.3B for Scenario 5. That disagreement is logged rather than silently resolved.

Scenario 4's $3.8–5.1B is labeled transportation capital by one outlet, but described as road maintenance costs through 2045 by another. A further $1.7–2.2B in "repair-in-kind" is described as common across breach scenarios. **The available articles do not establish whether these costs overlap the scenario totals. Do not stack them to claim a grand total.** Secure the original WSDOT presentation tables and cost basis before publication.

Annual **shipping/logistics expenditures** of $310.4–322.9M for the rail options are not new annual highway maintenance bills. The increment relative to the modeled with-dams reference is $53.6–66.1M/year. It is also premature to treat a modeled alternative as operationally bankable without checking rail access and commercial rates.

## Other decision layers that transportation alone cannot settle

- **Hydropower and reliability:** A 2025 PNNL study found measurable ramping, reserves, voltage and frequency functions from the dams. Washington Commerce launched a separate replacement-energy study in 2026. A transport-only reported GHG comparison cannot answer grid replacement costs or overall emissions.
- **Water supply:** The Washington Ecology and U.S. Bureau of Reclamation work considers replacement irrigation, municipal and industrial withdrawals if reservoir levels fall. Water delivery infrastructure and pumping can require expensive adaptation. Breach does not mean the flowing Snake River ceases to exist.
- **Fish ecology:** NOAA describes salmon and steelhead conservation needs and how impoundments affect migration, temperature and habitat. Fish ladders address some passage needs but do not recreate a free-flowing river. The 2020 federal EIS evaluated modeled fish benefits and significant trade-offs; neither ladder presence nor early counts on a different river proves a Snake River outcome.
- **Flood protection distinction:** The U.S. Army Corps describes Lower Granite's operating purposes as hydropower, navigation, fish and wildlife, recreation, water quality and irrigation; it also describes **separate levees** around Lewiston that protect against flooding. Future river-stage and levee impacts need engineering review. Avoid both "all four dams are flood-control reservoirs" and "flood consequences are impossible."
- **People and treaty obligations:** Include affected tribal governments and treaty fishing rights, growers, farmworkers, shippers, port operators, local governments, ratepayers, utilities and fishery-dependent communities. These are not simply costs that can be reduced to a statewide average.

## Competing interpretations to keep visible

1. **Farm and freight concern:** Port of Lewiston management disputes whether modeled rail scenarios reflect real freight competition and growers' ability to afford higher rates.
2. **River restoration concern:** Idaho Rivers United contends the alternatives show physical replacement is feasible but that farmers need explicit price or transition support.
3. **Agencies' limited claims:** WSDOT has not selected a preferred transportation scenario, and its report is not a federal dam-breaching authorization.

These are stakeholder perspectives, not evidence that either economic feasibility or biological recovery has already been proven.

## New primary-source audit: August 2026 WSDOT progress report

WSDOT's August 2026 report is an **actual primary source**, but it is about the modeling process rather than the final October scenario matrix. It documents **more than 100 Total Logistics Cost model runs** and ongoing refinement of rail tariffs, terminal capacities and Scenario 8. It confirms that the October scenario snapshot must not be mixed with earlier 2026 work-in-progress scenario results without checking model run date, calibration and price assumptions.

- Primary agency progress report: https://app.leg.wa.gov/ReportsToTheLegislature/Home/GetPDF?fileName=TransportationStudy-Report-LowerSnakeRiverDams-August2026_b9c25b16-ce5f-4a96-9f0c-16f50395227e.pdf
- March 2026 WSTC preliminary presentation (historical, **not** an October final table; PDF not visually checked in this research pass): https://wstc.wa.gov/wp-content/uploads/2026/03/2026-03-24-BP7-LowerSnakeRiverDams-TransportationStudy.pdf

**Current evidence state:** the WSDOT portal and August update establish study scope/process. The six October numerical cases are taken from contemporary news accounts. A source-request draft is staged in `primary-source-request-DRAFT.md` and **has not been sent**.

## Data production safeguards

- The standalone prototype at `scenario-explorer.html` includes a copy of `scenarios-2026-10-21.json` embedded at build time. It is independently viewable offline.
- `scenario-proof.test.mjs` verifies that the embedded copy agrees *exactly* with the canonical dataset, every displayed scenario is an identified 2045 case, source identifiers resolve, and modeled deltas recompute from Scenario 3.
- GitHub's isolated `Snake River research evidence checks` workflow tests the draft on changes; a passing calculation test does **not** verify the truth of the third-party numbers.
- The explicit human editorial and publication gate is still closed.

## Evercraft implementation and business fit

**Research-to-product workflow:** TOWI maintains source provenance and claim state; Evermaps overlays four dam footprints, river navigation, short-line/Class I corridors and affected ports using **verified** public geospatial data; Systemia tracks report dates, contradictory cost tables, and human reviews; Evercraft Journal publishes only after the editorial gate; Evercraft Clip receives a separate approval receipt before any social distribution.

Potential ethical commercial packages: (a) region-specific freight exposure briefs for chambers and agricultural groups, (b) transparent infrastructure scenario dashboards for local governments, (c) map-backed water/transport planning briefs for affected communities. **These are candidate services, not sales leads, contracts, or validated pricing.** Avoid public outreach purporting to represent governments or affected Tribes.

**Go/no-go release checklist:** Acquire original WSDOT October scenario tables; reconcile 5.03 vs 5.3B and the $1.7–2.2B inclusion question; verify 2045 assumptions and transport-emissions boundary; verify the ton basis and gas-equivalency convention; request knowledgeable local/Tribal perspective; rights/attribution check for graphics; editorial 10/10 and explicit human publication authorization. Keep draft out of Journal/Clip publish runners until then.

## Evidence register (as of 21 October 2026)

**Original GHG unit convention remains unverified; these are reported transport-only numbers, not a verified lifecycle assessment.**

- WSDOT study scope, budget $4M, and December 2026 target: https://wsdot.wa.gov/construction-planning/search-studies/lower-snake-river-dams-transportation-study
- Eric Barker, public-meeting scenario numbers and stakeholders, 8 Oct: https://www.spokesman.com/stories/2026/oct/08/new-study-says-grain-transportation-possible-witho/
- Whitman County Gazette, 2045 scenario identifiers, cost disagreement and repair-in-kind, 15 Oct: https://www.wcgazette.com/story/2026/10/15/news/state-releases-dam-breaching-study-results/47135.html
- PNNL 2025 grid-services evaluation: https://www.pnnl.gov/publications/lower-snake-river-dams-contribution-grid-services
- Washington Commerce replacement energy study: https://www.commerce.wa.gov/energy-policy/lower-snake-river-dam-study/
- Ecology/Bureau of Reclamation water replacement: https://ecology.wa.gov/ecologys-work-near-you/river-basins-groundwater/lower-snake-river
- NOAA rebuilding salmon and steelhead: https://www.fisheries.noaa.gov/media-release/rebuilding-salmon-and-steelhead-columbia-river-basin
- Corps Lower Granite facts and levees: https://www.nwd.usace.army.mil/Fact-Sheets/Article/3485347/lower-granite-dam-and-lake-lower-granite/

**Review state:** research candidate; not a release-ready Journal story; no public publication or external outreach authorized.
