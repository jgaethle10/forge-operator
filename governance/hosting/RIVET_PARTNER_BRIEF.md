# RIVET Hosting Options - Partner Brief

Status: **FOR DISCUSSION - NO CHANGE HAS BEEN AUTHORIZED**

## What we are deciding

Only the hosting/operating model.

We are **not** proposing a redesign or product change. RIVET's approved brand, UI, wording, reports, customer flows, mobile behavior, and product logic remain frozen unless the partners separately approve a change.

## Option A - Evercraft operates the RIVET infrastructure

Evercraft would operate hosting, deployment, monitoring, backups, security controls, and the approved supporting intelligence stack.

Why choose it:
- tight integration with AliEV;
- high operational control;
- potentially low incremental infrastructure spend if verified spare capacity exists;
- fast deployment and recovery tooling already exists in the Evercraft stack.

What must be proven first:
- real spare capacity;
- independent failure domains;
- offsite backups;
- tested restore;
- partner-visible access and receipts;
- clear credential and ownership rules.

## Option B - RIVET uses its own commercial/managed hosting

RIVET or the partners own the provider account. Evercraft can still deploy and maintain the software if authorized.

Why choose it:
- clearest infrastructure independence;
- predictable provider billing;
- mature managed backup/TLS/monitoring options;
- easier replacement of the infrastructure operator.

Tradeoff:
- recurring provider cost;
- less direct integration with Evercraft-owned runtime components;
- provider lock-in varies by service.

## Option C - Hybrid

RIVET's customer-facing product is hosted in a partner-controlled environment. Evercraft operates AliEV and approved intelligence services behind an authenticated interface.

Why choose it:
- strongest separation between RIVET product governance and Evercraft intelligence;
- AliEV can evolve without automatically changing RIVET;
- public hosting can move later without moving the intelligence layer;
- reduced blast radius.

Tradeoff:
- two operational planes instead of one;
- requires strong API/versioning/monitoring discipline.

## Current planning-level cost examples

These are not quotes and do not include labor.

- Small DigitalOcean-style stack: roughly $32 to $60/month lean, around $100 to $130/month with modest HA components.
- Small Render-style managed stack: roughly $44/month at the low end, around $90/month for a small team production setup, and $115+ as redundant app capacity is added.
- Evercraft-operated cash cost: cannot be honestly quoted yet because we first need a capacity and failure-domain audit. Existing spare capacity might lower incremental spend, but that is not the same thing as zero operating cost.

## How we prevent brand drift

Before any approved migration:
1. capture the currently approved RIVET experience on desktop and mobile;
2. archive approved brand assets and design tokens;
3. create a staging copy;
4. run automated screenshot/token/asset comparisons;
5. show the partners current RIVET vs migrated RIVET;
6. do not cut over if there is meaningful drift.

The first migration gate is intentionally strict. If the approved screenshots do not match, the candidate fails.

## The decision

The partners can choose:
- **A** if they want Evercraft to operate the infrastructure and the reliability audit passes;
- **B** if they want the cleanest independent hosting ownership;
- **C** if they want RIVET hosting independent while Evercraft continues operating AliEV/intelligence.

The current engineering preference for discussion is **C, hybrid**, because it creates the cleanest governance boundary without giving up the AliEV integration. That preference is not a commitment and should change if the partners' ownership priorities point elsewhere.
