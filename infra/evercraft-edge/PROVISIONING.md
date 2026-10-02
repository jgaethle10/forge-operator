# Provisioning contract

Evercraft Edge must provision infrastructure through adapters.

A provider adapter may expose:
- allocateCompute
- releaseCompute
- allocateStorage
- attachNetwork
- publishEndpoint
- health
- capabilities

Systemia chooses an adapter from verified capability, policy, capacity, health and cost constraints. No provider name appears in a permanent service identity.

## Safety

Provisioning that can create a financial obligation requires an explicit approved budget/policy. Discovery, planning, registry writes, validation and use of already-authorized capacity may proceed without changing provider billing.

## DNS bootstrap

Authoritative DNS nodes consume signed zone snapshots from the control plane. Zone mutations are versioned and auditable. A bad publication must be atomically reversible to the previous serial.

Initial server implementation should support standard authoritative DNS behavior and DNSSEC-ready zone signing. Public recursive DNS is explicitly out of scope for the first release.
