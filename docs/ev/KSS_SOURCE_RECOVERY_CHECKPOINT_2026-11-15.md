# Kennedy Space Station (KSS) | Original-source recovery checkpoint

**Observed:** 2026-11-15 Pacific / 2026-11-16 UTC  
**Status:** READ-ONLY FORENSIC RECOVERY + BYTE-EXACT SOURCE PRESERVATION; NOT A RENDERER RECOVERY OR CUSTOMER RELEASE.

## What was recovered

A historical owned GitHub branch, `kss-spatial-extraction-20261017`, contained four original independent-source files:

| File | Historical blob SHA | Recovered use |
| --- | --- | --- |
| `systemia/graphics-command/kss-spatial-ingress.mjs` | `1dbd451c0056e8d2e1976967934aee13ef9c6971` | Rights-aware local geometry to Fallen triangle meshes |
| `systemia/graphics-command/kss-spatial-ingress.test.mjs` | `641ce796902436fe1b4e1efe07e9263c6355e649` | Nine synthetic Node tests |
| `systemia/graphics-command/kss-world-import.test.mjs` | `84d460d96450e2de6d4b2188451f0fa5632e0a5b` | A test of original World Engine geometry importer |
| `systemia/graphics-command/KSS_EXTRACTION_README.md` | `08ccd43be7753f3f9c4b69dceaadb1ceaca8416c` | Historical limitations and next-stage inventory |

All four files are copied unmodified onto this branch and their GitHub blob SHA matches the source branch. The upstream geometry importer `systemia/world-engine/fallen-geometry.ts` is present on current main.

**Important:** `kss-spatial-ingress.mjs` is a geometric 3D presentation bridge, **not** the original full KSS site-planning solver or the PDF/layout engine. Its input must already have adjudicated local geometry. Do not suggest it proves source-to-map, scaled survey, or site-plan production readiness.

## Actual FS6 reference measured, not invented

An owner-held historical 20-sheet FS6 preliminary EV planning PDF was directly downloaded from Evercraft's Drive and inspected using PyMuPDF in read-only analysis. It was not committed or redistributed.

- Archive digest SHA-256: `b9ccc4d5d1ab7d27b03ea7e81fd3f6c01b653ed88cc3cac9021e11a642fb8387`
- **20 pages** across **5 sites**, four sheets per site
- Physical sheet geometry: **2592 x 1728 PDF points, equivalent to 36 x 24 inches**.
- Technical sheet roles, repeated for each site: `C101` overall preliminary site plan; `C102` existing conditions / EV work-zone evidence; `E101` electrical / utility concept; `D501` typical EV, ADA, trench and equipment details.
- Vector paths ranged from **50 to 327 per page** across the inspected set (page-by-page inspection of all 20 pages).
- Each page includes `PRELIMINARY` and `NOT FOR CONSTRUCTION` textual safeguards.
- This particular FS6 PDF contains **no embedded image XObjects**, although separate historical source screenshots and PDFs visibly show aerial-image versions. Do not conflate the two artifact families.
- The reference PDF contains former project branding and site-specific customer context, and must not be reused wholesale in independent commercial products without a separate ownership and data-use review.

The benchmark is about **information fidelity** and drawing-system structure, not cosmetics alone.

## KSS component recovery inventory

| Original component | Historical identification | Recovery status |
| --- | --- | --- |
| Source acquisition and parcel/road/parking evidence | September KSS workflow | OUTPUTS and receipts retained; generic original source implementation not located |
| Neutral spatial geometry solver and fit | `kss_siteplan_profiles.py`, associated KSS helpers | ORIGINAL SOURCE NOT RECOVERED |
| FS6 / semantic sheet profiles | `semantic_sheet_v2`, `kss_siteplan_v2_layout_qa.py` | ORIGINAL SOURCE NOT RECOVERED |
| PDF drawing / batch builder | `build_rivet_vdot_submission_pair_v1.py` | ORIGINAL SOURCE NOT RECOVERED |
| Visual maturity and PDF optimization | `kss_visual_maturity_qa.py`, `kss_review_pdf_optimize.py` | ORIGINAL SOURCE NOT RECOVERED |
| Rights-aware 3D presentation handoff | `kss-spatial-ingress.mjs` | BYTE-EXACT RECOVERED ON THIS BRANCH |
| Original historic quality reference | FS6, 20 sheets / 5 sites | OWNER-HELD OUTPUT INSPECTED; DO NOT COPY TO PUBLIC REPO |
| Generic World Engine geometry importer | `systemia/world-engine/fallen-geometry.ts` | PRESENT ON MAIN; live integration not newly run |

## Non-negotiable fidelity gates for a future Evercraft/KSS renderer

1. A **cleared, independently licensed** geospatial source is tied to each mapped feature; no fabricated building, curb, pavement, parcel or charger position may be represented as observed.
2. Generate the four **distinct technical sheet roles** instead of recoloring the same diagram. Use the benchmark page dimensions and an unclipped printable technical title block; do not import former brand templates wholesale.
3. Preserve source-vs-modeled vs-proposed vs-field-verify classifications across geometry, legends, quantities, notes, exported metadata and PDFs.
4. Implement site-specific coordinate transforms and frozen parcel/source hashes, with acceptance tests for address mismatches, scale bars, rotation, parking fit, ADA review placeholders, utility capacity ambiguity and cross-sheet identity.
5. Implement **real visual inspection** at sheet scale and phone review, including label overlaps, source legibility, scale, alignment, dimensions, blank/black placeholders and clipping.
6. Require human/qualified-professional review. A hash or synthetic QA test is never design approval; nothing is marked construction-ready.
7. Use new Evercraft/KSS branding for independent future work. Do not import historical customer lists, parcel data, plan files, deliverables or disputed templates into public product builds.
8. No release, DNS change, external outreach, sales, payment, or deployment from this recovery branch.

## Source evidence / read-only links

- Historical source: https://github.com/jgaethle10/forge-operator/tree/kss-spatial-extraction-20261017
- Original extraction note: https://github.com/jgaethle10/forge-operator/blob/kss-spatial-extraction-20261017/systemia/graphics-command/KSS_EXTRACTION_README.md
- Historical private FS6 reference: preserve in owner Drive; no copy in repository
- Source toolchain recorded in September evidence: Python `pyproj`, `shapely`, and `reportlab` were present on the historical runtime, but are not verified in the current deployment.

## What this does NOT establish

No current production KSS generator, real site plan, licensed imagery pipeline, fresh GIS adapter, live KSS node runtime, visual QA acceptance, construction design, or commercial release is claimed here. Original Python compiler recovery remains the main blocker.

## Next controlled step

Search preserved local Node001/Node002 workspaces and independent owner archives for the five original Python filenames; compare hashes and source history, and reconstruct only components shown to be independently reusable. Separately, stage a synthetic *four-sheet* test fixture with real source-code QA, then replace its geospatial base with independently licensed data. Do not call or depend upon retired third-party hosted applications.
