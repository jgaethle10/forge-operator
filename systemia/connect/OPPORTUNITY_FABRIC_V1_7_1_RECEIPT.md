# Opportunity Fabric v1.7.1 | Revalidation + executable routing proof

Date: 2026-10-07

## Checkpoint receipt

- Base44 app: `6ab85d74fe2093703c6247e0`
- Existing Opportunity Fabric source runtime: `evercraft-opportunity-fabric-runtime-v1.7.0`
- Initial source/checkpoint: `6ac6fb8c71f49b897f3a23f5` / `4b8a7cc4a1b450dcab1a3c036851da12fbf09e96`
- **Final v1.7.1 checkpoint including README doctrine:** `6ac6fbe16d29ae742985ddbf`
- **Final checkpoint commit:** `136cb1a99ed4388266ac03b91785e6fdc68c323b`
- Subsystem change level: v1.7.1 behavioral hardening; the runtime's `VERSION` constant remains v1.7.0 and this receipt does not pretend otherwise.

## Real runtime-handler behavioral tests

Added `tests/opportunity_fabric_connect_runtime_behavior_test.mjs`. It compiles the trusted runtime's existing TypeScript handler, intercepts its Deno request handler, and exercises it with an isolated mocked authenticated Base44 service-role data store. This is more meaningful than string-pattern-only security assertions, but is NOT a hosted production API test.

All eight tests pass:
1. Safe metadata only, held/DNC candidates excluded, no outreach and no public marketplace creation.
2. Other user cannot route the owner's private case.
3. Held or DNC source cases cannot route.
4. Unknown capabilities remain unmatched.
5. Deterministic repeat planning reuses suggestions instead of duplicating them.
6. Approval is denied if source case becomes held/DNC after matching.
7. Approval is denied if selected private relationship becomes DNC after matching.
8. Permitted human approval records the suggestion decision and still creates no outreach.

## Actual source security fix

`decide_connection_proposal` now re-fetches and validates, on `Approved`:
- the owning `ConnectCase` is still owner-controlled, active, not held, and not DNC;
- a `ConnectNode` proposed match remains owner-controlled, active, not held, and not DNC.

Existing `Passed`/ `Closed` disposal remains possible for old proposals even after a hold. Approval also performs checks before idempotent replay, so an old `Approved` suggestion cannot act as standing permission to proceed after a hold.

## Build gates

`package.json` now runs behavioral tests during the normal production build and includes a separate `npm run test:connect` command.

Executed and revalidated after the README update, before the final checkpoint:

```text
npm run test:connect
  8 tests passed; 0 failed
  OPPORTUNITY_SECURITY_PASS

npm run build
  OPPORTUNITY_FABRIC_AUTHORITY_CONTRACT_PASS
  8 tests passed; 0 failed
  vite build: success
```

Nonblocking warning: old Browserslist/caniuse-lite data.

## Limits and next gates

- No production live API or authenticated browser deployment proof has been obtained yet.
- No outreach, payments, partnerships, customer records, or production recovery actions were made.
- GitHub dedicated Connect checks were green at the previous head; full Forge run at that head was **cancelled**, not passed.
- Base44 published version and runtime adoption state must be independently inspected before updating canonical deployment records.
