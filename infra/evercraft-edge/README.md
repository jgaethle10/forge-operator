# Evercraft Edge

Evercraft Edge is the owned naming, authoritative-DNS, routing, hosting and service-discovery control plane for the Evercraft fabric.

## Architectural rule

A product identity is permanent. A runtime is replaceable.

Logical identity:
`evercraft://<namespace>/<service>`

Public compatibility:
A delegated public DNS name maps to an Evercraft service identity. DNS providers, registrars, Base44, cloud hosts and individual servers are transports, never the source of identity.

## Control-plane objects

- ServiceIdentity: stable Evercraft URI and ownership metadata
- Zone: authoritative DNS zone delegated to Evercraft
- RecordSet: typed DNS records with TTL and provenance
- Route: hostname/path to service identity
- Endpoint: concrete runtime target plus protocol and health state
- Certificate: TLS lifecycle metadata
- Deployment: immutable release and runtime mapping
- Tenant: internal or external customer namespace
- Receipt: append-only configuration/change evidence

## Required planes

1. Naming registry
2. Authoritative DNS
3. Anycast/edge-ready routing
4. TLS automation
5. Hosting/runtime scheduler
6. Health checking and failover
7. API + MCP control surfaces
8. Tenant isolation and quotas
9. Audit receipts
10. Import/export so no infrastructure vendor can trap the system

## Bootstrap

Evercraft is customer zero. Existing products are registered before external tenants. No DNS cutover occurs without health validation and rollback metadata.

## Saban

Saban is treated as an infrastructure-capability provider behind the provisioning interface. It may supply compute, storage, networking or execution where verified available, but Evercraft Edge must remain portable and provider-independent.
