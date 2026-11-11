# Evercraft EV Opportunity Qualification v0.1

**Status: independent offline research prototype. NOT a commercial release, deployment or authorization to use historical disputed assets.**

This new Systemia-adjacent module implements the beginning of an EV project opportunity-to-delivery pipeline:

Public notice or prospect => separately reviewed evidence => deadline check => site gaps => conceptual work scope => human QA => authorized proposal => contract => verified payment and fulfillment.

Only the first five internal stages are implemented. The following are **not** implemented: live source harvesting, mapping or CAD generation, permissioned outreach, payment integration, contracts, site engineering, automatic deployment or customer deliverables.

## Modules

- systemia/ev-opportunity/engine.mjs: offline candidate triage, source and time-zone checks, rights/lineage holds, deduplication, internal-only evidence-preview specification.
- systemia/ev-opportunity/concept-plan-qa.mjs: declared site-plan metadata checks for address and parcel consistency, imagery provenance and reuse rights, modeling disclosures, conceptual sheets, utility evidence, visual QA and technical QA.

No legacy EV application, prior customer record, third-party hosted runtime, or old product branding is imported by either module.

## Tests

Run the isolated proofs from repository root:

    node --test tests/ev-opportunity-engine.test.mjs tests/ev-concept-plan-qa.test.mjs

18 synthetic tests passed locally at authoring time. This does not certify hosted CI, real-world site geometry, source rights, engineering approval or production readiness.

## Operating rules

1. Independent source rights must be established outside this tool. Source-rights and authorization fields are input declarations, not cryptographic legal evidence.
2. Dates must include explicit UTC offsets; unverified dates never become urgent deadlines and expired opportunities are held.
3. Missing utility capacity, existing charger competition, parcels, parking fit and accessibility stay unknown. A score measures evidence completeness, not feasibility, funding certainty, likelihood of award or ROI.
4. Grant eligibility is not project revenue, and an available procurement is not an Evercraft contract.
5. All concepts remain preliminary, NOT FOR CONSTRUCTION. A verified file hash does not replace raster/image inspection, site survey, licensed engineer/electrical contractor review or interconnection approval.
6. Protected customer material, contested inputs, uncleared brand/assets and conflicting candidate records are held rather than silently reused.
7. No emitted result authorizes publication, customer contact, checkout, payment, permitting or construction. Even REVIEW_READY means internal metadata review only.
8. Historical design sets are reference-only pending a component-level rights assessment. Preserve the originals and avoid copying customer-specific content.

## Next gates

- Independently sourced live intake with source snapshot, URL, observation vintage, commercial-use rights and explicit target buyer.
- Country and locality-aware parcel, EV charger inventory, zoning, accessibility, traffic, tariffs and utility verification.
- New Evercraft conceptual-sheet renderer with coordinate/parcel geometry lineage and independent visual acceptance.
- Buyer qualification and lawful contracting, separately approved outbound contact, verified Evercraft Payments settlement, final fulfillment and review receipts.

This work is deliberately isolated from the protected existing EV commerce and discovery paths.


## Procurement and grant work packages (November 11, 2026)

The latest offline capability is an official-solicitation-to-internal-work-package compiler:

- `program-workpacks.mjs`: fail-closed research/qualification gates for public construction procurements and competitive grants, with offset-aware deadlines, requirement source references and explicit independent review placeholders.
- `programs.v1.json`: current reference records for Port of Seattle `MC-0322998` and CEC California NEVI `GFO-25-603`. These are sourced from official public listing pages, not customer or historical EV project data.
- `program-workpack-cli.mjs`: deterministic console JSON or Markdown output for human review; no network operations or file changes.
- `tests/ev-program-workpacks.test.mjs`: 13 focused cases for prior-award exclusions, bid qualification, source review, deadlines and no-contact/no-payment invariants.

Commands from repository root:

```bash
node --test tests/ev-program-workpacks.test.mjs
node systemia/ev-opportunity/program-workpack-cli.mjs --format markdown
node systemia/ev-opportunity/program-workpack-cli.mjs --format json
```

**Important source-version limitation:** California's public solicitation page shows Addendum 6 and Attachment 5 as current, but their DOCX bodies have not been retrieved and fully reviewed. The documented station-plan fields are supported by the California Energy Commission's earlier official workshop slides and must be reconciled against the controlling Addendum 6 documents. Port of Seattle's state listing confirms the headline scope, time and $1 million NTE; its controlling bid package, current amendments, bonding, staffing and exact submission method must still be obtained through VendorConnect. Never mark an official source file as fully reviewed based on its listing alone.

**Commercial boundary:** These work packages cannot send an email, bid, contact a contractor, issue a proposal, form a project agreement, make a payment or deploy a live system. Output flags are internal research signals only; a `HELD` work package is an accurate and useful result. A public grant is not an Evercraft contract. A name on an earlier Port award is merely a prospective contractor to verify, not a current qualified prime or willing partner.

Verified official reference URLs:

- https://omwbe.wa.gov/bid-opportunities/electric-vehicle-charging-stations-seaport-unit-price-2027
- https://www.portseattle.org/actions/view-current-bid-opportunities-vendorconnect
- https://www.portseattle.org/page/construction-contracting-information
- https://hosting.portseattle.org/contractsweb/ConDetailsPage.aspx?id=SW-0322232 (historic EV project contract; candidate research only)
- https://www.energy.ca.gov/solicitations/2026-02/gfo-25-603-californias-national-electric-vehicle-infrastructure-formula
- https://www.energy.ca.gov/programs-and-topics/programs/federal-ev-infrastructure-programs/californias-national-electric

This remains an offline draft awaiting source acquisition, rights checks, field evidence, qualified subcontract partners and separate contracting authority.
