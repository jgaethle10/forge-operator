# Partner Brief: RIVET Hosting Without Rebranding

## The decision

RIVET can move hosting without changing what customers see.

The hosting provider, server ownership, deployment system and backend architecture are separate from the RIVET brand. If the partners choose to move RIVET, the approved Brand Kit remains frozen unless a separate RIVET change is explicitly approved.

## What stays the same

A hosting-only migration preserves:

- RIVET identity and logo rules;
- approved colors;
- approved typography;
- light and dark theme behavior;
- wording and navigation;
- page structure;
- reports and customer flows;
- desktop and mobile presentation.

The migration is considered successful only if the moved version matches the approved RIVET experience.

## Three practical choices

### Evercraft-operated

Evercraft can operate the hosting stack and connect it closely to Systemia and approved AliEV services. The underlying hosting control plane already has health-gated release promotion and rollback proofs.

Before this is a production option, the partners should require RIVET-specific external reliability, backup, recovery, DNS/TLS and operational-support proof.

### Partner-owned managed hosting

The partners can own the hosting account and bill directly with a provider such as DigitalOcean, AWS or Vercel.

This creates a very clear ownership boundary: the partners control the customer-facing infrastructure while Evercraft can still provide approved software or intelligence services.

### Hybrid

The partners own the RIVET domain and public frontend. Evercraft operates only the backend intelligence services the partners explicitly authorize.

This gives the partners strong brand and infrastructure control while keeping Evercraft's intelligence work replaceable and contract-bound.

## Current cost examples

As of 2026-10-07:

- DigitalOcean App Platform dynamic containers start at $5/month, with a 1 GiB fixed instance at $10/month and a 2 GiB shared instance at $25/month.
- AWS Lightsail Linux bundles start at $5/month, with 1 GB at $7/month and 2 GB at $12/month.
- Vercel Pro lists at $20/month with $20 of included usage credit.

These are infrastructure starting points, not final RIVET operating budgets. Database, storage, backups, bandwidth, observability and support requirements can change the total.

## The protection mechanism

Before any production move, Evercraft can provide a staging URL and run the migration fidelity audit against the approved Brand Kit.

The core brand assets must match exactly. A separate desktop and mobile visual approval is still required before cutover.

## The question for the partners

The partners do not need to decide whether RIVET should "become Evercraft."

It does not.

They only need to decide who they want operating the infrastructure underneath the RIVET brand.
