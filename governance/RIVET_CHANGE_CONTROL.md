# RIVET Retirement and Historical Artifact Integrity

Status: **RETIRED (Evercraft-owned legacy technology)**

Founder confirmation (November 2026): no RIVET LLC was formed; the venture ended and the team backed out. RIVET is **not an active product or partner**, and it has no current commercial release or external partner-approval authority over Evercraft.

The historical source, generated evidence and old partner-approval material are retained for audit/provenance. They are *not* live product claims, actionable diligence decisions, an approved commercial offer, or evidence of a continuing RIVET partnership. In particular, preserving a retirement snapshot **does not validate historical report conclusions**, past session/usage observations, or the older source drift.

## Active retirement safeguards

- Do not expose a new RIVET landing page, payment SKU, API/checkout, or buyer distribution path.
- Freeze the historical RIVET source and agent artifact bytes at the exact retirement snapshot recorded by `tests/retired-rivet-isolation.test.mjs`. These are preservation hashes, **not retroactive partner approvals**.
- Keep `public/chum/intents/rivet-site-underwriting-v1/agent.json` materialized only from its protected source, with existing generator drift protection.
- Do not represent a freshness or refresh timestamp as observed session evidence. Prior history and the known difference from the former partner baseline remain documented in issue #1192 and the original `tests/rivet-change-control.test.mjs`.
- Changes to historical RIVET artifacts require an explicit Evercraft owner decision and a separate scoped PR, with before/after diffs and actual evidence. They do **not** require permission from a nonexistent business.
- Changes to unrelated Evercraft Fabric pages, Evercraft Payments, AliEV, or operational infrastructure **do not** require historical RIVET partner signoff. Current product-specific safety and release checks remain mandatory.

## Archived governance provenance

The previous governance document said RIVET was a live partner-approved product with a fixed baseline from commit `60a129284c92c5e453bb67e5004f3caeaffaefb5`. The then-approved `systemia/rivet/report-runtime.mjs` Git blob was `b1f410305111f61f6dc132b696215676710955fb`; the source at retirement is `86b66a17fd45c1ce6f7834ae88038658f438fe3d`. An intervening freshness update could influence report diligence scoring without observed session rows. That **historical discrepancy remains unresolved**, not approved or concealed.

The old `tests/rivet-change-control.test.mjs` is intentionally retained as a *historical comparison*: it may fail on these known differences and is not used as an active cross-product release gate. The replacement safety check preserves retirement artifacts and prohibits commercialization. See issue #1192.

## Release separation

Website Audit and other active Evercraft products are governed by their own buyer-path, processor, fulfillment, and publication checks. Retiring this obsolete commercial dependency does **not** enable payments, merge an offer page, send customer messages, or approve deployment.
