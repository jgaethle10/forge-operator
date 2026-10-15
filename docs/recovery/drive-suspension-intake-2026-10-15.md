# Evercraft Drive suspension backlog: controlled GitHub intake
Date: 2026-10-15 (Pacific)
State: REVIEW ONLY. No release, merge, workflow dispatch, payment or production deployment.

## Inventory boundary
An authenticated Google Drive, metadata-only document search for files modified after 2026-10-08 00:00 UTC, excluding trashed items, traversed eight provider pages and returned **792 distinct file IDs**. This is a *bounded* snapshot, not the complete Drive estate and not a statement that any individual file is safe or missing from GitHub.

| File class (metadata MIME) | Items |
| --- | ---: |
| Markdown | 442 |
| Plain text | 147 |
| HTML | 69 |
| Google Docs | 76 |
| PDF | 42 |
| Word | 10 |
| Google Sheets | 2 |
| Excel | 4 |
| **Total** | **792** |

Folder entries, ZIP archives, private source bundles, older files and any material not returned by that document search are **not covered**. Names and filenames alone cannot establish code novelty, content privacy, current correctness or merge suitability.

## Source reconciliation already identified
This is a pointer map, **not** a command to merge any of these PRs:

| Workstream | Existing GitHub review surface | Decision |
| --- | --- | --- |
| Parcel Desk v0.4 | PR #1250 | Keep in this branch; two additional Drive QA cards restored and byte-for-byte connector readback verified |
| Commercial offer visual recovery | PR #1254 | Existing V4.8.1 review candidate; distinguish historical sample pages from public offer routes |
| Network Field Test 01B | PR #1255 | Public-safe release **gate** only; private Network Core, physical field and signing proofs remain held |
| Game Fabric youth bridge | PR #1281 | Review-only bridge; no youth/player private data |
| RustGIS bounded adapter | PR #1272 | Mock and earlier sandbox canaries; no permitted remote physical execution |
| Evercraft OS Files | PR #1286 | Fail-closed source gate; no hosted file service or recipient-open proof |
| Node002 fixed-purpose candidate | PR #1299 | Source review held; no host authority inferred |
| Publisher/Compute recovery | PRs #1231 / #1229 | Reconcile against current main before any release |
| Estate audit | PR #1312 | Related plumbing audit; coordinate migration without redoing or bypassing its safety findings |

## First Drive-to-GitHub transfer: complete
Two public-safe documentation files were copied from Google Drive into the **existing draft Parcel Desk branch** and read back from GitHub with exact content matches:

- `distribution/parcel-desk/COMMERCIAL-QA.md` (Google Drive source: `Evercraft_Parcel_Desk_v04_Commercial_QA_Card.md`), commit `3a61c7c523811b45e4dda9e25bce5c0f52f3d6d2`.
- `distribution/parcel-desk/TEST-RECEIPT.md` (Google Drive source: `Evercraft_Parcel_Desk_v04_Test_Receipt.md`), commit `8e2fefac3e1d3fa6467a6e93a904157d229d5c3f`.

This preserves historical local QA and commercial *candidate* status. It does not establish independent recipient delivery, production security or customer sales.

## Next intake queue
1. **Match first:** group Drive candidates by source folder, project, immutable archive/manifest hash and repository path; compare against current main *and* open PR heads before choosing a destination.
2. **Restore public-review source only:** port missing code, tests and provenance into the existing owner workstream's review branch; require exact source readback. Do not push code into main or fork duplicate product lanes.
3. **Private hold:** customer proposals, margins, application materials, credentials, internal topology, private network source, signing material and other proprietary/private content go to an approved **private** repository after separate security/ownership review. The only connected Evercraft software repository currently visible is public.
4. **CI/release held:** treat passing source tests, published artifact, deployment, recipient access and paid settlement as *separate* proofs. Do not enable scheduled agents/compute or payments as a side effect of migration.
5. **Deduplicate and annotate:** superseded snapshots stay traceable in Drive custody but should not flood Git history; retain a reviewed source→destination→hash→PR→outcome record for each accepted migration.

## Acceptance for each future batch
- Exact source owner, version, Drive file ID or immutable custody digest recorded in protected ledger.
- No personal records, customer data, secrets or unreviewed private design inside public commits.
- No existing branch/PR already implements the same source.
- Source SHA/content verification, focused tests and reviewer signoff.
- Systemia admission, security/release checks and separate runtime proofs before integration/activation.

This file is a triage ledger only. It **does not** authorize automatic bulk import, deletions from Drive or production enablement.
