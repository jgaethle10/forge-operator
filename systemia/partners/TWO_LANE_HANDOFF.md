# Evercraft Partners | dual-lane prospect discovery handoff
**Source state:** read-only screening, not a live recruiter or agreement system.

The founder describes two structurally different opportunities:
1. **EPS operating partner**: Evercraft contributes the software stack, lead/customer operations and owned Remote Ops coordination; a counterparty contributes actual equipment and operating crews. The founder's proposed economic direction is **50/50**, but neither the denominator (gross revenue vs operating profit vs net cash), cost allocation, ownership, tax, insurance, losses, voting, IP, exit nor the legal entity has been settled. **Never issue a binding 50/50 offer or claim equity exists without approved written terms.**
2. **Evercraft product distribution partner**: approved independent salespeople, specialists, publishers, agencies, resellers and authorized platform distributors introducing genuinely fulfillable Evercraft offers worldwide. **Commission percentage, rate basis, product eligibility, geography, refunds, attributable sale definitions and payout timing remain UNSET**, so never quote compensation or allow recruitment-based rewards.

The existing **Evercraft Partners** public entry `/partners/`, encrypted private applicant intake, public outline and review policy remain canonical. This engineering work adds **no second application form, bulk outreach system or partner-payments ledger**.

## What Harbor's hunt should file

For either lane, use the private, structured `evercraft.partners.discovery-candidate.v1` record with:
- Opaque random 24-hex `case_id`, monotonically increasing `revision`, `lane` = `EPS_OPERATING` or `PRODUCT_DISTRIBUTION`, `source_mode` = `research` (until a real applicant or invitation is confirmed), ISO two-letter `country`, general `specialties` and verifiable `source_evidence` (`https:` original source URLs, `kind`, `observed_at`).
- EPS: `equipment_categories`, concrete publicly evidenced type of field work, geographical coverage, employee/contractor crew capacity, available equipment and any verifiable need for booking/estimates/dispatch/CRM/operations. Do not infer ownership of equipment, insurance or license from a photo.
- Distribution: `sales_channels`, `product_keys` relevant to actual current offers, audience type, consent-based sales practice, territory, business credibility and evidence of actual distribution experience. Reach/follower claims alone are not conversions or permission to message customers.
- Never embed private names/emails/phone numbers, customer lists, unpublished terms or raw messages in a GitHub record. Real identity/contacts stay in the existing encrypted partner application inbox or other approved private interaction ledger.

One original-source item can make a lead worth researching, but **Harbor assertions are not independent verification**. The Systemia `trustedReview` flags must be supplied by a separate authenticated operator after source inspection. The `approvedFulfillableProductKeys` list is an actual current owned product readiness check, not the full 69-product catalog or a model-generated guess.

## New owned Systemia module

`systemia/partners/two-lane-discovery.mjs` exports:
- `assessPartnerProspect(prospect, {trustedReview, approvedFulfillableProductKeys})`: evidence-first checks, reuses the **existing owned Opportunity Fabric** tag matcher, returns factual gaps, a bounded prospective fit, non-binding EPS/business economics and a private next step. It never grants outreach, contract, sales authority or compensation.
- `buildPartnerIntakeCandidate(prospect,{adapterActorRef,receivedAt})`: emits an idempotent, anonymous, untrusted-external `source_type:'agent'` candidate with a private reference and digest for the existing **Systemia Intake Fabric**. It does not call `.ingest()`; actual ingestion requires a genuine **Passport `intake.write.agent`** grant on the trusted Harbor scout adapter. A candidate alone is not admitted/accepted/activated.

Stages:
- `NEEDS_SOURCE_EVIDENCE`: no valid public evidence.
- `PRIVATE_QUALIFICATION_PENDING`: incomplete independent source, operating readiness, audience/practice, legal or product availability check.
- `READY_FOR_FOUNDER_DISCUSSION`: minimum reviewed facts and product fit. **Still no contract, quoted commission, member account or authorized outbound contact.**

## Partnership diligence before signature

EPS: decide exactly what “50/50” measures, who handles equipment/maintenance/fuel/wages/worker classification/scheduling/claims, who controls customer contracts/collections, licensing/bond/insurance/safety, geographical scope, IP and software licensing, capital/working losses, termination and dispute resolution. Confirm local counsel/accounting before opening a legal venture. No unrelated project IP transfer.

Distribution: decide qualifying offer/territory, attribution and dispute process, actual verified customer sale and fulfillment, refunds/chargebacks, commission basis, invoicing/tax, independent contractor/legal compliance and marketing disclosure. Do not pay for recruitment or require inventory purchases. Each salesperson must have a real agreement and permissioned outreach. Avoid mass unsolicited email.

## Test and deployment truth

Run `node --test systemia/partners/two-lane-discovery.test.mjs systemia/opportunity-fabric/engine.test.mjs tests/evercraft-partners-launch.test.mjs`. The dedicated `Evercraft partner opportunity two-lane handoff` GitHub workflow executes these on proposed changes.

The source is offline and makes no live Harbor, company email, Facebook, Salesforce, CRM, Page or payment network request. It does not generate real candidates or prove today's 9:30 Harbor demand sweep ran. **Only actual independent lead records, private operator review, accepted signed terms and provider sales/payout readbacks can establish that.**

Canonical partner program: `docs/commercial/evercraft-partners-release-handbook-20261029.md`.
Protected collaboration: `systemia/opportunity-fabric/policy.json` (draft for counsel).
Existing partner intake: `systemia/mcp/partners-public-inquiry.mjs`.
