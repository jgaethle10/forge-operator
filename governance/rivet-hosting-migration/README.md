# RIVET Hosting Migration Decision Package

Status: planning only. No RIVET migration authority is granted by this package.

## Purpose

This package lets the RIVET partners choose where RIVET should run without turning hosting into a redesign.

The approved RIVET brand remains the source of truth in every hosting lane. Infrastructure may move. RIVET does not change unless the partners separately approve a RIVET change.

## Existing approved brand authority

The repository already enforces the approved RIVET brand system through:

- `public/rivet/brand.json`
- `public/rivet/brand.css`
- `tests/rivet-brand.test.mjs`
- `governance/RIVET_CHANGE_CONTROL.md`

The current Brand Kit contract includes:

- RIVET as the canonical customer-facing identity
- Brand Kit Vol.1
- Bone as the default light surface
- Midnight dark mode
- Neon `#62D134`
- Deep Cobalt `#1F4AAB`
- Midnight `#0B1424`
- Bone `#F5F2EA`
- Slate `#64748B`
- Open Sauce for headings
- Public Sans for body copy
- "Locate. Assess. Decide." as the approved process line

This migration package reads those assets. It does not modify them.

## Hosting lanes

The machine-readable comparison is in `decision-matrix.json`.

Supporting planning artifacts:
- `SABAN-REVIEW-2026-10-07.md` records the bounded adversarial review receipt and current planning read.
- `ownership-matrix.json` captures who must own or control each operational asset.
- `visual-baseline-plan.json` defines the partner-gated screenshot capture plan without inventing an approval tolerance.
- `CUTOVER-RUNBOOK.md` remains dormant until explicit approval.

The five lanes are:

1. Evercraft-owned Fabric / Compute.
2. Partner-owned DigitalOcean App Platform.
3. Partner-owned AWS Lightsail.
4. Partner-owned Vercel Pro.
5. Hybrid partner-owned RIVET frontend with explicitly approved Evercraft intelligence services behind it.

No lane is pre-selected.

## What is already proven on the Evercraft side

The existing Evercraft hosting control-plane proof demonstrates:

- immutable release references;
- candidate health gates;
- failed-candidate preservation of the active service;
- blue-green promotion;
- rollback;
- reconciliation after runtime loss;
- stable-route contracts;
- secret material rejection;
- receipt generation.

Those proofs do not constitute permission to host RIVET and do not prove a partner-approved public RIVET production route. That remains a separate approval and external verification gate.

## Brand-fidelity gate

`systemia/migrations/rivet-hosting/brand-fidelity-audit.mjs` is read-only.

Without a target URL, it validates the approved local baseline.

With `--origin https://staging.example.com`, it verifies:

- target uses HTTPS;
- exact `brand.json` bytes;
- exact `brand.css` bytes;
- canonical RIVET title;
- approved process line;
- required brand asset references;
- absence of retired or joined identities;
- no cross-origin redirect hiding behind the target.

It intentionally does not claim pixel-level visual parity. Pixel-level desktop and mobile review remains a separate mandatory gate before cutover.

## Decision rule

The partners should choose based on control, reliability, operational ownership, cost and portability.

A useful default interpretation:

- Choose Evercraft-owned hosting if the partners want Evercraft responsible for production operations and the reliability gates are proven to their satisfaction.
- Choose partner-owned managed hosting if the partners want direct account, billing and infrastructure control.
- Choose hybrid if the partners want direct control of the RIVET public surface while using Evercraft intelligence behind a versioned contract.

## Non-negotiable cutover gates

No production cutover until all of the following are true:

1. Hosting lane explicitly approved.
2. Domain and account ownership documented.
3. Staging deployment exists.
4. Core brand-fidelity audit passes.
5. Desktop and mobile visual review passes.
6. Functional parity passes.
7. Backup and recovery proof passes.
8. DNS and TLS plan is approved.
9. Rollback is proven.
10. Exact production build is approved for cutover.

## External pricing references

Pricing was checked on 2026-10-07 against official provider pages:

- DigitalOcean App Platform: https://docs.digitalocean.com/products/app-platform/details/pricing/
- AWS Lightsail: https://aws.amazon.com/lightsail/pricing/
- Vercel: https://vercel.com/pricing

Provider pricing can change. Recheck before the partners make a financial commitment.
