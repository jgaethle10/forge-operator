# Kennedy Space Station (KSS)

**Standalone Evercraft product identity with a working private operator front door.**

Kennedy Space Station is the spatial-planning and visualization product. Evercraft Site Planner is a **separate**, existing address/evidence/scenario/report/engineering-queue product. Kennedy does **not** replace or rename Site Planner. Kennedy now includes an **assumption-only, editable spatial-study studio** with append-only revisions and SVG exports. The shell integrates with its private operator API to start a site and reopen an existing Site Planner workspace while KSS's genuine spatial solve, drawing production, and renderer integration are developed and verified.

## Run the owned preview

Requires Python 3.11+ and a checkout of the whole repository including `products/site-planner`. No Base44, third-party runtime, CDN, or external service is required.

```bash
cd products/kennedy-space-station
python3 server.py
# open http://127.0.0.1:8811/
```

The landing page has real create-site, list-sites, and open-site actions through the existing local Site Planner API. The visual plan toggles are labeled **concept-only illustration**, not source data or generated engineered site geometry.

- `/`: Kennedy's own welcoming home and operator actions
- `/studio`: Kennedy's editable preliminary 2D spatial concept studio, with separate append-only study records
- `/workspace`: connected, separately branded Site Planner operating interface
- `/api/sites`: canonical Site Planner API, not a KSS duplicate
- `/api/kss/sites/{id}/studies`: Kennedy study revision read/write API
- `/api/kss/sites/{id}/studies/{study_id}/svg`: source-bound, non-engineering SVG export
- `/api/kss/outbox`: private read-only pending KSS study event receipts
- `/api/health`: truthful integration and deployment readiness flags

Underlying site records, evidence, reports, and queue are kept in the existing Site Planner SQLite database and uploaded-file storage. To share the same local project records with an existing Site Planner deployment, point both processes at an approved, durable `EVERCRAFT_SITE_DATA` directory. Apply backups, access controls, and one-writer/migration discipline before any production use.

## Architecture and product boundaries

| Product | Distinct owner responsibility | Current evidence |
| --- | --- | --- |
| Kennedy Space Station | Site geometry, alternative layouts, preliminary sheets, 3D/digital-twin views, customer spatial-design membership | Owned assumption-only 2D study editor and SVG exports; original advanced spatial solver/rendering extraction remains draft/unproven |
| Evercraft Site Planner | Address intake, evidence classification, site conditions, assumptions, qualification, reports, scenario/order lineage, engineering queue | Existing Site Planner branch and isolated HTTP/test evidence |
| Systemia | Mission admission and signed worker dispatch | Pending real delivery, acknowledgements and worker receipts |
| Evercraft Payments | Provider-verified checkout/subscription/settlement | Not integrated |

Kennedy can eventually receive explicit **site snapshot/evidence IDs** from Site Planner and return revisioned **plan outputs with immutable input hashes**, rather than introducing a competing customer project database. Enforce per-tenant and per-project identity before any public use. Avoid unowned partner data; prior RIVET, VDOT, AliEV or Base44 artifacts are not copied into this product.

## Membership hypothesis, not available for purchase

- Explore: proposed $0/mo
- Builder: proposed $39/mo
- Studio: proposed $149/mo

These are pricing experiments shown as **concepts**, not purchasable products, approved commercial offers or an active account system. Paid professional plan production, survey-grade work, permit approvals, stamped engineering drawings and specialized compute/licensing are separately scoped and quoted.

## Release gates

1. Role-based login and organization/site tenant isolation; deny cross-customer reads and writes.
2. Safe uploaded-file inspection, access-controlled downloads, backup and recovery.
3. Verified first-party deployment and device/browser end-to-end tests.
4. Actual plan sheet/geometry + rendered preview evidence, not illustrated fixtures.
5. Receipt-backed Systemia integration and QA, external source provenance and distinct verified vs assumed facts.
6. Evercraft Payments subscription entitlement backed by verified settlement, refunds and limits; no fake usage counters.
7. Transparent paid plan orders linked to the exact origin site/report/evidence snapshot, qualified professional review where required.

**Do not publish this operator shell to the open internet.** It currently inherits Site Planner's operator-level access, not customer accounts. Use an Evercraft-owned private network and audited authorization as necessary.

Engineering lineage: [KSS extraction issue #1361](https://github.com/jgaethle10/forge-operator/issues/1361), [KSS bridge PR #1363](https://github.com/jgaethle10/forge-operator/pull/1363), [Site Planner PR #2281](https://github.com/jgaethle10/forge-operator/pull/2281).

## v0.2 preliminary spatial studio

Studies are stored separately in `EVERCRAFT_SITE_DATA/kennedy/studies.sqlite3` by default, with the canonical Site Planner `site_id` and optional verified-to-site immutable `source_report_id`. Each saved revision is immutable and SHA-256-addressed. Source dimensions are entered by the operator. Rendering is a real 2D rectangle diagram produced from those user inputs, not geographic imagery or an engineering plan. The same-origin private server checks referenced site IDs and report ownership on every write; no customer authorization exists.

Edit the site by dragging rectangles or entering meters, save, load prior revisions, and download the exact saved revision as a labeled SVG. Bounds checks and conservative building-footprint collision checks are deliberately not presented as ADA, hydrology, setback, utility, survey, or code-compliance certification. Run `python3 -m unittest discover -s products/kennedy-space-station -p 'test_*.py' -v` from repo root.

The Spatial Studio is a separately owned product layer, not a Site Planner rename. Future customer memberships require per-tenant identity, hardened file handling, owned public TLS, and externally verified payments. Current $0/$39/$149 offers on the landing page remain hypothetical, not purchasable.

## Systemia-ready, not yet Systemia-delivered

Saving a study commits `kss.spatial.study.saved.v1` into Kennedy's append-only SQLite outbox in the **same database transaction** as the immutable revision. The event includes site/study ID, revision, model SHA-256, optional existing report ID, assumption basis, and explicit `engineering_authority=false`. `GET /api/kss/outbox` reports event IDs, digests, and `pending` state to the local operator. No worker, dispatch, retry, signed delivery, Systemia acknowledgment, billing, permit review, or downstream plan production is claimed. Wiring a signed owned Systemia worker is a separate release gate.

## Canonical report snapshot bridge (KSS v0.3 draft)

The optional immutable Site Planner report selector now has a private read-only source-context endpoint: `GET /api/kss/sites/{site_id}/reports/{report_id}/context`. It returns the exact snapshot's SHA-256, Site Planner's recorded verified/unverified/assumption/other evidence *counts*, scenario count, creation date, and explicit non-engineering authority. It does not return private evidence contents, infer mapping accuracy, or treat operator-entered `verified` labels as independently verified. The server checks exact site/report ownership and rejects mismatched IDs.

On save, Kennedy reads the source report from the canonical Site Planner SQLite database and embeds a minimal report receipt in the immutable KSS model. Untrusted browser-supplied `source_report_receipt` objects are ignored and replaced by actual server-derived data. Its digest becomes part of the revision hash and remains frozen even if newer evidence arrives. Without a linked report, Kennedy continues to label every dimension an operator assumption. No external source, licensing, payment, customer tenant isolation or engineering status is automatically inferred.

## v0.4 owned operator-only HTTPS gateway staging

The **private preview must remain loopback-only**. Even when `EVERCRAFT_SITE_TOKEN` is set, Kennedy refuses non-loopback binding; this is intentional because Site Planner is not tenant-isolated. Also leave `EVERCRAFT_SITE_TOKEN` unset when using browser-facing Kennedy: the inherited Site Planner browser does not support bearer headers. For authorized remote access on Evercraft-owned infrastructure, stage `ops/kennedy-private.Caddyfile.example` into the existing approved owned Caddy configuration only after verifying the actual device, DNS, certificates, exact Caddy version (requires 2.8+ `basic_auth`), and private user. Use a distinct long random operator password, hash with **interactive** `caddy hash-password`, and inject its hash into the Caddy process environment without putting it in GitHub or printing it. Back up the separate private SQLite and uploads first. Never put a plain HTTP site block on an internet-facing IP.

The systemd file `ops/kennedy-private.service.example` is a **template**, not an installation. Replace all placeholders and check the actual user, permissions, write paths and local Caddy setup before installation. `python3 ops/private_gateway_preflight.py` runs read-only and reports only missing environment variable **names**, never secret values. A preflight pass is not proof of live TLS or DNS. The existing owner Caddy process can route its private HTTPS hostname to the local Kennedy service after the real authorized configuration is deployed; no DNS, TLS, install or web deployment was made in this PR.

Caddy basic authentication protects the **entire owner preview**, not separate customers: there are **no tenant or customer accounts**, no order settlement/entitlement checks, and no public SaaS. Before any public memberships, implement distinct identities, per-site authorization and upload and transaction security.
