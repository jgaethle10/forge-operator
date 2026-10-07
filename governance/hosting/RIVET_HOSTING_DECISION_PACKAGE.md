# RIVET Hosting Migration Decision Package

Status: **PLANNING ONLY - NOT MIGRATION AUTHORIZATION**

Date: 2026-10-07

## Governance boundary

RIVET is partner-controlled. This package does not authorize a production move, public route, redesign, copy change, pricing change, report change, session-data behavior change, or any mutation to the approved RIVET presentation layer.

The locked product baseline remains governed by `governance/RIVET_CHANGE_CONTROL.md`. The approved engine baseline is pinned to `60a129284c92c5e453bb67e5004f3caeaffaefb5`.

This work intentionally lives outside `systemia/rivet/` and the protected generated RIVET artifacts.

## Decision in one page

The partners have three legitimate choices.

### Option A - Evercraft-operated hosting

RIVET presentation remains RIVET. Evercraft operates compute, deployment, routing, observability, backups, security controls, evidence infrastructure, and approved runtime dependencies.

Best when:
- partners want one operator accountable for the stack;
- Evercraft capacity is independently verified as sufficient;
- disaster recovery has an off-node copy and tested restore path;
- access and ownership rights are contractually explicit;
- the partners approve the migration after staging comparison.

Do not choose merely because the marginal cash cost appears low. Capacity, recovery, and operator concentration must pass the same standard as a paid cloud.

### Option B - Separate commercial or managed hosting

RIVET has a hosting account controlled by RIVET or jointly controlled by the partners. Evercraft may deploy into it without owning the account.

Best when:
- partners prioritize institutional independence and easy operator replacement;
- vendor-native backups, TLS, observability, and support reduce operational burden;
- predictable monthly spend is acceptable;
- the partners want infrastructure ownership visibly separated from Evercraft.

### Option C - Hybrid

RIVET presentation and public runtime are hosted in a partner-controlled environment. Evercraft operates AliEV and other approved intelligence or evidence services behind authenticated interfaces.

Best when:
- partners want the clearest separation between brand/product governance and intelligence operations;
- AliEV needs to evolve independently;
- a future change of public hosting should not require moving the intelligence layer;
- the team wants to reduce the blast radius of either party's infrastructure changes.

**Provisional architecture preference for partner discussion: Option C.** This is not a claim that hybrid is universally superior. It is the lowest-governance-risk starting point because it preserves independent RIVET control while allowing Evercraft-owned intelligence to keep evolving. Option A can become preferable if Evercraft passes the reliability/capacity gates and the partners want consolidated operations. Option B is preferable when the partners value vendor independence from Evercraft more than integration velocity.

## Existing implementation primitives already present

Read-only inspection found pre-existing Evercraft primitives that can support a future approved migration:
- Evercraft hosting control plane with health-gated promotion, rollback, reconciliation, receipt logging, and secret-exclusion behavior.
- AliEV source runtime and content-addressed snapshot migration proof.
- Owned AliEV plus report-runtime co-location proof.
- A pre-existing RIVET cutover evaluator with shadow, owned-primary, hold, and rollback logic.

These primitives are **not authorization** to use them against production RIVET. Any files under `systemia/rivet/` remain outside this package.

## Architecture comparison

| Criterion | A: Evercraft-operated | B: Commercial/managed | C: Hybrid |
|---|---|---|---|
| Brand isolation | Strong if separate namespace is enforced | Strong | Strongest governance separation |
| Operational control | Highest Evercraft control | Highest provider/account-owner control | Split by responsibility |
| Partner independence | Medium unless account/credentials are shared | High | High |
| Deployment velocity | High after gates | High on mature managed platform | High for AliEV, controlled for RIVET |
| Observability | Must be proven end to end | Usually built in or easy to add | Two-plane observability required |
| Backups | Must be off-node and restore-tested | Managed options available | Separate RIVET and AliEV backup domains |
| Vendor lock-in | Low if portable runtime is preserved | Medium, provider dependent | Low to medium |
| Session/AliEV integration | Lowest latency, easiest internal routing | Requires authenticated cross-provider path | Explicit API boundary, easiest governance |
| Maintenance burden | Highest on Evercraft | Lowest on managed hosting | Medium |
| Failure-domain separation | Depends on Evercraft topology | Provider topology | Strong if planes are independent |
| Partner governance | Requires careful controls | Simple account-based controls | Clearest split |
| Disaster recovery | Must be demonstrated | Provider primitives available | Requires coordinated dual-plane runbook |

## Current cost model

All numbers below are planning bands, not quotes. They exclude labor, taxes, unusual data-egress spikes, premium support, and domain registration unless noted.

### A: Evercraft-operated Fabric

**Cash cost: not yet honestly measurable.** Existing spare capacity could make incremental compute spend near zero, but that cannot be used as a decision claim until capacity, redundancy, power/network exposure, backup location, and recovery time are measured.

For comparison, the replacement cost of a small production stack in a public cloud is roughly tens to low hundreds of dollars per month. That replacement-cost benchmark should be used as an internal shadow price even if Evercraft cash spend is lower.

Required pre-approval measurement:
- CPU and memory at p50/p95/p99 under representative RIVET load;
- storage growth per 1,000 reports;
- bandwidth per report and per active user;
- spare node capacity after existing Evercraft workloads;
- independent failure domains;
- offsite backup cost;
- operator time and on-call expectation;
- restore time from a dead primary node.

### B1: DigitalOcean-style commercial cloud

Current reference prices checked 2026-10-07:
- Basic Droplet: 2 GiB / 1 vCPU, $12/month; 4 GiB / 2 vCPU, $24/month.
- Managed PostgreSQL: single-node plans begin around $15/month; HA begins with a $30/month primary plus at least one matching $30/month standby.
- Spaces object storage: $5/month includes 250 GiB.
- Regional HTTP load balancer: $12/month; global load balancer: $15/month.
- Droplet backups: weekly adds 20 percent; daily adds 30 percent on basic plans.
- Infrastructure monitoring is available at no additional cost; uptime includes one free check, then $1/check/month.
- Included Droplet transfer varies by plan; additional outbound transfer is $0.01/GiB.

Illustrative small production bands:
- Lean single-node application + small managed DB + object storage: roughly **$32 to $60/month**, before optional load balancer and stronger redundancy.
- Small HA-oriented layout with two 2 GiB app nodes, regional load balancer, HA managed DB, and object storage: roughly **$100 to $130/month** before optional premium edge/security services.
- A 4 GiB application tier or extra redundancy pushes the band upward.

### B2: Managed application platform, Render-style

Current reference prices checked 2026-10-07:
- Web service 0.5 CPU / 512 MB: $7/month.
- Web service 1 CPU / 2 GB: $25/month.
- PostgreSQL 1 GB: $19/month; 2 GB: $40/month.
- Pro workspace: $25/month plus compute.
- Persistent disks: $0.25/GB/month.
- PostgreSQL storage: $0.30/GB/month.
- Bandwidth allowance depends on workspace tier; overage shown at $0.15/GB on current pricing.
- Automatic TLS, custom domains, deploys, and rollbacks are built into the platform.

Illustrative bands:
- Small single-instance app + 1 GB database on Hobby: roughly **$44/month** plus storage and bandwidth.
- Team production setup using a 1 CPU / 2 GB app, 2 GB database, and Pro workspace: roughly **$90/month** plus storage/bandwidth.
- Redundant or horizontally scaled app instances add another instance cost and can move the total into the **$115+** range quickly.

### Other reference points

AWS Lightsail Linux instances currently start at $5/month with public IPv4; the 2 GB plan is $12/month and the 4 GB plan is $24/month.

Cloudflare currently offers DNS/CDN/universal SSL on its free plan; Pro is $20/month billed annually or $25 month-to-month. This can be used independently of where RIVET compute runs.

## Recommendation logic

Choose A only if all are true:
1. partners explicitly approve Evercraft operation;
2. spare capacity is measured rather than assumed;
3. at least two failure domains are available or the partners knowingly accept a single-domain risk;
4. backups are stored outside the primary failure domain;
5. restore is tested;
6. production credentials and emergency access are available to the agreed owners;
7. staging is visually identical under the fidelity gate;
8. rollback can be executed without code changes.

Choose B when any of these dominate:
- partners want direct control of the hosting bill/account;
- provider SLA/support is worth the monthly spend;
- Evercraft does not yet meet redundancy or on-call requirements;
- portability and operator replaceability matter more than internal integration.

Choose C when:
- partners want RIVET hosting ownership separated from Evercraft intelligence;
- AliEV needs fast independent evolution;
- session/evidence services can be cleanly exposed through authenticated versioned interfaces;
- governance clarity outweighs a little extra network and operational complexity.

## Design-fidelity gate

A migration is not ready merely because the application starts.

Required baseline:
- partner-approved desktop and mobile captures;
- approved logo and brand asset hashes;
- typography/font inventory;
- colors and design tokens;
- spacing and component geometry;
- navigation and route contract;
- loading, empty, error, form, report, and animation states;
- deterministic test data for reports;
- mobile and desktop behavior.

The isolated migration gate in `systemia/migrations/brand-fidelity/` compares:
- baseline identity and release reference;
- viewport dimensions;
- protected token maps;
- interaction contracts;
- approved asset hashes;
- exact PNG screenshot hashes;
- accidental parent/Evercraft-theme inheritance.

The baseline template intentionally remains `NOT_CAPTURED_NO_PRODUCTION_TOUCH`. The gate fails closed until an approved baseline is captured after explicit authorization.

Exact screenshot hashing is deliberately strict for the first migration. Dynamic timestamps, rotating data, or nondeterministic content must be masked or frozen in the capture fixture. If later evidence shows browser-level nondeterminism is unavoidable, a partner-approved pixel-diff threshold can replace the exact-image rule. That threshold must not be silently relaxed by engineering.

## Staging approval protocol

1. Freeze an approved RIVET source release.
2. Capture baseline from the currently approved environment.
3. Build candidate runtime without changing protected presentation files.
4. Seed staging with deterministic test data.
5. Run desktop/mobile fidelity gate.
6. Run functional parity tests for navigation, forms, reports, loading/error states, and authenticated flows.
7. Produce a human comparison packet: current approved vs migrated candidate.
8. Obtain explicit partner approval for hosting migration.
9. Only then schedule cutover.

## Production cutover gate

No production cutover unless all are true:
- explicit partner approval recorded;
- fidelity gate passes;
- functional parity passes;
- staging externally reachable and verified;
- TLS valid;
- DNS target prepared with reversible TTL;
- database/source snapshot current;
- backup restore test passed;
- monitoring and alerts active;
- rollback target verified;
- no protected RIVET file changed outside the separately approved scope.

## Partner-facing explanation

> We are not proposing a RIVET redesign. The decision is only where the approved RIVET product runs and who operates that infrastructure. The RIVET brand, interface, reports, wording, customer flows, and approved behavior stay frozen unless the partners separately approve a product change.
>
> We have three viable models: Evercraft can operate the stack, RIVET can use an independent hosting provider, or RIVET can stay independently hosted while Evercraft operates AliEV and the intelligence layer behind it. We will compare the current approved product against a staging copy before any move. If the staging copy does not match, it does not ship. The production move will also have an immediate rollback path.

## Open blockers before any migration can be recommended as production-ready

- The actual currently approved RIVET customer-facing URL/environment has not been captured into this package.
- Partner-approved desktop/mobile reference screenshots have not been recorded.
- Current production traffic, storage, database, and bandwidth measurements are not in this package.
- Evercraft spare capacity and independent failure-domain capacity have not been measured specifically for RIVET.
- Hosting-account ownership and credential custody have not been selected by the partners.
- RTO/RPO targets have not been approved.
- No partner hosting option has been selected.

These are intentional blockers, not defects. They prevent planning work from mutating production by accident.

## Pricing sources, checked 2026-10-07

- DigitalOcean Droplets: https://www.digitalocean.com/pricing/droplets
- DigitalOcean managed PostgreSQL: https://docs.digitalocean.com/products/databases/postgresql/details/pricing/
- DigitalOcean Spaces: https://docs.digitalocean.com/products/spaces/details/pricing/
- DigitalOcean load balancers: https://docs.digitalocean.com/products/networking/load-balancers/details/pricing/
- DigitalOcean backups: https://docs.digitalocean.com/products/backups/details/pricing/
- DigitalOcean monitoring: https://docs.digitalocean.com/products/monitoring/details/pricing/
- DigitalOcean bandwidth: https://docs.digitalocean.com/platform/billing/bandwidth/
- Render pricing: https://render.com/pricing
- AWS Lightsail bundles: https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html
- Cloudflare plans: https://www.cloudflare.com/plans/
