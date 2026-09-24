# evercraft.capacity.v1

## Principle

Saban asks: where can this workload run right now?

A capacity source does not need to be Evercraft-owned or pre-registered. Discovery and allocation are runtime concerns.

## Normalized lifecycle

DISCOVER -> OFFER -> MATCH -> LEASE -> EXECUTE -> HEARTBEAT -> CHECKPOINT -> REBIND -> RELEASE -> RECEIPT

The HTTP interface in this proof is one adapter, not the network architecture itself. Other adapters may resolve cloud/serverless, carrier edge, VMs, containers, browser workers, decentralized compute, partner infrastructure, or future capacity markets.

## Minimal HTTP adapter

GET /v1/capacity
GET /v1/health
POST /v1/leases
POST /v1/jobs
DELETE /v1/leases/:id

The hard boundary is legitimacy of allocation. Saban may automate discovery and negotiation, but it does not silently commandeer compute that has not been exposed or granted for use.
