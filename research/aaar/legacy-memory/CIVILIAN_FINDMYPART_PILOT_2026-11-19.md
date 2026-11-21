# AAAR × FindMyPart | Civilian legacy-memory sourcing pilot
**Research date:** 2026-11-19 (Pacific)  
**State:** INTERNAL PILOT DESIGN; NOT LIVE, NOT A PAID PRODUCT, NOT A QUOTED SERVICE.  
**Parent:** [AAAR issue #2285](https://github.com/jgaethle10/forge-operator/issues/2285), [supplier feasibility #2301](https://github.com/jgaethle10/forge-operator/issues/2301), [PR #2309](https://github.com/jgaethle10/forge-operator/pull/2309).

## Why a civilian pilot first
The [F-22 SAM.gov notice FA8611-27-R-F-22](https://sam.gov/workspace/contract/opp/8948e8601e964c6aba9c801eee16b1be/view) is a **sources-sought research notice**, not a purchase order. It is not a fast guaranteed revenue channel. Industrial PCMCIA / ATA and CompactFlash obsolescence is independently visible in published supplier product/EOL pages. The service opportunity is documentation, authorized sourcing and lifecycle risk reporting for owners of **non-defense, non-safety-critical legacy industrial equipment**.

Vendor catalog examples (public leads, not customer orders):
- [Fortasa industrial PCMCIA](https://www.fortasa.com/products/flash-card-series/industrial-pcmcia-card): SLC industrial card family.
- [California PC FLASH Tough Metal Series 2](https://www.californiapc.com/Industrial-Flash-Memory/Industrial-Grade-PCMCIA-Tough-Metal-Series-2/): listed 256MB PIO4 `FPCI-256MB-2162TM2` and separately marked EOL 256MB UDMA `FPCI-256MB-4162TM2`. **Different interface modes; no automatic interchangeability.**
- [PCcardsDirect industrial ATA](https://www.pccardsdirect.com/products/industrial-pcmcia-ata-cards.php): 256MB `PCDATA256MBI` catalog benchmark.
- [Synchrotech industrial card product](https://synchrotech.com/products/x-series-synchrotech-industrial-grade-pcmcia-ata-flash-pc-card): product page notes legacy component shortages and lead-time effects. Vendor marketing; not a buyer RFQ.
- [APRO legacy card EOL notice](https://www.apro-tw.com/Databank/EOL/EOL_097-xPAFC-XXXXX-0V1.pdf): an example of lifecycle change; do not infer exact fit for any buyer.

## Reuse existing Evercraft flow
**Do not create a second contact form or CRM.** The existing FindMyPart owned customer intake is implemented in `systemia/mcp/findmypart-public-inquiry.mjs`; the current read-only report's state must be checked against `docs/launch/findmypart/OWNED_LEAD_INTAKE_RUNBOOK.md`. It only accepts part description, equipment context, reply email and affirmative consent. It stores the inquiry encrypted, retains an owner-only record, and returns a human-review reference; it does **not** charge, buy parts, quote or authorize Saban agents.

**Proposed customer path (not yet proven end-to-end):**
1. Customer voluntarily enters `part_description`, `equipment_context`, `email`, `consent=true` through the existing FindMyPart owned intake.
2. Private owner review confirms part number, photo/datasheet request if customer consents, original controller/host interface, minimum capacity, form factor, removable-vs-fixed / PIO-vs-DMA assumptions, operating environment and urgency. Do not request sensitive protected equipment or defense-system information.
3. Create a **private** case with a random FMP reference; public-facing AAAR/marketing views may show only aggregate, non-identifying status.
4. Match public supplier candidates as **research leads**, not equivalent parts. Require OEM identity and technical review before suggesting substitute fitment; route any safety-critical/regulated application to appropriately qualified professionals, not an automated recommendation.
5. Return a short, sourced report: customer's stated old part, known vs unknown fields, source-linked candidate cards, product-life/EOL status, suggested next document requests, written vendor quotes if obtained, explicit unverified status, and next permitted action.
6. If an authorized partner returns an actual quote, obtain owner/customer confirmation of scope, price, delivery and legal terms, then separately use a verified payment/fulfillment flow. Do not represent a quotation as sold inventory, and do not order anything on speculation.

## Minimum deliverable
A PDF or owner-approved shareable report with these sections:
1. Inquiry reference, report date, privacy-safe equipment description and client-authorized scope.
2. Observed facts: customer-provided part markings; supplier datasheet and public date; evidence URL, publication/retrieval date.
3. Unknown / verification required: matching interface mode, capacity, voltage, timing, firmware behavior, physical dimensions, environmental ratings, prior revision compatibility.
4. Supplier candidates: exactly stated vendor/part and source link, price as **public listing** versus **signed written quote** clearly separated, authorized channel and provenance status, MOQ/lead time and EOL policy.
5. Owner/operator review, customer next step, limitations. **No guarantee of compatibility, flightworthiness, medical-device certification or regulatory approval.**

## Readiness checks and owners
| Gate | Current evidence | State |
|---|---|---|
| FindMyPart owned intake code | Existing repository module and runbook | SOURCE PRESENT; LIVE DEPLOYMENT NOT VERIFIED HERE |
| Four public supplier leads | `supplier-candidates-2026-11-19.json` in PR #2309 | PUBLIC LEADS ONLY |
| Supplier proof / chain of custody | None independently validated | HOLD |
| Manufacturer partnership / actual quote | Two individualized Gmail **drafts**, not sent; no supplier response | HOLD |
| Civilian buyer with a confirmed current purchase need | None independently verified | HOLD |
| Reviewed sample report and fulfillment owner | Design only | HOLD |
| Live checkout, settlement, repeatable delivery | No evidence in this mission | HOLD |
| F-22 compatibility and government eligibility | No test/qualification; official attachment original not cross-checked | HOLD / OUTSIDE CIVILIAN OFFER |

## Supplier discovery handoff (operator-only)
- Prior Gmail dedup search for `Fortasa`, `Delkin`, `PCcardsDirect`, `California PC FLASH` and `legacy PCMCIA`: **no matching threads at the search cut**. This is not a guarantee none exist in other inboxes.
- Two personalized outbound inquiries were **saved as unsent Gmail drafts** on November 19: one to official California PC FLASH sales address, one to the PCcardsDirect address published on its site. Each seeks current availability, legal OEM/distributor status, traceability, written quote/lead-time and potential partnering. They are **NOT SENT**. Gmail draft IDs and private message content must stay out of public repo.
- Do not bulk-email suppliers or claim partnership. Send only with founder-approved contact permissions and current verified recipient details, then record provider delivery evidence privately.

## First paid experiment, conditional
A customer may value a written sourcing/lifecycle dossier even if the supplier has no inventory. But a price, delivery time or recurring membership claim should be published **only after** a real fulfillment owner demonstrates a sample report, legal scope, customer acceptance path, provider-verified payment route and refund process. Until then this is an internal prototype, not a sale.

**Systemia:** Any real research execution, recipient contact, purchase, quote or release should pass the existing Systemia admission, privacy and evidence gates; GitHub PR ≠ deployed workflow or authorized outward action. Owned runtime only, GitHub canonical, no Base44.
