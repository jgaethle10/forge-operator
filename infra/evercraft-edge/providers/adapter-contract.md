# Evercraft Edge provider adapter contract

Providers supply capacity. They do not own service identity, DNS truth, tenant identity, receipts, or routing policy.

Required discovery:
- capabilities()
- health()
- capacity()

Optional execution:
- allocateCompute(spec)
- releaseCompute(id)
- allocateStorage(spec)
- attachNetwork(spec)
- publishEndpoint(spec)

Every execution result must include provider-local resource ID, observed state, timestamp, and enough information for Systemia to reconcile or replace it.

## Saban

Saban plugs into this contract. Systemia may ask Saban to discover or supply suitable infrastructure. No permanent Evercraft URL or `evercraft://` identity may contain a Saban-specific identifier. If Saban becomes unavailable, another adapter can satisfy the same service declaration.

## Cost authority

Discovery is allowed. Provisioning that can create new charges is denied unless an explicit budget/policy authorizes it.
