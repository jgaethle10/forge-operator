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

## v0.5 source-bound PDF concept sheet (not construction plans)

Every saved Kennedy revision now has a **one-page landscape PDF** exported from the same validated local geometry model as the SVG. `GET /api/kss/sites/{site_id}/studies/{study_id}/pdf` returns `application/pdf` as a downloadable file. The spatial positions, parcel size and types are derived from the immutable saved revision, **not** decorative placeholders or map data. The document prints its model SHA-256 and, when present, the exact source report snapshot fingerprint. It prominently rejects survey, code, ADA, permit and construction authority, and degrades unsupported Unicode to printable ASCII because the deliberately minimal PDF generator embeds only Helvetica. It uses Python standard library only and does not call external PDF services. Owner/local operator access only; not a stamped plan, survey or valid engineering deliverable.

## v0.6 separate public product homepage (safe-by-construction)

A separate, self-contained, responsive **public static** Kennedy site lives at `public/index.html`. It contains accessible anchored product storytelling and hypothetical labeled site illustrations only; no private Site Planner data, dynamic project counts, user forms, external CDN fonts, scripts, payment links or client APIs. It does **not** present a working customer signup, membership checkout or real plan. Kennedy's **operator-only** design UI remains at its distinct private origin, with separate Caddy basic authentication.

`ops/kennedy-public.Caddyfile.example` is a staged **owned static-file** Caddy template using a distinct operator-supplied `KENNEDY_PUBLIC_DOMAIN` domain. Its root must be set to the explicit isolated `public/` directory, with a strict script/connect/form CSP, path allowlist and **no reverse proxy to the private KSS app**. Do not combine the public site and operator gateway on the same origin. Source-only safety checks run `python3 products/kennedy-space-station/verify_public_home.py` under GitHub Actions. They reject interactive forms, remote dependencies, private paths and missing isolation rules.

**Nothing has been installed, pointed at DNS, assigned a domain, or published.** Actual domain ownership, the Caddy host and version, SSL provisioning, routing, browser and iPhone access, security headers and device display remain a host-specific verified deployment gate. Public visitors must never be routed to the operator's Site Planner API, SQLite data or uploads.

## v0.7 historical-quality recovery gate

Founder reference screenshots show source-backed site qualification reporting and truly site-specific engineering-style layout sheets with aerial imagery, map context, S-0/A-0 titles, notes and sources. The current Kennedy front-end and concept-only PDF **do not meet that benchmark**. The executable acceptance specification and hard remaining gates are [KSS issue #2370](https://github.com/jgaethle10/forge-operator/issues/2370), alongside original graphics extraction [#1361](https://github.com/jgaethle10/forge-operator/issues/1361) and isolated clean-room geometry bridge [PR #1363](https://github.com/jgaethle10/forge-operator/pull/1363). The historical screenshots and partner/client raster/report artifacts are *visual references only*. Nothing from the old Base44 runtime or restricted RIVET/VDOT/AliEV sources has been migrated.

`raster_registration.py` introduces the first **standalone clean-room aerial registration kernel**, currently **not wired to upload, storage, Site Planner reports, KSS SVG/PDF sheets or public deployment**. It accepts actual PNG byte content plus explicit file SHA-256, native image dimensions, source and license identifiers, asserted rights classification (licensed derivative-use must be explicitly approved), source evidence classification, and at least four independent operator-entered pixel-to-local-meter control points. It fits a bounded affine transform, reports its local-meter residual, and rejects degenerate, implausibly scaled, inaccurate, mismatched, unsupported or unauthorised inputs. Basic PNG IHDR header and CRC are checked, **not a full PNG decoder**; a trusted decode and raster security limits are still required before any rendering.

The receipt explicitly says **operator control points only**, **rights attested, not independently legally verified**, **no verified CRS or north**, **not survey-grade**, **not sheet-ready** and **not publication-authorized**. SHA-256 integrity never proves source truth, geographic alignment or a license. JPEG/GeoTIFF/true map CRS support remains missing. Do not label current output S-0/A-0 or claim KSS has recovered its historical site intelligence or image-based plan-sheet functionality.

## v0.8 two-source synthetic S-0 / A-0 PDF proof (November 19)

`sheet_compiler.py` is an **actual image-backed, two-page PDF compiler** for *entirely owned synthetic* fixtures. It decodes the actual source PNG pixels with strict CRC and bounded RGB8 filters, compares both source-image SHA-256 digests with distinct same-site registration manifests, checks a local operator-entered affine transform and scale agreement, then draws the **real site model's proposed geometry onto the embedded pixels**. The S-0 page shows a proposed local arrangement. The A-0 page uses a **different synthetic local-context source image** to show the same parcel location within the wider fictional setting. The sheet titles are *descriptive*, not engineering certifications.

A 36x24-inch landscape PDF sheet set includes the original site model digest, image hashes, rights/source labels, actual fitted residual, project label, SVG-consistent color geometry, title blocks and unavoidable preliminary-only disclaimers. **No north arrow or EPSG/CRS is shown** because neither has been independently established. A locally calibrated distance bar says *operator-local*, not survey scale. No real aerial background is invented.

`generate_synthetic_sheets.py --output-dir /tmp/kss-synthetic` produces a completely original pixel-art pair of input PNGs, `kennedy-synthetic-s0-a0.pdf`, and `source-qa-receipt.json`. The output is reproducible from code with no network requests. GitHub Actions runs unit tests, generates the actual PDF, checks two-page PDF metadata and renders it using `pdftoppm` to page PNGs, and attaches these private CI proofs. The metadata explicitly says **human visual QA not performed** until a reviewer actually views them. All examples are fictional.

**RELEASE GATE REMAINS HOLD:** This compiler intentionally refuses non-synthetic or not-owned inputs. It is NOT wired into the Site Planner uploads, Kennedy Studio UI, or live PDF endpoint. It has no real geographic basemaps, no verified north/CRS, no licensed image ingestion, no construction/ADA compliance, no map data or road/geographic QA, no customer permission system and no public service. Do not promote the v0.8 synthetic compiler or claim historical Rivet plan-sheet parity without the independently proven real-data pipeline and a human visual review. [Track #2370](https://github.com/jgaethle10/forge-operator/issues/2370).

## v0.9 independent rasterized page-region QA

`verify_rendered_sheets.py` validates the **actual 72-dpi rasterized PDF output** from Poppler on GitHub Actions, not just header/bytes. It samples the visible site underlay for diverse colors and green/source-image pixels, the dark header and S-0/A-0 title panels, the preliminary warning banner, nonblank right-hand title blocks, and meaningful differences between each sheet's underlay. It writes `render-qa-receipt.json` with page pixel digests and sampled diagnostics. CI fails on missing visual regions. The PDF unit tests also decompress its embedded image objects and require **pixel-for-pixel equality** with both independently decoded synthetic PNG sources, preventing substituted image placeholders.

The CI artifact now includes both rendered preview PNGs, source PNGs, PDF, original source QA receipt and new pixel QA receipt. These checks **do not** establish that small text is legible, font blocks never overlap, any source is a real aerial photograph, geographic registration, licensed derivative rights, or professional engineering. Human review and real-source rights verification remain HOLD. This is a synthetic fixture only.

## v1.0 private aerial source staging (November 20)

Private loopback Kennedy now supports a limited, **operator-only, rights-attested PNG intake**, separate from Site Planner uploads:

- `POST /api/kss/sites/{site_id}/aerial-sources` with `{"role":"site"|"context","manifest":{...evercraft.kss.aerial-registration.v1...},"png_base64":"..."}`. Site must already exist in canonical Site Planner; body is a JSON object (not a live map scraper or general public upload). Body max is inherited 16 MiB, base64 max is 7 MiB, and decoded PNG max is 5 MiB.
- `GET /api/kss/sites/{site_id}/aerial-sources` lists private immutable registration receipts. `GET /api/kss/sites/{site_id}/aerial-sources/{source_id}` reads one same-site receipt; cross-site URLs return 404.
- The private `aerial_vault.sqlite3` records **original bytes, their full SHA-256, calibration receipt and operator-supplied rights references in one transaction**. A non-dispatched, pending-only `kss.aerial.source.staged.v1` event is created atomically. No public image URL or raw PNG API exists.
- All PNG chunks are checked by the owned RGB8 decoder, including CRC and bounded decompression. PNG metadata, image digest, dimensions, four or more explicit local-metre control points, residual threshold, source-reference text and rights classification must agree. Rejects malformed, overlarge or incorrectly bound payloads.

**Strict HOLD:** An accepted private record means **operator attestation and mathematical calibration only**, not confirmed license, known CRS, legally usable imagery, surveyed dimensions, north, site identity, or approval to distribute/render a real-image plan. The existing S-0/A-0 compiler stays **synthetic-only**. There is no customer-level authorization, iPhone/browser uploader, production TLS verification, live third-party imagery fetching, remote API deployment, or plan export of submitted imagery. The private operator service remains loopback bound behind the staged owned Caddy gateway. Site-specific future rendering must pass independent rights and geospatial QA.

## v1.1 owner-only aerial source lab UI

`/aerial` is a responsive private operator page linked from the Spatial Studio. It loads an existing canonical Site Planner project and lets an authorized operator choose a small RGB8 PNG, record stable source/rights references, select source role and evidence classification, and manually enter **four known pixel-to-local-metre control-point coordinates**. The browser computes SHA-256 on exact file bytes and posts the PNG as base64 to the loopback Kennedy API, which performs the final authoritative checks and persists it. Saved receipts remain site-scoped and are listed with visible **HOLD** status. The interface does not prefill invented local coordinates, fetch maps, grant rights, draw a north arrow, give customer access, or export real-image PDF plans.

**Private lab only:** the public static home still has zero routes to private APIs. HTTPS/owned hostname, actual mobile device review and independent geospatial/rights validation remain unverified. The server now responds to `GET /aerial` only through the private operator origin.

## v1.2 owner-only two-sheet source review (November 20, 2026)

The private studio can now choose a saved same-site `site` and `context` aerial source record and request `POST /api/kss/sites/{site_id}/studies/{study_id}/private-review` with JSON `{"site_source_id":"AIR-...","context_source_id":"AIR-..."}`. This is intentionally a **POST** so private source IDs and report references are not attached as query parameters or exposed in public static links. It returns a two-page 36x24-inch PDF built from the actual saved immutable image bytes, affine calibration receipts and saved study geometry. No raw image retrieval route is created.

- Server verifies exact source ownership for both inputs, correct `site/context` roles, distinct source bytes, receipt/image integrity, pending-only review status, valid local-metre affine transform and saved model SHA-256. Wrong site or missing studies receive 404; incorrect roles, unregistered/malformed or out-of-frame geometry are rejected rather than silently repositioned.
- Both pages display source SHA-256, source ID and operator-recorded source reference, as well as the exact study fingerprint. The private output is conspicuously stamped **PRIVATE SOURCE REVIEW / NOT FOR EXTERNAL DELIVERY / NOT A PERMIT OR CONSTRUCTION DOCUMENT / UNVERIFIED**. It says nothing about validated georeferencing, real north or survey-grade precision.
- The original `compile_two_sheet_synthetic` remains synthetic-only with unchanged deterministic fixture output. The separate `compile_two_sheet_private_review` path is **not a public or customer export**; it never sets `aerial_sheet_export_ready`, `public_access_authorized` or `customer_access_authorized` true. The private studio provides a source selector and button that downloads the draft using an authenticated same-origin request.
- HTTP regressions construct a synthetic site, save a study, stage both original source image bytes in the private vault, and generate a binary two-page PDF through the actual endpoint. Cross-site references, swapped roles, missing saved study and suspicious IDs must fail closed.

**Not yet proved:** independent legal use rights, exact georeferencing or CRS, real baseline imagery from trusted providers, an owner-hosted HTTPS operator site, or manual visual quality on an actual phone. This draft stays in the owner-only workspace; do not share private review PDFs as externally approved deliverables. No legacy Base44 or partner-specific imagery was used.

## v1.3 additional private review PDF proof artifact

GitHub Actions now independently generates a **second** two-page synthetic proof through the real private aerial vault, `generate_private_review_proof.py`. Both images are staged, read back with byte-integrity checks, and compiled via `compile_two_sheet_private_review`. Poppler rasterizes the resulting PDF; the same pixel-region QA checks its actual plan source textures, dark header/title panels, visible warning banners, nonblank notes and different S-0/A-0 page content. The CI artifact includes `kennedy-private-review-synthetic.pdf`, its two page-render PNGs, and source/review SHA receipts alongside the existing baseline synthetic PDF. This proves the **separate private review path** produces a real visual output from vault bytes, not just a valid HTTP PDF response.

All fixtures remain synthetic and nongeographic. No user source files, third-party imagery, actual customer deliverables or public deployment are included.
