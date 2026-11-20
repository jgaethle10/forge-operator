# FindMyPart x AAAR | Civilian CNC memory constraint: Siemens SINUMERIK 810D

**Evidence checked:** November 19, 2026. **Case status:** PUBLIC DOCUMENTS / NO CUSTOMER / NO QUOTE / NO EQUIPMENT TEST.  
**Canonical source:** Siemens AG, *SINUMERIK 810D Equipment Manual Configuration CCU (PHC)*, 03/2006 edition, §4.7, **printed page 4-76**, [official Siemens hosted PDF](https://cache.industry.siemens.com/dl/files/676/28515676/att_72939/v1/PHC_0306_en.pdf?download=true). PDF physically inspected at page index 75.

## Verified published constraints, not a substitute recommendation
Siemens states that the SINUMERIK 810D CCU standard PC-card plug-in accepts Type II flash cards **up to 8 MB**. The manual recommends Siemens PC cards. It specifies these cards' uses for software and commissioning; a card with system software is to remain inserted while operating; removal/insertion with power applied risks data loss. These facts are limited to the manual's **2006 810D CCU scope**; do not apply them automatically to another product, revision, software generation or customer's machine.

Two *public catalog leads* in the [AAAR supplier ledger](supplier-candidates-2026-11-19.json) describe **256 MB** industrial Type II PCMCIA ATA products:
1. PCcardsDirect `PCDATA256MBI`: https://www.pccardsdirect.com/products/industrial-pcmcia-ata-cards.php
2. California PC FLASH `FPCI-256MB-2162TM2`: https://www.californiapc.com/Industrial-Flash-Memory/Industrial-Grade-PCMCIA-Tough-Metal-Series-2/

Both **exceed** the published 8 MB ceiling for the Siemens reference case. That does **not** prove how an actual machine will behave. It means these catalog parts must not be pitched as suitable replacements without separate OEM/qualified expert validation. A generic 256 MB product search cannot be turned into a fitment assurance.

## Adjacent obsolescence signal, not a buyer lead
A specialty industrial parts distributor catalog identifies Siemens SINUMERIK PCMCIA card `6FC5247-0AA11-0AA3` as **discontinued by manufacturer**: https://www.plchardware.com/Products/SM-6FC5247-0AA11-0AA3.aspx
That establishes a seller's public listing status, not a verified Siemens lifecycle notice for an exact installed machine, stock condition, a live repair order, or substitute suitability. Keep secondary distributor status below direct OEM evidence.

## Created reusable evidence guard
- `civilian-cnc-reference-2026-11-19.json`: non-personal, explicitly illustrative source-linked input with the Siemens limit and two researched 256MB catalog cards.
- `civilian-cnc-memory-check.mjs`: pure offline evaluator that flags `EXCEEDS_EQUIPMENT_MANUAL_CAPACITY_CEILING`; never approves fitment, safety, order, quote or government response.
- `civilian-cnc-memory-check.test.mjs`: tests for out-of-range hold, within-range still unknown, missing data, untrusted URL and no purchase authority.
- `public/findmypart/sample-report/industrial-memory/index.html`: updated source-backed customer preview warning that 256 MB isn't automatically an upgrade. The source is in a **draft PR**, not a verified deployed URL.

**Authoring check:** five in-process logical scenarios passed. Local standalone Node test-runner execution and CI for these three new files are **not yet evidenced**.

## Commercial decision
Potential customer class: independent CNC shops, industrial maintenance providers and owners with discontinued controller media. **Not a currently verified lead**. Reuse encrypted FindMyPart intake, with consent, to establish equipment model/revision/firmware before sourcing. Offer a source-backed, limited **research report**, not a guaranteed component replacement. The existing FindMyPart general quick/deep/rescue pricing is already source-controlled; any claim this specific niche is ready for paid fulfillment still requires an actual reviewed example, owner capacity, payment and delivery QA.

## Stop conditions
- No inferred compatibility across equipment or capacity; no hot swap instruction.
- No cloning proprietary OEM media, firmware duplication, bypass of machine locks, or physical controller access without appropriate rights and expert procedures.
- No defense host guidance: this is civilian research independent of the F-22 market notice.
- No customer info, Gmail message bodies, inventory commitments, supplier quotes, warranty guarantees or aircraft integration claims in public code.
- No outreach or paid fulfillment from this document. Separate authorization and evidence receipts apply.

**Review context:** [AAAR PR #2309](https://github.com/jgaethle10/forge-operator/pull/2309), [AAAR #2285](https://github.com/jgaethle10/forge-operator/issues/2285), [FindMyPart launch playbook](https://github.com/jgaethle10/forge-operator/blob/main/docs/launch/findmypart/LAUNCH_PLAYBOOK.md).
