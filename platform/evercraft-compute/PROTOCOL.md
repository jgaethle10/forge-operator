# evercraft.capacity.v1

## Design goal

Evercraft Network can grow outward from a seed without requiring hardware to be Evercraft-owned or statically pre-enrolled. A capacity provider opts in by exposing a compatible interface. Membership is temporary and exists only for the lifetime of an authorized lease.

## Exchange

1. **DISCOVER**: a seed locates a compatible capacity endpoint.
2. **OFFER**: the endpoint reports currently allocatable CPU, memory, lease count, platform and expiry.
3. **NEGOTIATE**: the seed requests a bounded lease for a declared workload class.
4. **LEASE**: the node returns a lease id and bearer capability with an expiry.
5. **SPAWN / EXECUTE**: Saban schedules logical workers against the leased NodeSeed interface.
6. **HEARTBEAT**: Systemia observes liveness, authorization and available headroom.
7. **CHECKPOINT / REBIND**: disappearing capacity causes the logical work cell to resume elsewhere from checkpointed state.
8. **RELEASE**: capacity returns to the provider.
9. **RECEIPT**: transitions are hash-linked into the evidence chain.

## NodeSeed HTTP surface

- `GET /v1/capacity` runtime capacity offer
- `GET /v1/health` heartbeat and liveness
- `POST /v1/leases` negotiate a bounded lease
- `POST /v1/jobs` execute one allowed workload through a valid lease
- `DELETE /v1/leases/:id` release capacity
- `GET /v1/receipts` node-side evidence trail

## Deliberate boundary

The protocol may run on any authorized hardware capable of offering compute, but a seed never seizes compute from a machine that has exposed no allocatable interface.

The protocol does not provide arbitrary remote shell execution.

A host advertising `linux_runtime` does not automatically qualify as `ephemeral_workspace`. Coding cells require a separately proven isolation/workspace capability.

## Saban mapping

Saban agents are logical workers. Up to 10,000 logical workers may be described by the internal fabric, but Systemia admits only work cells backed by observed capacity. Many agents may share one bounded isolated Linux workspace.

The public/external Saban preflight remains independently capped and does not inherit the internal 10,000-worker envelope.
