# Evercraft V4.8 | GitHub recovery review

This is a **non-production source and design review** of five self-contained HTML experiences created while GitHub access was unavailable.

## Pages and source

- `index.html`: overview of illustrative capabilities.
- `ibm.html`: IBM i readiness choices and interactive evidence.
- `findmypart.html`: parts sourcing fit/source evidence exploration.
- `legacy.html`: business continuity and dependency decisions.
- `isaias.html`: **dated historical storm draft**, not live emergency coverage.

The source artifact remains independently backed up in [Google Drive](https://drive.google.com/file/d/1nRNEC-wrPZu8Eu4YkM7UqJiKmliZ7Wl_/view). SHA-256 file inventory is in [source-manifest.json](source-manifest.json). The archived preview filenames were normalized for relative navigation. No production source files were replaced.

## Safety and commerce holds

Visuals and decision routes are **examples**, not results from a real client evaluation. Commercial forms default to local-only inquiry drafts; no inquiry is submitted, payment collected, order created, or service fulfilled by this review branch. The V4.6 private intake service and Systemia handoff are deliberately excluded from the public repository.

Do not deploy, merge, publicize or edit customer data from this artifact. It must be separately admitted into Systemia and reviewed against the existing source branches [#1221](https://github.com/jgaethle10/forge-operator/pull/1221), [#1226](https://github.com/jgaethle10/forge-operator/pull/1226), and [#1225](https://github.com/jgaethle10/forge-operator/pull/1225).

The Isaias brief is a dated example with explicitly unverified impact and no live operational use. Rights-cleared documentary imagery, updated sources, genuine geospatial joins and independent editorial review remain blocked. The review pages do not establish production route, mobile Safari, checkout, or paid-fulfillment proof.

## Local validation

Run `node --test tests/evercraft-offers-v48-review.test.mjs` from repository root. The dedicated workflow is read-only and runs on this review path. Testing the archived HTML is not a publishing certification.

## V4.8.1 review cleanup (October 15)

An offline Chromium pass caught malformed trailing Google Fonts import characters in four commercial page stylesheets and a remaining Google Fonts CSS import in the Isaias draft. These were removed without changing content or customer intake/payment code. New tests reject external stylesheet imports, invalid preludes, missing state controls and reduced-motion regressions. The preserved V4.8 Drive ZIP remains unchanged; this is a subsequent GitHub review revision. All public-release holds remain.
