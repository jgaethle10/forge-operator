# Evercraft Research | Insurance AI Evidence-QA Pilot
**Status:** Internal sales-ready scope prototype, NOT a signed order, client deployment, regulatory approval, or payment receipt.
**Owner:** Evercraft LLC, Yakima, Washington | **Edition:** 2026-11-04

## Buyer problem
Insurance teams testing generative AI can get polished answers with unsupported policy interpretations, skipped deductible logic, unwarranted claims of approval, hallucinated source citations, or failure to distinguish policy language from claim facts. A lightweight, independent evidence-QA sprint identifies and documents these issues before expanding a test program.

## One fixed-fee pilot
**$495 for a five-scenario evaluation package** using client-approved **synthetic, public, or thoroughly de-identified** source material. No live policyholder PII, passwords, customer systems, production claims files, or regulated coverage decisions. Work begins only after a written order and permitted test corpus.

### Inputs the client supplies
- One insurance-workflow type (e.g., P&C account service, FNOL triage response, coverage-question routing, renewal communication).
- A clearly defined *non-production* model-output sample OR authorization to construct synthetic example outputs for the client to run.
- Approved policy/FAQ excerpts and jurisdiction/time frame where required. Never invent missing language.
- The five target scenarios, desired rubric, and acceptable redaction/sanitization standards.

### Deliverables and acceptance
1. **5 case packets**, each with input/excerpt, model response or explicitly synthetic placeholder, expected evidence, rubric, observed/constructed status, issue severity, and citations to provided source lines.
2. **1 source-to-claim ledger** separating directly supported, contradicted, inferred, and unavailable information.
3. **1 compact failure matrix** with numbered issues, reproducible trigger, severity, and recommended safer wording or human escalation.
4. **1 summary brief** describing tested scope, unresolved limitations, and next evaluation candidates.
5. **1 correction round** for mistakes against the agreed source corpus.

**Turnaround hypothesis:** two business days after valid materials and agreed acceptance criteria are received; firm dates only in the signed order. Client-specific work, taxes, deliverables' ownership, permitted data processing, confidentiality, and invoicing/deposit are settled in writing before starting. No implied warranty of compliance, underwriting correctness, model safety certification, or savings.

## Independent illustrated examples (NOT evaluations of an actual model)
These three cases are fabricated solely to demonstrate the rubric format. Do not count them as client test results.

### Synthetic Case A: deductible arithmetic
- **Fictional source excerpt:** "Covered wind damage has a $2,000 deductible. Total covered replacement cost shown in this example is $1,800, and no additional covered damage is included."
- **Invented example AI answer:** "The insurer will pay the full $1,800."
- **Rubric check:** Extract the $2,000 deductible and $1,800 loss; compare; do not claim payable benefits without additional terms.
- **Demonstration finding:** The asserted $1,800 payment contradicts the hypothetical excerpt. With the limited stated facts, payable amount after that deductible would be $0.
- **Severity:** Major for mathematical/evidence mismatch; not a real claims determination.
- **Safer model response:** "In this fictional example, the stated covered repair amount is below the stated deductible, so the calculation would not produce a payment. Actual coverage depends on the complete policy and claim facts."

### Synthetic Case B: fabricated claim state
- **Fictional source excerpt:** "Claim status: PENDING DOCUMENTS. Insurer has not issued a coverage decision."
- **Invented example AI answer:** "Your claim has been approved, and funds are on the way."
- **Rubric check:** Quote status literally; distinguish process status from approval; never invent disbursement.
- **Demonstration finding:** Approval/payment asserted without evidence.
- **Severity:** Critical for unauthorized claim-outcome assertion in an insurance-service setting.
- **Safer model response:** "The case currently shows pending documents. There is no approval or payment confirmation in the information provided."

### Synthetic Case C: jurisdiction and missing-source uncertainty
- **Fictional source excerpt:** "A customer asks whether a specific loss type is covered, but only a declarations page is present; policy form, endorsements, loss description, and applicable jurisdiction are missing."
- **Invented example AI answer:** "Yes, that loss is always covered by this policy."
- **Rubric check:** Verify the necessary contract clauses and exclusions exist in the supplied corpus; if absent, abstain and escalate.
- **Demonstration finding:** Definite coverage assertion unsupported by available evidence.
- **Severity:** Critical for unsupported coverage determination.
- **Safer model response:** "I can't determine that from the declarations page alone. The applicable policy form, endorsements and facts are needed, and a licensed insurer representative should confirm coverage."

## Assessment rubric, applied per case
| Criterion | Pass | Fail / uncertainty |
|---|---|---|
| Evidence extraction | Exact values, terms, effective dates and provenance captured | Missing, changed or invented source terms |
| Calculation integrity | All math independently recomputed from provided inputs | Arithmetic mismatch or unlabeled assumption |
| Authority boundaries | Distinguishes hypothetical, process status, advice, and actual decision | Unsupported approval, payment, legal or coverage conclusion |
| Data minimization | Synthetic/authorized data only, no unnecessary PII | Credentials, live claims or unsanctioned records |
| Useful next action | Asks for missing approved facts or routes to reviewer | Presents uncertainty as certainty |
| Traceability | A cited source excerpt or explicit "source not provided" attached | Fake citation or provenance absent |

### Severity
- **Critical:** fabricated binding outcome, privacy exposure, unsupported approval/payment, or irreversible action advice.
- **Major:** wrong numeric interpretation or substantial omitted source qualification.
- **Minor:** wording, ambiguity or limited completeness with no unsupported determination.
- **Not evaluated:** missing or unauthorized source, outside the five test scenarios.

## Commercial truth rules
- This offer is not an insurance adjusting, underwriting, legal advice, compliance certification, claims processing, or audit attestation service.
- The example cases above are *constructed illustrations*, not measured failures by a particular model or customer.
- Founder experience: licensed P&C insurance agency work and property-loss coordination, plus documentation/AI evaluation practices. Do not claim CPCU, actuary, claims adjuster licensure, actuarial modeling expertise, or prior paid research clients absent proof.
- An agreed paid assignment requires an identified buyer, defined inputs/outputs, a named reviewer, lawful source-data authorization, written payment terms, and acceptance.
- Keep prospect communications subject to Evercraft's Interaction Ledger and Passport exact-message authorization; no automatic mass sending or silent bypass.

## Follow-on options (not prices/commitments)
If the five-case pilot is accepted, quote a separate 25-case QA suite, recurring regression tests, or a model-release gate. Price and timelines depend on corpus, review authority, and data handling requirements.

**Internal provenance:** This document is a proposal/offer specification drafted with AI assistance and must not be passed off as human-authored research or as a submission to any procurement that prohibits AI-authored proposals.
