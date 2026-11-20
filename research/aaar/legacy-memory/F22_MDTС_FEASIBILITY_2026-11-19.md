# AAAR | F-22 mDTC legacy-memory supply feasibility
**Evidence cut:** 2026-11-19 (America/Los_Angeles)  
**Status:** PUBLIC RESEARCH ONLY / NOT QUALIFIED / NOT SUBMITTED  
**Canonical mission:** [AAAR #2285](https://github.com/jgaethle10/forge-operator/issues/2285) | [F-22 supplier feasibility #2301](https://github.com/jgaethle10/forge-operator/issues/2301) | [Aviation radar #2302](https://github.com/jgaethle10/forge-operator/issues/2302)

## Decision in one paragraph
**Research a partner-led memory-card supply and provenance service; do not launch an F-22 product or purchase parts yet.** Existing industrial suppliers advertise the requested form factors. Evercraft's plausible near-term role is qualified distribution, quality documentation, legitimate partner coordination, and broader civilian legacy-storage lifecycle services. Semiconductor fabrication or an original memory controller is not necessary to explore the notice. **No candidate has been tested in government-furnished host equipment; neither a product nor Evercraft is approved, certified, awarded, or contracted.**

## Opportunity and source distinction
- **Official SAM notice:** [FA8611-27-R-F-22](https://sam.gov/workspace/contract/opp/8948e8601e964c6aba9c801eee16b1be/view), published **2026-11-16**, source-sought notice for F-22 Next-Generation micro-Data Transfer Cartridge (mDTC). Public SAM search metadata corroborates the notice title, attachment, and minimum capacity/host-read-write requirement.
- **Government attachment transcription (secondary host, review against original before use):** [F-22 mDTC SSN (RM).pdf textual rendering](https://govtribe.com/file/government-file/fa861127rf22-f-22-mdtc-ssn-rm-dot-pdf). This transcribed document describes the 16 information requests and response instructions. The authoritative attachment is the public PDF on SAM.gov; a line-by-line official-PDF comparison has **NOT** been completed.
- **Deadline as transcribed:** **2026-12-01 13:00 EST / 10:00 PST**. Response length <=12 single-sided letter pages, Adobe Acrobat PDF, font >=10 pt, plus separate company information. Unclassified response only. Do **not** confuse with a funded solicitation, contract, or purchase order.
- **Public functional scope only:** PC Standard 95 Type II flash ATA card *or* CompactFlash card with passive CF-to-PCMCIA Type II adapter; >=256 MB; government-furnished host must read/write. Any host-specific behavior, F-22 integration, fleet performance, and qualification are **unknown** and out of scope for internal engineering.
- **Important:** Notice says the Government does not currently plan an award; responding does not guarantee later procurement. It encourages small businesses but requires demonstrable supply ability. Only U.S. companies considered for award (as written). Do not invent eligibility or company registrations.

## Supplier discovery, not acceptance
| Candidate | Publicly observable supply category | Key source | What remains unknown |
|---|---|---|---|
| Fortasa Memory Systems | Self-described US manufacturer; industrial PCMCIA Type II, SLC product family; public page says 128 MB to 32 GB in overview and 128 MB to 16 GB in specification section | https://www.fortasa.com/products/flash-card-series/industrial-pcmcia-card | Exact currently orderable part/revision, flash origins, legal supply authorization, quotes, lead times, long-term policy, host compatibility and F-22 suitability |
| Delkin Devices | Says it designs/builds industrial CompactFlash in Poway, CA; controlled-BOM and lifecycle-oriented product pages | https://www.delkin.com/products/industrial-cf/ ; https://www.delkin.com/products/industrial-cf/c600/ | Which capacity/part currently available, component origin, passive-adapter package, host compatibility, export/contract suitability and partnership |
| PCcardsDirect | Lists 256 MB industrial-temperature Type II PC ATA card PCDATA256MBI at **US$105.44 posted retail** at evidence cut | https://www.pccardsdirect.com/products/industrial-pcmcia-ata-cards.php | Actual stock/quote validity, who manufactures silicon/finished card, authorized channel, provenance, acceptance testing, warranty and qualification |

Published marketing claims and price listings are *leads*, not audited evidence. Supplier claims of “US manufacturer”/“built in USA” do not resolve country of origin for each part. A retailer listing is not a firm commercial quote, and published price is not margin.

## 16-information-area response readiness (from secondary attachment transcription)
**All entries below = UNKNOWN for Evercraft.** Evidence would need to be gathered from a legally authorized, documented partner and independently reviewed before any response.
| # | Information needed (paraphrased) | Required proof / owner |
|---|---|---|
| 01 | Original product and component makers | Signed OEM/OCM provenance or authorized-channel documents; supply/quality |
| 02 | Part identity, revision, size, type, firmware | Current controlled datasheet plus exact purchasable part, engineering/quality |
| 03 | Factory lot and production dating | OEM manufacturing trace, quality |
| 04 | Each component's country of origin and assembly site | Manufacturer origin declaration, legal/quality |
| 05 | Serial identities/ranges when used | Traceable serial records, quality |
| 06 | Chain of custody to offered inventory | Original invoices and authorized transfers, supply/quality |
| 07 | Counterfeit-avoidance and receiving inspections | Documented inspection and disposition system, quality |
| 08 | Verified per-unit costs | Dated written quotes, purchasing |
| 09 | Datasheet and requirements mapping | Reviewed technical evidence, engineering |
| 10 | Optional factory formatting preference | Manufacturer statement and review-only sample evidence; no live hosts |
| 11 | Published temperature specifications | Controlled datasheet, engineering |
| 12 | Lead time commitments | OEM/distributor written confirmation, purchasing |
| 13 | Minimum order requirements | Written vendor terms, purchasing |
| 14 | Expected product life/end-of-production | OEM forecast, lifecycle |
| 15 | Product-change and last-time-buy arrangements | Written lifecycle/notification policy, lifecycle |
| 16 | Warranty and return arrangements | Written manufacturer or authorized-supplier warranty, purchasing |

Also verify separately: company legal identity, current SAM registration status, UEI/CAGE/DUNS instructions in original notice, NAICS 336411 coverage, ownership, actual employees and any claimed socioeconomic certification. **Do not self-certify an unverified status.** The attachment's mention of DUNS should be reconciled with current official registration practice; do not make up an identifier.

## Three staged business models
**A. Authorized distribution / partner-led supply** (first): verify OEM authorization, current products, chain-of-custody support, supply pricing and customer requirements. Lowest manufacturing exposure but smaller product margin and no automatic F-22 qualification.

**B. Evercraft-branded documented industrial-memory integration** (later): contract with a qualified manufacturer or assembler to provide genuine documented product + lifecycle/QA service. Branding is *not* authorization to change maker identifiers or represent used electronics as new. Need written rights, retained original provenance, contractual QA obligations and independent validation.

**C. New card/controller/silicon program** (research only): requires expert electronics engineering, design rights, fabrication partners, extensive validation, long-term economics. No case yet for owning a wafer fab; defer pending verified demand and capital.

**Civilian adjacent service** (potential fastest sale): industrial machinery, legacy CNC/medical imaging/field instrumentation maintainers often face aging storage. Offer documentation, authorized sourcing, and lifecycle reports, without representing a component as qualified for any safety-critical use.

## Qualification and legal boundaries
- Study [DFARS 252.246-7008](https://www.acquisition.gov/dfars/252.246-7008-sources-electronic-parts.) and [252.246-7007](https://www.acquisition.gov/dfars/252.246-7007-contractor-counterfeit-electronic-part-detection-and-avoidance-system.) as **potentially applicable requirements to evaluate**; do not claim every clause automatically applies to this source-sought notice.
- Preserve provenance, original manufacturer identity, product-change notices and honest condition; never relabel salvaged goods as new.
- Seek proper contracts/regulatory/export-control advice before any defense supply transaction; no ITAR or flight-qualification expertise claimed.
- **Never** use live government host/aircraft equipment, access nonpublic specifications, reverse engineer F-22 system interfaces, ship parts, create a government response, contact suppliers or spend money solely on this mission without separate authorized review.
- GitHub research commit/issue is **not** a Systemia admission, deployed AAAR functionality, or a supplier relationship.

## Next gates (all FAIL / UNVERIFIED as of 2026-11-19)
1. Confirm current authoritative SAM notice + actual PDF attachment, revisions, deadline, classification and permitted response route.
2. Public-only supplier dossier: exact candidate product family, direct OEM and distributor identity; no invented quotes or acceptance.
3. Systemia admission for bounded vendor research; check existing CRM before any individually approved outreach.
4. Gather written manufacturer authorization, complete origin/traceability documents, actual prices/lead time/MOQ and lifecycle evidence.
5. Professional compliance, QA and supply review; verify Evercraft SAM/UEI/CAGE eligibility.
6. Founder go/no-go on a partner-backed *truthful* source-sought response, if legitimate; otherwise record no-submission with rationale.
7. Generalize the civilian legacy-parts dossier into a sellable but **non-certifying** FindMyPart / AAAR reporting service only after verifying an owner, price, and deliverability.

**Acceptance artifact:** evidence-backed partner-led business decision and a reusable legacy-parts supplier qualification ledger; not an F-22-equivalent product prototype.

## Evidence register
- [SAM.gov official notice](https://sam.gov/workspace/contract/opp/8948e8601e964c6aba9c801eee16b1be/view) — official notice metadata; public attachment available; official PDF not independently reproduced here.
- [GovTribe attachment transcription](https://govtribe.com/file/government-file/fa861127rf22-f-22-mdtc-ssn-rm-dot-pdf) — secondary extracted document text, retrieved 2026-11-19.
- [Fortasa PCMCIA](https://www.fortasa.com/products/flash-card-series/industrial-pcmcia-card) — manufacturer marketing/technical claims, retrieved 2026-11-19.
- [Delkin industrial CF](https://www.delkin.com/products/industrial-cf/) — manufacturer claims, retrieved 2026-11-19.
- [PCcardsDirect PCMCIA](https://www.pccardsdirect.com/products/industrial-pcmcia-ata-cards.php) — retailer inventory/price claims, retrieved 2026-11-19.
- [DFARS 252.246-7008](https://www.acquisition.gov/dfars/252.246-7008-sources-electronic-parts.) — government regulatory reference, retrieved 2026-11-19.
