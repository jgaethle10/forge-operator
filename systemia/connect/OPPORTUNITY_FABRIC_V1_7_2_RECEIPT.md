# Opportunity Fabric / Evercraft Connect v1.7.2 | Approval freshness hardening

Date: 2026-10-07

## Verified source checkpoint

- Existing Base44 app ID: `6ab85d74fe2093703c6247e0`
- Checkpoint: `6ac6fdf044fca321de64a56d`
- Checkpoint source commit: `d918efdfacb5fec2df3fc8f1a2a1bf2214ae5cdb`
- Subsystem release label: Connect v1.7.2
- **Important:** trusted runtime source constant still reads `evercraft-opportunity-fabric-runtime-v1.7.0`. A checkpoint label does not prove a deployed version.

## Implementation

After a match is suggested, `decide_connection_proposal` rechecks **at approval time**:

1. Known source kind only: `ConnectCase` or `Project`.
2. Known candidate kind only: private `ConnectNode` or enrolled `Member`.
3. Source is still controlled by the acting owner.
4. Private case is active, not held, not do-not-contact, and **still needs** the requested capability.
5. Public project is owned, open/nonclosed, and **still needs** the requested capability.
6. Private provider node is still active/not held/not DNC and **still has** the matching capability.
7. Enrolled member still exists, belongs to a different member owner, is not booked, and **still advertises** the matching capability.
8. Checks happen before idempotent approval replay; a stale prior approval creates no ongoing permission.

Matching routes now exclude `Booked` Fabric members, and `plan_connection_route` rejects closed projects before creating suggestions. The existing execution team planner also filters booked members.

No payment, member enrollment, external outreach, protected-data disclosure, or partnership is performed by these actions.

## Tests

```text
npm run test:connect
  16 behavioral tests, 16 pass, 0 fail
  OPPORTUNITY_SECURITY_PASS

npm run build
  OPPORTUNITY_FABRIC_AUTHORITY_CONTRACT_PASS
  16 behavioral tests, 16 pass, 0 fail
  vite build succeeded
```

These invoke the actual TypeScript handler in a test VM with simulated authentication and mocked service-role entities. They **do not** establish production service access, browser-level security, or authenticated deployment.

## Current deployment / merge truth

- Base44 source checkpoint exists and is verified.
- Live deployed runtime/version: **not independently verified**.
- Public/production matching behavior: **not independently verified**.
- GitHub PR #1126 remains the integration PR and must pass relevant gates before merge.
- Previous GitHub head showed Connect-specific CI success; full Forge remains a separate pending/cancelled/inconclusive gate depending on head.

No live case/customer/partner was contacted or modified to generate this receipt.
