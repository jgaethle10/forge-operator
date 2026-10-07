# RIVET Hosting Migration Cutover Runbook

Status: dormant until explicit partner approval.

## Phase 0: authority

Do not begin deployment work until the approved hosting lane, domain owner, infrastructure account owner and production operator are recorded.

A general Evercraft execution instruction is not sufficient authority.

## Phase 1: capture

1. Record the approved production URL and DNS state.
2. Record the exact source revision.
3. Preserve the current approved RIVET Brand Kit and repository blob identifiers.
4. Capture desktop and mobile screenshots at agreed breakpoints.
5. Record application inputs, outputs, forms, navigation and report examples.
6. Inventory external dependencies, secrets, databases, files, analytics and integrations.

## Phase 2: staging

1. Build a staging environment on the selected host.
2. Do not point production DNS at staging.
3. Keep the production RIVET environment untouched.
4. Run:
   `node systemia/migrations/rivet-hosting/brand-fidelity-audit.mjs --origin https://STAGING_ORIGIN`
5. Require a pass for exact approved `brand.json` and `brand.css`.
6. Perform pixel-level desktop and mobile comparison.
7. Perform functional parity tests.
8. Confirm no Evercraft design tokens have leaked into the RIVET presentation.

## Phase 3: infrastructure proof

Prove before cutover:

- TLS validity;
- redirect behavior;
- health endpoint or equivalent;
- deployment rollback;
- data backup;
- restore from backup;
- observability;
- alert ownership;
- secret rotation;
- capacity expectations;
- incident contact;
- external dependency failure behavior.

## Phase 4: DNS preparation

1. Record authoritative DNS provider and account owner.
2. Record current A, AAAA, CNAME, TXT and mail-related records.
3. Reduce TTL only if the partners approve that operational change.
4. Prepare new records without applying them.
5. Preserve the exact rollback record set.
6. Confirm TLS is valid on the target before changing production DNS.

## Phase 5: production approval

The partners review the exact staging build proposed for production.

Approval must identify:

- staging build or release identifier;
- target host;
- domain change;
- expected cutover window;
- rollback condition;
- authorized operator.

## Phase 6: cutover

1. Freeze unrelated RIVET changes.
2. Record pre-cutover health.
3. Apply the approved DNS/routing change.
4. Verify public TLS.
5. Verify RIVET identity and brand assets.
6. Verify core customer paths.
7. Verify reports and integrations.
8. Record external receipts.

## Phase 7: rollback trigger

Rollback immediately if any of the following occurs:

- brand fidelity fails;
- customer path fails;
- report behavior changes unexpectedly;
- TLS is invalid;
- target redirects somewhere unapproved;
- data integrity cannot be verified;
- production health falls below the partner-approved threshold.

Rollback uses the preserved DNS/routing state and prior production release.

## Phase 8: post-cutover

1. Keep the old environment intact for the agreed rollback period.
2. Verify backups from the new environment.
3. Monitor errors, latency and customer flow.
4. Record final ownership and operational contacts.
5. Retire old infrastructure only after explicit approval.

## Required receipt

The final migration receipt must contain:

- partner approval reference;
- source release;
- target release;
- hosting account owner;
- DNS owner;
- pre-cutover state;
- post-cutover state;
- brand-fidelity audit result;
- visual approval result;
- functional parity result;
- backup/restore proof;
- rollback proof;
- external TLS/route verification;
- unresolved risks.
