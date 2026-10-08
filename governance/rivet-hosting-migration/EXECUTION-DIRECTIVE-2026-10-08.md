# RIVET Owned Hosting Execution Directive — 2026-10-08

Status: staging and migration execution authorized; production cutover remains governed.

## Authority and scope

Jesse Gaethle has directed Evercraft/Systemia to push the already-prepared RIVET Base44 exit forward.

This directive authorizes non-destructive migration execution, staging, shadow-owned canaries, public-edge repair, data reconciliation, release automation, and compatibility-path work needed to prepare RIVET for owned hosting.

It does **not** claim consent from every RIVET partner for a production DNS transfer, destructive Base44 retirement, ownership transfer, or change to partner rights.

## Product and design freeze

This is an infrastructure migration, not a redesign.

The approved RIVET presentation remains frozen to the existing Brand Kit and protected repository assets unless separately approved. The migration must preserve:

- canonical RIVET identity;
- existing approved visual language;
- current customer-facing layout and interaction patterns;
- current report semantics and evidence boundaries;
- current commercial tiers unless separately changed through RIVET commerce governance.

Brand-fidelity and visual-parity gates remain mandatory.

## Hosting lane

The active staging lane is:

**Evercraft-owned Fabric / Compute, governed through Systemia and deployed through Yard/Evercraft Compute.**

Base44 is retained only as a temporary compatibility and rollback surface while parity is proven.

## Release authority

Routine software publication must not depend on Jesse manually clicking Publish, completing a device-code login, or acting as the release actuator.

After owned production promotion, routine releases follow Systemia's live-software release policy and must be:

- noninteractive;
- machine-authenticated;
- independently verified;
- receipt-backed;
- rollback-capable.

Human/partner approval remains reserved for the production cutover decision, ownership changes, destructive retirement, material product changes, and other gates explicitly preserved by RIVET governance.

## Public identity

RIVET should receive one permanent custom domain before or during cutover and keep that customer-facing URL stable while infrastructure changes underneath it.

The domain is not selected or purchased by this directive.

Priority naming candidates for authoritative availability/price verification:

1. rivetev.com
2. rivetcharge.com
3. rivetinfra.com
4. rivetintel.com
5. rivetreports.com

Do not treat absence of search results or DNS records as proof of registration availability. Registration requires an authoritative registrar/RDAP confirmation and any purchase requires an explicit financial authorization.

## Execution order

1. Repair or select a verified Evercraft public edge / remote-capacity broker route.
2. Deploy the owned RIVET staging surface without changing protected brand assets.
3. Reconcile owned AliEV data required by RIVET.
4. Run fresh Preliminary and Full report canaries through the owned route.
5. Prove auth/team parity, persistence, customer delivery handoff, TLS, health, backup/restore, and rollback.
6. Run brand-fidelity and desktop/mobile visual parity checks against the approved RIVET baseline.
7. Promote cutover policy from `legacy_only` to `shadow_owned` only when receipts pass.
8. Observe shadow behavior and reconcile outputs.
9. Prepare production-domain/DNS change package for the existing RIVET partner governance gate.
10. Only after production cutover authority is satisfied, promote `owned_primary`, then `owned_only`.
11. Keep Base44 intact for the agreed rollback window; retire only after explicit destructive-retirement authority.

## Truth boundary

The owned report runtime and cutover machinery already exist in repository and have substantial test proof. The current public owned route is **not** yet independently verified. Do not claim RIVET has moved off Base44 until public route, fresh owned canaries, production cutover, and release receipts prove it.
