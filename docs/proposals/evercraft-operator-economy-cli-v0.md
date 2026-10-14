# Proposal: Evercraft Operator Economy + CLI v0

**State:** Proposal and local tested prototype. NOT production released, admitted by Systemia, or merged into main.
**Owner mission:** evercraft-operator-exchange-001-20261014. Related: evercraft-distribution-engine-001-20261012.
**Date:** 2026-10-14.

## Thesis

An operator's problem should find a safe, reusable capability and a trustworthy partner before anyone has to pitch. Evercraft becomes a neutral collaboration surface and one optional technology provider inside the exchange, not a paywall over human relationships.

## Distribution stack

1. **GitHub + Evercraft CLI:** open developer documentation, versioned manifests, basic local MCP stdio registrations, explicit opt-in invocation, test fixtures and reviewable integrations.
2. **Fabric:** public-safe machine and human capability directory, semantic match, verified URL and MCP health, supply-side certification, authorization and receipts. No claims of 24/7 health without current evidence.
3. **Operator Exchange / Socius:** public searchable collaboration threads, opt-in member identity, verified capability pages, introductions and projects with proper moderation and privacy. Existing Socius application is scaffold-level, not a functioning community.
4. **Discord and Facebook:** distribution and support channels. Use genuine member content with platform-specific consent, no unauthorized automation, scraping, cold DMs or deceptive seeding. Discord for live build rooms / integration office hours / issue triage; Facebook for business-owner problems and community proof.
5. **Skool (optional later):** cohort education, operator courses and premium community only if enough demand exists to justify fees. Do not require paid Skool membership for basic participation.
6. **Evercraft Payments:** explicit commercial terms, user-confirmed checkout, provider-verified payment, signed fulfillment receipts and transparent fees/refunds. Neither a checkout URL nor an invoice is revenue proof. Fees or revenue share only when agreed and attributable to simply verifiable incremental results.

## Developer preview CLI

A separately packaged Node.js 20+ local developer preview is now committed at `packages/evercraft-cli/`. The proposed commands are (run from that directory with `node cli.mjs`, until an approved package release exists):

```sh
evercraft doctor
evercraft tool add ./manifest.json
evercraft tool list
evercraft tool inspect example.math
evercraft tool probe example.math --run
evercraft tool call example.math sum --input '{"a":2,"b":5}' --approve
```

Local test result: four tests passed, including local stdio handshake, discovery and approved invocation. **The code and automated tests are now committed to the draft proposal branch, with a read-only GitHub Actions CI workflow.** Local prototype tests passed previously; the precise submitted branch must pass its own CI before confidence is upgraded. No npm publication or production installation is claimed.

Security model: local manifest registration alone runs nothing. Local execution is expressly opt-in, process env is minimized to avoid forwarding secrets, shell expansion is disabled, and time/output are bounded. This is not sandboxing, signed artifact verification or production-grade isolation. Tool outputs are untrusted. Credentials are never printed or embedded in public manifests.

Compatibility: preview MCP stdio handshake version 2025-11-25 only. Prior to production adoption implement/tests for the 2026-07-28 MCP spec, schema validation, list pagination, real authorization, secret handling, revocation, static analysis, trust labels, scoped consent, logs and rollback. Remote tool installation and arbitrary untrusted executables stay blocked.

## Partner marketplace lifecycle

**Problem -> Candidate capability -> Independent working proof -> Partner agreement -> Approved order -> Verified fulfillment -> Attribution -> Settlement.**

Community utility is free. Revenue sources could include per-call licensing, prepaid integrations, implementation retainers and a contractually agreed percentage of eligible attributable transactions. DO NOT infer transactions, partners, revenue or paid listings from directory entries.

Example attribution: a partner selects a simple baseline and a unique tracked order/integration route, sees a human-readable report, and consents to percentage terms *before* anything is billed. If impact cannot be credibly explained and verified, Evercraft claims no revenue share.

## P0 release acceptance gates

- Canonical Systemia admission/dedupe + owner and exact accepted work scope.
- Public repo code review; reproducible clean-room CLI install on Windows/WSL, macOS, Linux. No access to internal credentials.
- Probe two independent MCP servers (including one non-Evercraft contributor) and one failure case; prove authorization and side-effect holds.
- Verified member join, create/read/reply/report, accessibility/mobile experience and moderator action.
- Fabric endpoint recovery and independent public authenticated/anonymous readback; previously an MCP SSE connection probe returned 404 from openai.org, so no live interoperability claim yet.
- Checkout and commerce gates: canonical URL, explicit price, payment authority, transaction settlement evidence and fulfillment; prohibit public Buy Now until proven.
- Partner terms, privacy/licensing, security process and anti-spam controls.
- No public fanfare or autopublishing unless all relevant release gates pass.

## First 30-day commercial evidence (targets, not achievements)

Week 1: admission + CLI smoke tests + channel roles + operational Fabric health.
Week 2: opt-in operator alpha with verified member profiles and genuinely usable non-commercial discussions.
Week 3: independent developer integration and one shareable working demonstration, test honest README and docs.
Week 4: first permissioned partnership pilot with explicit contract and observable fulfillment; measure conversion, not signup counts.

**Decision:** Reuse Forge and Socius; avoid another parallel core. The CLI source, example and tests are available for review on the draft branch. Canonical Systemia admission, merging, publishing, production remote Fabric connections, commercial payments, operator onboarding and external distribution are still gated.
