# Evercraft government-provider intake preflight (candidate)

Owner mission: [#1610](https://github.com/jgaethle10/forge-operator/issues/1610). Reuse existing owned Browser Worker deployment gate [#531](https://github.com/jgaethle10/forge-operator/issues/531). Do not use TinyFish or other third-party browser-automation fallbacks.

This is an **offline, no-side-effect** preflight contract for Washington WEBS, PWSBE, MRSC Vendor, and DSHS HRSN home remediations. It does not create an account, browse a site, save a draft, sign, submit an application, or send a claim to an agency. Application portals that redirect to a different form host must undergo explicit source verification and separate authorization. No generic host allowlist bypass is permitted.

## Inputs and protections

Accepts a target ID, exact agency URL, Systemia mission ID, hash references for separately verified evidence, allowed nonsensitive draft field **names**, and `free_only:true`. Does not accept field values, owner financial facts, tax IDs, bank routing, SSNs, passwords, identity, attestations, screenshots or client details. The hash reference is a lookup, not proof of the underlying fact. An independently reviewed private evidence record is required before marking a key verified.

The output **does not** claim portal browser access, draft save, submission, agency acknowledgement, payment or approval. `quarantinePortalReceipt` stores an alleged receipt digest without upgrading the application's true external state. Any verified external state transition belongs to a separately permissioned, independently audited Systemia receipt service.

## Local test

`node --test systemia/procurement/provider-intake.test.mjs`

## Integration gates

1. Canonical Systemia intake dedup and explicit authorized mission/worker admission. An issue or PR is not a Saban dispatch.
2. Verified owned Yard/Evercraft Compute browser lease, signed identity, and actual live external canary. CI proof alone is not a production edge.
3. Owner signs into the official portal via the first-party **ephemeral human browser handoff**. Reuse `systemia/evercraft-web/browser-worker/authenticated-handoff.mjs` and `delegated-session-policy.mjs`; never create a parallel session implementation.
4. Only owner-granted, same-origin, nonsensitive draft filling, subject to existing delegated control checks. If there is no true Save Draft button, stop. An agent never acts as legal signatory or clicks final Submit.
5. Final filing, statutory certifications, identity, taxes and banking require owner action through the official private portal.
6. Read portal-issued receipts with independent evidence validation, then distinguish `inquiry_sent`, `preflight_ready`, `draft_saved`, `submitted`, `acknowledged`, `approved`, `award` and `paid`. No phase inherits proof from an earlier one.
7. Enforce contractor-licensing, work-scope insurance, relevant experience, background checks, staffing and financial stewardship before representing HRSN eligibility. Avoid taking work involving regulated hazards without specialists and coverage.

This candidate source change is not a production deployment, official application, agency acceptance, or legal certification. Sensitive proofs stay in secure private systems, **never** in a public GitHub ticket or this module.
