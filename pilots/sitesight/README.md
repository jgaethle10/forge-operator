# SiteSight | internal PPE review pilot

**Status:** Engineering experiment, no customer-facing release. **Canonical parent:** Systemia `evercraft-ecosystem-loop-closure-v1`. **Systemia draft:** `founder-draft-evercraft-ppe-evidence-loop-20261014`. No verified mission admission, specialist dispatch, camera ingestion, worker consent, real model inference, external notification, safety effectiveness, financial checkout or deployment.

## Why this exists

A camera may suggest PPE concerns, but a bounding box isn't proof of compliance or a violation. SiteSight models a narrower, testable journey:

consented observation → candidate requiring review → human judgment → assigned corrective action → documented closeout → auditable evidence export

A reviewer must be able to dismiss an obvious **illustrative** false alarm. Low visibility, occluded footwear and unknown confidence cannot be promoted to a violation **or dismissed as visually safe**. They become tracked, still-open `inspection_required` tasks until a separate, authorized physical inspection workflow exists. Trained humans remain responsible for site safety.

## What is implemented in this branch

- `evidence.mjs`: pure Node.js synthetic export validator. Replays candidate lifecycle events, prevents unreviewed closeouts, rejects unknown confidence as camera-confirmed violations and rejects production/admission/checkout claims.
- `evidence.test.mjs`: regression coverage for representative valid history, tampering, contradictory state, invalid chronology, missing human review, unsupported closeout and authority claims.
- `verify-export.mjs`: read-only CLI checker for a JSON file downloaded from the fictional browser session. A successful verdict is an internal consistency check, **not** chain-of-custody evidence.
- `browser-e2e.py`: real Chromium browser acceptance run. Clicks the review and closeout flow, exports JSON, validates it using the Node CLI, confirms tamper rejection, and verifies the physical-inspection request branch. A CI run can save synthetic screenshots, short video, and exported receipts in a seven-day GitHub artifact.
- Separate path-scoped CI. No public discovery registry, commerce, browser deployment or production routing changes.

The offline illustrative HTML preview `evercraft_ppe_safety_internal_demo.html` is now versioned in this pilot directory, alongside the evidence validator. It was previously packaged in the internal pilot kit. It is deliberately not an authenticated customer page. The JSON content SHA-256 is a local change detector, NOT a cryptographic proof of authorship or chain of custody.

## Run

    node --test pilots/sitesight/*.test.mjs
    python -m pip install playwright==1.55.0
    python -m playwright install chromium
    python pilots/sitesight/browser-e2e.py
    node pilots/sitesight/verify-export.mjs /path/to/synthetic-evidence.json

## Release blockers

1. Canonical Systemia read-before-write admission and signed work receipt.
2. Site-owner authorization, worker notice/consent where required, retention/deletion and scoped access.
3. Real media processing and measured performance in night, glare, occlusion, movement and distinct PPE variants.
4. False-negative management, human escalation, independent qualified safety review.
5. Authenticated append-only event provenance and recipient delivery verification, not just JSON hashing.
6. Buyer comprehension, authorized pricing, Evercraft Payments authoritative checkout and fulfillment proof.
7. Exact Output Gate, Shipping and independent recipient/browser QA.

**Never call this live PPE monitoring, OSHA certification, preventive protection, employee behavior proof, or a customer-ready paid integration. No outreach or auto-publishing.**
