# Climate Breakthrough | CRM selection consulting response readiness

**Prepared:** November 19, 2026 (Pacific) · **Owner:** Evercraft LLC · **Stage:** qualification and proposal preparation only  
**Buyer:** Climate Breakthrough · **Public opportunity:** [EPIP listing, Nov 10](https://www.epip.org/crm_selection_consultant_cb)  
**Requested response:** November 23, 2026 · **Expected buyer decision:** December 18, 2026 · **Start:** January 1, 2027 · **Estimated period:** twelve weeks, per public listing.

> **No proposal submitted, price agreed, contract signed, access granted, or payment received.** A request for the buyer's full RFP was sent Nov 19. This is an *internal, prequalification-ready methodology*, not a response or statement of qualifications. Do not send until the complete RFP arrives and qualifications, conflicts, references, capacity, contractual terms and submission instructions have been checked.

## What the buyer has publicly specified

Climate Breakthrough uses information across **grants/grant management, contracts, awardee selection, and current/prospective funders**. They want to select an independent CRM that connects this information, improves reporting and usability, reduces duplicate work, and supports a feasible transition. They want to examine Google Workspace, Asana, Slack, DocuSign, Intacct and potential AI tools, with secure data migration, staff adoption, and long-term management.

Source: [public EPIP posting](https://www.epip.org/crm_selection_consultant_cb). The detailed RFP is **not yet received**; no implied scope beyond this public notice is binding.

## Scope recommendation: independent selection, not a custom CRM sale

**Decision package:**
1. Confirmed current-state process maps for fundraising, program/grants, award selection, contracts and reporting, with handoff and duplication pain points.
2. Agreed, testable requirements backlog marked must-have / important / later, including permission boundaries and decision owners.
3. Existing system inventory and integration/data ownership map, with no unauthorized access to donor/awardee records.
4. Neutral vendor shortlist and scripted demonstrations against **the same synthetic or authorized non-sensitive scenarios**, with documented weighted evaluation and unknowns.
5. Comparative total cost of ownership, migration difficulty, contracting, accessibility, privacy and portability risks. Present prices as vendor quotes with a dated source, never as invented offers.
6. Preferred/runner-up option with sensitivity analysis, procurement assumptions, timeline and trigger conditions that could reverse the recommendation.
7. Implementation-ready migration plan, phased cutover, rollback, reconciliation tests, enablement plan and ownership/resourcing matrix.

**Explicit exclusions unless separately contracted:** production deployment, paid third-party CRM licenses, purchase authority, data migration execution, customer-record access, security certification, donation/payment integration, automatic AI decisions, guaranteed vendor pricing, or selection of an Evercraft product without a fair comparison.

## Twelve-week indicative work plan

| Weeks | Outputs | Acceptance condition |
| --- | --- | --- |
| 1–2 | Kickoff and stakeholder interview guide, source systems and data inventory, process maps, RACI, critical permissions | Buyer confirms roles, source-of-truth list, project decision-maker and available data |
| 3–4 | Requirements and priority matrix, integration flow requirements, sample scripts, risk register | Buyer signs off testable must-haves, constraints and scoring weights *before* vendor scoring |
| 5–6 | Market scan, initial shortlist, product qualification, data/privacy/vendor terms questions | Candidates meet minimum mandatory capabilities; rejected products get a reason with evidence |
| 7–8 | Same-scenario vendor demos and reference checks, accessibility/security review, documented scores and unknowns | Scores reproducible, vendor assertions evidence-linked; no hidden substitution of untested capabilities |
| 9–10 | Migration feasibility, TCO and implementation options, reversibility and downtime plan | Cost scenarios cover subscription, seats, implementation, storage, integrations, support and exit costs |
| 11 | Recommendation, risk-adjusted comparison and conditional decision | Buyer can articulate why first place wins and what would change that choice |
| 12 | Board/staff decision materials, migration roadmap, procurement checklist and handoff | Written buyer acceptance of deliverables, remaining questions and follow-on owner |

All dates subject to buyer-approved workshop availability, record access, supplier responses and full-RFP requirements. Work begins only upon a mutually executed contract.

## Neutral scoring rubric, **proposed weights pending buyer approval**

Scores for each category: 0=demonstrated not-fit, 1=serious gap, 2=workaround-heavy, 3=acceptable, 4=strong, 5=demonstrated excellent. Scores of **unknown** must remain unknown, not silently become zero or five. Capture evidence ID, test scenario, timestamp, evaluator and vendor-supplied versus independently verified status.

| Category | Weight | Example acceptance tests |
| --- | ---: | --- |
| Cross-team grants, awardee, contracts and funder workflows | 28% | Can one record connect source interactions and approved award milestones without duplicating entities? |
| Integration fit and data portability | 18% | Can the solution export auditable records, document APIs/webhooks, and connect identified systems without sharing credentials? |
| Privacy, permissions and security | 16% | Demonstrate role-level least privilege, audit history, retention/deletion, vendor commitments and incident response |
| Migration feasibility and reversibility | 12% | Map identifiers and attachments, duplicate resolution, dry-run reconciliation and rollback path |
| Staff usability and adoption | 10% | Complete scenario walkthroughs with mixed roles; accessible navigation and low manual burden |
| Support and vendor viability | 8% | Transparent service levels, uptime/support responsibilities, response terms and change controls |
| Five-year total cost and contract flexibility | 8% | Detailed quotation and scenarios for seats, usage, integration, storage, add-ons, exit/export |
| **Total** | **100%** | Buyer must approve weight distribution before vendor testing |

**Hard-gate proposal:** documented data ownership/export path; enforceable permissions and audit trail; acceptable data processing/security terms; no deal-blocking integration restrictions; safe transition path. All hard gates require evidence and a buyer-approved risk owner. A vendor with an unknown hard gate is **hold for review**, not a pass. A failed mandatory gate is excluded regardless of weighted score. Missing scored criteria should produce score ranges (lower/upper possible), not an authoritative rank.

**No preselected vendor:** Salesforce Nonprofit Cloud, Blackbaud, CiviCRM, Bloomerang, Neon CRM, Microsoft Dynamics and other candidates are *names to qualify*, not automatically relevant options or endorsements. Final shortlist only after functional fit, compliance and actual vendor quotes are validated.

## Five scenario scripts for consistent vendor demonstrations

1. **Grant cycle:** create a synthetic funding opportunity, connect eligible applications and decisions, track approved milestones, due dates, documents and role-specific reports.
2. **Funder relationship:** link a synthetic institution and contacts to multiple programs; deduplicate by stable keys, show permitted interaction and stewardship history.
3. **Contract lifecycle:** move a synthetic award decision through approval, DocuSign handoff and financial reconciliation reference, without claiming a specific integration is native until tested.
4. **Cross-team report:** produce a reproducible authorized portfolio snapshot with explicit as-of time, inclusion rules and permission-based redaction.
5. **Migration/exit:** dry-run import 20–50 synthetic records with realistic duplicate/cross-reference cases; detect mismatch, rerun idempotently, export and compare counts, links and ownership rules.

Each scenario records setup, device/browser if applicable, steps, expected behavior, actual behavior, evidence URLs/screenshots, failure severity, tested vendor product/version and remediation/residual risk.

## Data and AI governance

- Inventory sensitive fields (donor/awardee/private correspondence, identities and financial data). Work only with buyer-authorized access and written retention constraints; keep the publicly stored response entirely non-confidential.
- Document each API's exact data flow, token/credential owner, tenancy boundary, sync conflict owner, rate-limit behavior, retry and audit trail. **Integrations are hypotheses until confirmed by vendors and sandbox tests**.
- Minimize third-party model exposure; prefer source-backed retrieval and human confirmation for grants, awardee decisions and financial actions. Evaluate LLM tools only as an optional separately scoped decision, never assume sending private records to them is permitted.
- No client data or secrets in this public repository, Gmail proposals, training prompts or demos.
- Provide migration dry-run with signed mapping, duplicate report, count reconciliation, referential integrity checks, rollback trigger, privilege checks, accessibility and staff training.

## Capability evidence and gaps, kept separate

**Existing source-level demonstration:** Evercraft's [Interaction Ledger](https://github.com/jgaethle10/forge-operator/blob/main/systemia/interaction-ledger/README.md) documents relationship-state, permission, duplicate suppression, exact-message permits and audit receipts. Its [Client Scout](https://github.com/jgaethle10/forge-operator/blob/main/systemia/proof-first-sales/CLIENT-SCOUT.md) documents a read-only discovery workflow. The [QA evidence sample](https://github.com/jgaethle10/forge-operator/blob/main/docs/commercial/qa-evidence-sample-20261119.md) is internal-product release testing, *not* a client CRM case study.

**Not established:** completed independent nonprofit CRM selection engagements, three nonprofit CRM vendor demos, full production grants-management implementation, integration certifications, buyer references, staffing for 12 weeks, actual vendor quotes, and full RFP eligibility. These gaps must not be represented as solved. A legitimate consortium or specialist subcontractor requires transparent disclosure and an authorized agreement.

## Qualification questions before formal submission

1. Can the full RFP and scoring criteria be provided, with all appendices and contract boilerplate?
2. Are prior nonprofit CRM selection references mandatory? How many and how recent?
3. What is the decision-maker group and number of stakeholder workshops?
4. What are the incumbent systems, number of records, attachments, duplicate rates and permission roles, described in aggregate only?
5. Is CRM selection expected to be completely vendor neutral, with contractual independence and conflict disclosures?
6. Are the core grant/funder processes available for synthetic walkthroughs without sensitive data transfer?
7. What is the preference on direct native integrations versus middleware, and who funds vendor demo/sandbox environments?
8. Is implementation beyond selection explicitly out of scope or an option? What are the fixed-fee and travel expectations?
9. What is the submission channel/time zone on Nov 23, and what team, insurance, privacy and contracting documents are required?
10. What level of accessibility evaluation and data governance reporting is required for final acceptance?

## Commercial decision and response status

- **Nov 19:** sent one request for full RFP to the publicly listed first-party procurement contact (provider receipt held in Gmail; confidential correspondence stays out of public repo).
- **As of this document:** full buyer RFP not received; no price quoted, no formal bid submitted.
- **Go/no-go:** submit only if the full RFP confirms a feasible neutral selection scope, Evercraft can demonstrate staffing/experience or correctly disclose a qualified partner, and pricing/cost exposure can be backed by a defensible work plan. No claim of guaranteed selection or deliverability.

**Next internal work if no document arrives:** complete buyer-neutral example scenarios and evidence templates using synthetic records only; preserve Nov 23 deadline. Do **not** send a speculative second outreach to the same buyer without new context.
