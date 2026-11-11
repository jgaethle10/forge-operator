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
