# Base44 Evacuation Program

Status: active  
Started: 2026-09-30  
Canonical destination: Forge Operator + Systemia Yard + Evercraft Compute

## Doctrine

Base44 is now a legacy evacuation source, not an Evercraft runtime authority.

No new product, workflow, renderer, background job, storage path, authentication flow, public route, integration, or machine endpoint may be introduced with a Base44 dependency.

Existing Base44 dependencies may remain temporarily only while the corresponding capability is being evacuated. They must not receive new responsibilities.

## Definition of migrated

A product is not migrated merely because its UI was copied. A cutover is complete only when all applicable layers are verified outside Base44:

1. source code and build
2. runtime and compute
3. persistent data and schemas
4. object/file storage
5. authentication and authorization
6. secrets and key rotation
7. background jobs, queues, schedules, and webhooks
8. public domains, APIs, MCP/A2A/OpenAPI and machine-discovery routes
9. observability, health checks, logs, receipts, and stuck-job detection
10. rollback and disaster recovery
11. acceptance tests against the old production behavior
12. external-delivery and payment authority, where applicable

No capability is cut over until the new lane passes its canary and the old lane is made read-only or disabled.

## Migration order

### P0 Platform spine
Move the things every other product depends on first:

- Systemia control plane
- Forge Operator runtime
- Evercraft Fabric / CHUM / machine discovery
- Yard / Evercraft Compute public edge
- identity, secrets, receipts, queues, artifact storage, and observability
- RIVET/AliEV report and site-plan execution

The platform spine must not call a Base44 function as a required hop.

### P1 Revenue-critical products
- RIVET
- AliEV
- Evercraft Clip
- Journal / Newsroom distribution
- EPS and current revenue surfaces

### P2 Operating system and safety
- Raven Nexus
- Evercraft Network
- Emergency Command
- EverMaps
- FAIE / TOWI / Radar
- HQ / Home / Front Door

### P3 Remaining active portfolio
Migrate active apps by dependency graph and usage, not alphabetically.

### P4 Archive / retire
Apps with no justified active workload are exported, documented, archived, and removed from runtime rather than rebuilt automatically.

## Data rules

- Export before destructive cutover.
- Every exported dataset receives a row/object count, hash where practical, schema version, source app ID, export time, and restore test.
- Missing is never treated as zero.
- Immutable evidence and receipts keep provenance across migration.
- Identity/address/parcel changes invalidate descendant site-plan artifacts by hash.
- No external delivery authority is inferred during migration.

## Traffic rules

Each public capability moves through:

shadow -> internal canary -> dual-read if required -> owned primary -> Base44 read-only fallback -> Base44 disabled

No silent fallback from an owned Evercraft capability to Base44 after the final cutover.

## Base44 shutdown condition

Base44 can be considered evacuated only when:

- no production domain requires Base44
- no public machine route advertises Base44
- no runtime secret is stored only in Base44
- no authoritative data writes land in Base44
- no scheduled/background production job runs there
- no payment or delivery authority depends on it
- the repository coupling audit reports zero required Base44 runtime references
- restore and rollback drills pass on Evercraft-owned infrastructure

The estate inventory for the current migration wave is in `migration/base44/estate-inventory.json`.
