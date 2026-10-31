# Evercraft brand identity source register

**Working date:** 2026-10-31  
**Mode:** Internal editorial review. Nothing in this directory authorizes automatic publication, sales, payment, vendor contact, logo replacement, or product-release claims.

This registry solves a recurring failure: portfolio graphics reused unrelated logos, labeled the contact path as the development stage, used red/yellow visual "warnings" to distinguish normal services, and exposed mixed products, modules and historic applications as though all were public finished products.

## Identity source-of-truth

Read [identity-source-register.v1.json](./identity-source-register.v1.json) for asset status and exact source paths. The register confirms existing authored marks for Research, HumanFilter, Work Saban, FindMyPart and AI Boardroom. It **does not** invent a unique logo for Network or ForensiScope. When none is verifiably approved, use the verified Evercraft parent mark, or the product name in text while the parent asset is sourced.

**Never call a feature-icon a logo.** An unrelated product's emblem is not an acceptable substitute. Do not restyle original source vectors or build lookalike marks and claim approval.

## Three independent truth fields

1. **Build activity:** active engineering, active investigation, prototype, pilot, paused, or unverified. Requires source/dated evidence and is not inferred from marketing copy.
2. **Customer access:** public self-service, desktop beta, quote/intake, private pilot, unavailable, or unverified. Requires a current functional buyer route and precise capability boundary.
3. **Commercial state:** free, quoted human service, processor-verified paid checkout, or unverified. Checkout start, repository code, or a public page is not payment proof.

Partner-rights clearance is a fourth independent **hard gate**. Do not treat a historically public discovery record as current authority to put it on a marketing graphic. Use **positive editorial allowlisting** for public materials, not every name in the machine directory.

## Publication compiler requirements

A social carousel, public site page, ad, or branded video must fail closed unless every included record has:

- exact approved display name and canonical parent/sub-brand relationship;
- source link to the approved original logo, or verified parent brand mark;
- truthful product capability and one-sentence boundary;
- independently verified build/activity and customer-access fields;
- rights and distribution approval;
- a date-stamped editor signoff for public inclusion;
- per-slide textual status, all in the **same neutral ice-blue badge style**;
- zero fake warning-color legends, zero "INQUIRY" / contact-method stages, zero internal notes such as "missed favorites."

The internal inventory includes public product records, machine capabilities, operational modules, and historical application notes, often under alias names. Count those **separately**. A merged inventory name is not a distinct commercially available product.

## Brand architecture direction

- **Parent:** Evercraft
- **Platform umbrellas:** Systemia, Evercraft Fabric/CHUM, Evercraft Network, Raven Nexus, Evercraft Worlds
- **Customer products/services:** Evercraft Research, HumanFilter, Work Saban, ForensiScope, FindMyPart, AI Boardroom, Fallen Studios, Evercraft Property Services
- **Families:** EverMaps / evidence atlases, EverNest, BuildFlow, EPS operations
- **Engineering programs:** Black Box, Spider Society, File Ferry, TimeWalk (source evidence and distinct identities need further review)

The above is a *review taxonomy*, not confirmation that all names are available for purchase, currently executing, or approved for public promotion.

## Next source-validation queue

1. Verify and retain Evercraft's parent source vector/lockup before using as fallback.
2. Source unique marks, if any, for Evercraft Network and ForensiScope; never borrow another product mark.
3. Validate the identity of Fallen Studios vs Commercial Studio and track customer-facing service boundaries.
4. Normalize aliases and relationships in a machine-readable product inventory, keeping restricted partner projects out of automatic promotional candidates.
5. Generate the next carousel **from the approved machine register** instead of manual label and icon edits.

Source evidence: `public/research/assets/research-mark.svg`, `public/humanfilter-beta/assets/shield.svg`, `public/work-saban/brand/work-saban-mark.svg`, `public/findmypart/brand/mark.svg`, `public/mesh/ai-boardroom/crest.svg`, `registry/evercraft-network/README.md`.

**Maintainer boundary:** This is an additive draft. It changes no public website, deployment, checkout, rights record, or canonical product directory.


## Executable internal portfolio preview (October 31)

The source-controlled 20-workstream review manifest lives in `docs/brand/review-workstreams.v1.json`. It is **not** the 255-record historical inventory, and it is **not** an independent inventory of 20 commercial product launches.

From the repository root:

```sh
node scripts/brand/compile-review-wall.mjs --output tmp/evercraft-brand-review.html
node --test tests/brand-identity-registry.test.mjs tests/brand-review-wall.test.mjs
```

The offline HTML uses original SVG files **only when their exact file paths are verified** in `identity-source-register.v1.json`. An identity without a verified logo gets a neutral Evercraft *letter placeholder* rather than an invented child logo. The existing public website is unchanged.

The renderer rejects SkyOps, RIVET and AliEV promotional entries, duplicate workstream keys, repeated logo file paths across separate brands, missing verified assets, and attempts to set the reviewed list to published. The status labels use plain subdued language rather than colored warning hierarchies; no false color legend is created.

`--public` **deliberately fails**. Public rendering is not supported until an independently checked approval manifest with rights, availability, ownership, and editorial signoff is implemented. No scheduler or existing GitHub publication job is authorized by this file.

## Founding brand standards: source governance

The original **June 2026 Evercraft Brand Standards Manual v1.0** is an internal, confidential visual reference. It specifies an institutional ground of Core Black (#0B0B0B), Titanium (#B7BDC5) and a restrained Champagne Gold (#B79A56), with Electric Ice Blue (#4FB8FF) reserved for technology-facing contexts. The described original mark uses three ascending forms with an open continuity arc. The brochure is not an approved vector asset; its artwork must **not** be traced, hallucinated, restyled, or declared the final mark. These decisions are tracked as machine-readable review rules in [design-governance.v1.json](./design-governance.v1.json).

An unverified identity gets a **textual Evercraft endorsement**, not a fabricated E logo or someone else's product mark. Verified child marks may preserve their individual palettes; the institutional parent palette is not a demand to erase child brand identities.

## Existing discovery exposure: read-only audit

The older discovery surface still contains partner-held names. On October 31, a direct source check found the following string mentions (not distinct products):

| Discovery file | SkyOps Parking | AliEV | RIVET |
|---|---:|---:|---:|
| `public/.well-known/evercraft-products.json` | 3 | 7 | 12 |
| `registry/public-products.json` | 5 | 6 | 0 |
| `registry/catalog.json` | 3 | 7 | 6 |

These are **source text references**, not evidence of current live website exposure or independent buyers. Do not create new promotional material from those records. Run `node scripts/brand/audit-public-discovery-exposures.mjs` for a broader read-only snapshot; `--strict` flags the still-unresolved legacy references. This draft deliberately does **not** rewrite or delete older public discovery assets without a reviewed generator-level fix and rights check.

## Catalog reconciliation | source-derived, review-only

The legacy machine directory and brand workstream system are separate. The primary older product directory (`public/.well-known/evercraft-products.json`, dated **2026-10-14**) contains 69 product-key records. That is **not** 69 released products. The aligned product index has 69 keys; the agent registry subset has 45.

The [explicit crosswalk](./catalog-crosswalk.v1.json) links **12** of those 69 records to the 20 working brand families, places **2** historical product keys under a partner/restriction hold, and leaves **55** for individual product-brand classification. RIVET appears in older AliEV relationships/aliases rather than as its own top-level product key in that particular 69-record snapshot. These counts are measured against dated source files and can legitimately change as new catalogs are adopted.

For local, internal review only:

```sh
node scripts/brand/reconcile-product-catalog.mjs --out tmp/evercraft-catalog-review.json
node scripts/brand/compile-review-wall.mjs --output tmp/evercraft-brand-review.html
node --test tests/brand-*.test.mjs
```

The catalog reconciliation emits a local JSON file and companion Markdown worklist. Neither is sent to a web server. The CLI refuses `--public` and `--publish`; the portfolio renderer also refuses public mode. Even a verified original logo is **not** proof of customer access, payment readiness, product release, or rights to publish the portfolio.

The PR-only [Brand Registry Review workflow](../../.github/workflows/brand-registry-review.yml) exercises the real source-backed tests and produces only temporary internal files in the GitHub runner. It has no deployment, checkout, upload, or public artifact step.
