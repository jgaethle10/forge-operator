# Saban Adversarial Hosting Review

Receipt date: 2026-10-07

Source receipt:
- Workflow: RIVET Hosting Migration Planning Gate
- Run: 37654505584
- Artifact: rivet-hosting-migration-planning-receipts
- Artifact digest: sha256:2e7688a6c3b100bfb2cd471553a38f05096a67fce0a3797d4a42fa5204c6e5b7
- Saban results digest: sha256:e57e01558e80954f2972ca0d5f2bb0218ecac2309c7770b0aa3223b75b491004

## Coverage

Saban executed 45 bounded review assignments:

- 5 hosting options
- 9 review roles per option
- 45 completed
- 0 dead letters
- completion ratio 1.0
- quality gate: pass

Roles:

- brand guard
- partner-control guard
- reliability guard
- cost guard
- rollback guard
- portability guard
- security guard
- data-authority guard
- infrastructure skeptic

Production mutation, RIVET mutation, DNS changes, external network action, checkout and payment obligation were all denied by the planning contract.

## Findings by lane

### Evercraft-owned Fabric / Compute

Findings:
- P1: partner-approved RIVET public reliability is not yet proven.
- P1: owned stack maturity needs RIVET-specific external route, uptime and recovery evidence.
- Review: partners would delegate hosting-account control to Evercraft.
- Review: Evercraft operating cost is not yet measured well enough to call it free or cheaper.
- Review: security, backup/restore and incident ownership must be proven.
- Review: backend data authority must be explicit.

Planning interpretation:
The control plane is technically interesting and rollback behavior is already proven, but this lane should not be promoted as the default production answer yet.

### Partner-owned DigitalOcean App Platform

Findings:
- Review: provider availability does not prove this RIVET deployment.
- Review: security, backup/restore and incident ownership remain cutover gates.
- Review: a purchasable provider does not mean RIVET is configured or recoverable there.

Planning interpretation:
No P1 architecture gap was identified by this review. It remains a strong simple managed-hosting candidate if the partners want direct account control.

### Partner-owned AWS Lightsail

Findings:
- Review: provider availability does not prove this RIVET deployment.
- Review: security, backup/restore and incident ownership remain cutover gates.
- Review: a purchasable provider does not mean RIVET is configured or recoverable there.

Planning interpretation:
No P1 architecture gap was identified by this review. It offers predictable low-cost infrastructure, with more operational responsibility than a managed PaaS.

### Partner-owned Vercel Pro

Findings:
- Review: provider availability does not prove this RIVET deployment.
- Review: platform coupling should be evaluated.
- Review: security, backup/restore and incident ownership remain cutover gates.
- Review: a purchasable provider does not mean RIVET is configured or recoverable there.

Planning interpretation:
No P1 architecture gap was identified, but portability deserves extra attention before choosing this lane.

### Hybrid partner-owned frontend + Evercraft backend

Findings:
- Review: split operational authority must be documented.
- Review: provider availability does not prove the deployment.
- Review: a versioned replaceable backend contract is required.
- Review: security, backup/restore and incident ownership remain cutover gates.
- Review: Evercraft backend data authority must be explicit.

Planning interpretation:
No P1 architecture gap was identified. This lane has more governance work, but it creates the cleanest separation between partner control of the RIVET public brand and Evercraft control of approved intelligence services.

## Current planning read

This review does not select a host.

For the partner conversation, the cleanest shortlist is:

1. Partner-owned managed hosting when the partners prioritize direct control and simple accountability.
2. Hybrid when the partners want direct RIVET frontend/domain control while still using Evercraft intelligence.
3. Evercraft-owned hosting only after the RIVET-specific reliability, recovery, operating-cost and governance gaps are closed.

DigitalOcean currently looks operationally simple. AWS Lightsail currently looks inexpensive and portable but more hands-on. Vercel currently looks convenient for preview/review workflows but carries more platform-coupling concern.

The final choice remains a partner decision.
