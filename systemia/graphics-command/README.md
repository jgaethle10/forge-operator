# Evercraft Graphics Command

Evercraft Graphics Command is the art-direction layer between evidence-rich products and Evercraft's rendering stack.

It does not replace Visual Desk, Fallen, World Engine, or Clip. It forces them to behave like one visual system:

```
Systemia / Radar / FAIE / TOWI / Journal / RIVET / AliEV
  -> Graphics Command
  -> Fallen Creative Council + visual strategy exploration
  -> Shot Tournament
  -> Fallen Visual Stage / World Engine
  -> exact-frame render workers
  -> Visual Desk owned page
  -> Evercraft Clip
```

The first contract is intentionally narrow:

- select a visual treatment from a source-backed Visual Story;
- make the hero visual lead on mobile;
- keep metadata and audit receipts out of the initial visual payoff;
- emit 4:5, square and 9:16 composition targets;
- emit a Fallen world-intelligence stage input using the same evidence/source lineage;
- treat governed geographic polygons and georeferenced terrain rasters as first-class visual primitives;
- verify cached terrain bytes against their source receipt and SHA-256 before render;
- carry terrain rights, bounds, source references and digests through Graphics Command, Fallen, Visual Desk and production canaries;
- require deterministic motion treatment;
- fail a scroll-stop gate when typography, visual dominance, provenance or multi-format readiness are not good enough.

The Washington volcano specimen uses a cached USGS The National Map / 3DEP shaded-relief raster. Runtime rendering never depends on a live terrain fetch: the governed source raster is admitted once, hashed, rights-stamped, and then verified locally on every build. The `cinematic-terrain-geography-v3` poster contract rejects the legacy node-diagram grammar, including peak halos and high-emphasis connector spines.

## Shot Tournament

Graphics Command does not ship the first technically valid composition. The Visual Desk build creates three deterministic candidates before canonical poster rendering:

- **Terrain Hero** prioritizes recognizable physical geography and suppresses route prominence.
- **Balanced Relief** keeps the established terrain/marker/evidence balance.
- **Cascade Signal** makes the evidence path more legible while preserving the geographic frame.

Every candidate is measured in feed, square, and story formats. Any collision or safe-margin rejection is a hard tournament loss. Eligible candidates are ranked deterministically on terrain fit, route restraint, marker restraint, and region-label restraint. The winning candidate ID and digest are written to `shot-tournament.json`, the Visual Desk manifest, poster-quality receipt, and Clip handoff.

The portable build also emits candidate feed/story SVGs for human QA. Terrain-backed candidate SVGs reference the single governed local terrain asset instead of duplicating the raster payload. The canonical poster still embeds the governed terrain bytes and preserves the exact source SHA-256.

The tournament is an art-direction and selection layer only. It never changes evidence coordinates, source lineage, rights state, or publication authority.

The tournament report schema is `evercraft.graphics-command.shot-tournament.v1`; the canonical poster records the winning strategy in `data-shot-strategy`, making the selected visual grammar machine-verifiable as well as human-reviewable.


Rendering does not grant publication authority.


## Private Saban work-state visual proof (review-only)

The work-state proof viewer reuses Saban's **existing** `evercraft.saban.work-state.v1` and
`evercraft.saban.scheduler-receipt.v1` formats. It does not require a new
runtime, agent, service, dashboard, provider, or public API.

An authorized local operator can create an **offline**, read-only HTML
snapshot through the **scoped operator intake** command documented below.
The direct `saban-work-visual.mjs` CLI is limited to
`synthetic_test` fixtures; it refuses private operator mode without the
explicit source directory scope. Never use a synthetic fixture to claim
a real customer completed work.

The output must be new and private, outside the repository and public web
tree. Keep resulting HTML in a local access-controlled working area.
Its source SHA-256 digest and timestamp are **not independent execution
attestation**.

The renderer outputs aggregate queued, leased, completed and dead-letter counts,
checkpoint and retry counts, and anonymous state marks. The original work
payloads, role names, agent IDs, worker identities, job IDs, error strings and
private paths are never included in the HTML. When there are more than 48 jobs,
the marks represent the state distribution rather than individual jobs; the
printed counts remain exact.

A work-state file reports the latest known state, not an audit history. The
viewer does **not** invent event transitions, live status, actual human workers,
verified signatures, user permissions, or independent customer fulfillment.
No JavaScript, remote network requests, social distribution or publication
authority is present in the output.

Run source-contract tests and generate an entirely synthetic test specimen:

```bash
node --test systemia/graphics-command/saban-work-visual.test.mjs
node systemia/graphics-command/saban-work-visual.specimen.mjs \
  artifacts/saban-work-visual-specimen
```

The CI workflow `saban-work-visual.yml` checks actual 1280px and 390px
Chromium renders, stores screenshots and an artifact receipt, and preserves
only deliberately synthetic test specimens. Production use requires separate
Systemia approval and an authenticated, privacy-reviewed receipt acquisition
path. **This module does not fetch production data or publish anything.**

### Local operator intake (no server, no upload)

Use the scoped intake wrapper for an already authorized Saban work-state JSON
file on the machine where it resides:

```bash
node systemia/graphics-command/saban-work-operator.mjs \
  --authorized-root "/absolute/private/saban-state-directory" \
  --snapshot "/absolute/private/saban-state-directory/work-state.json" \
  --review-root "/absolute/private/graphics-reviews" \
  --filename "saban-review.html"
```

The wrapper reads exactly **one** local file inside the explicitly supplied
source directory using ordinary operating-system permissions. It rejects
symlinks, paths outside the selected source root, non-files, oversized inputs,
and attempts to write inside the project/public tree. It creates the private
HTML review file with exclusive creation and restricted permissions. No
processes, network calls, customer uploads, auth changes, data transfer,
worker scheduling, payment, or public publishing occur.

**The directory selection is a local operator scope, not an independent identity
check or authorization grant.** Only inspect files you already have permission
to read. Do not copy private source snapshots into GitHub, public Pages, chat,
or unapproved shared storage.

The generated review shows when it was inspected locally and evaluates the
**source-reported** Saban `updated_at` timestamp. More than 15 minutes old
is labeled **OLDER SNAPSHOT**; a source timestamp more than five minutes
ahead of the local clock is labeled **SOURCE CLOCK WARNING**. A recent-looking
timestamp is not proof of a fresh agent heartbeat or successful execution,
and an archived HTML review never becomes a live dashboard.

Verify the wrapper alongside the state projector:

```bash
node --test systemia/graphics-command/saban-work-operator.test.mjs
```

### Finite local Saban observation strip

To compare more than one **actual local file snapshot** without enabling a
network listener or private file upload, use the bounded operator observer:

```bash
node systemia/graphics-command/saban-work-observe.mjs \
  --authorized-root "/absolute/private/saban-state-directory" \
  --snapshot "/absolute/private/saban-state-directory/work-state.json" \
  --review-root "/absolute/private/graphics-reviews/new-review-session" \
  --samples 3 --interval-ms 1000 --prefix saban-observed
```

This runs **exactly 3 local reads** at a one-second interval and finishes.
Supported bounds are 2–12 samples and 500–30,000 ms between reads. This is
not a daemon, job executor, telemetry endpoint or live agent feed. It produces
a series of private HTML snapshots and a final
`saban-observed-observations.html` report, all with exclusive creation and
restricted file permissions. Choose a new private review directory for each
session. The file must already exist and be readable with the operator's
existing operating-system permissions.

The observation strip compares **net aggregate state changes** and
source-byte digests. It cannot prove that every intermediate Saban lease,
completion or failure was observed, or that the input file is independently
attested. An unchanged digest means only that the sampled file bytes were
unchanged at those reads. Timestamps are still source-reported, and stale
or future source clock warnings remain visible. No job IDs, assignments,
roles, customer work, error messages, worker IDs or private source paths
enter the report.

No data is sent to the network, cloud, GitHub, ChatGPT, or a public page.
Run this only on an Evercraft node you control and on private state files
you are authorized to inspect. Do not place any generated operator output
under `public/` or commit it. An actual Node001/Node002 capture is **not**
established merely by passing the synthetic CI tests.

```bash
node --test systemia/graphics-command/saban-work-observe.test.mjs
```

The GitHub Actions visual QA uses a separate explicitly labeled synthetic
Saban state-machine specimen at desktop and 390px mobile widths. Synthetic
screenshots are safe for review; real operator snapshots stay private.
