# Systemia Atlas rebuild v0.1 · Freight Brokerage in a Box

**Status (November 15, 2026):** implemented, interactive **synthetic-only browser workspace** staged on a GitHub feature branch. **Not launched or connected to production.** No actual real-world loads, FMCSA checks, real driver workflow, account authentication, private freight data, payments, live route service or source-verified reports.

## One product, one spine

Atlas originated as an Ops + Training + Evidence platform, with trucking as the first vertical. Its documented freight scope also includes the brokerage CRM/TMS workflow, shippers, carriers, loads, quotes, dispatch, invoices/PODs, compliance, bilingual training, risk intelligence and route simulation. **All freight functionality belongs in Atlas.** The previously created "Systemia Atlas Freight Load Exception Intelligence" public listing is discovery-only and is only one narrow capability. Do not falsely promote its public metadata to runtime proof.

**Product:** Systemia Atlas · Freight Brokerage in a Box

**First demonstration route:** `/apps/systemia-atlas/` (Vite/owned static assets when published).
**Distinct embedded module:** `/apps/route-twin/` (stacked engineering branch PR #2099).
**Core:** `public/apps/systemia-atlas/atlas-core.mjs`
**UI:** `public/apps/systemia-atlas/app.mjs`, `index.html`
**Regression:** `tests/systemia-atlas-rebuild.test.mjs`

## Functionality in this rebuild

| Surface | v0.1 evidence | Missing to become commercial |
| --- | --- | --- |
| Command center | KPIs and activity derived from sample load state, explicit non-revenue estimates | Authenticated tenant data and actual financial reconciliation |
| Load desk | Create synthetic loads, assigned sample carrier, six-step stage transitions and document checklists | Validated quote/rate contracts, actual carrier/legal gates, role permissions, timeline and communications |
| Shipper CRM | Two sample records and load associations | CRUD, customer contact permissions, ownership, organization scoping, searchable historical interactions |
| Carrier desk | Sample roster and **operator-only demonstration attestation** | Official current operating-authority and insurance verification, periodic recertification and cargo-specific policies |
| Driver today | Read-only demo assignments and load drilldown | Verified driver identity, scoped driver assignments, HOS/ELD integration, GPS, reliable offline mode, POD upload |
| Documents | Presence checkboxes and stage requirements; deliberately no files | Blob storage, integrity hashes, upload provenance, OCR/redaction and access control |
| Exceptions | Open/resolve demonstration exceptions and readout | Live event intake, structured severity policy, SLA/notifications and protected audit log |
| Evidence | Sequence-ordered local action ledger and JSON export | Append-only authenticated server receipts, timestamping, file hash, audit packets and retention policies |
| Training | Four illustrative instructional cards with session-only viewed state | Reviewed OSHA/FMCSA/local jurisdiction packs, multilingual content, certification expiry and supervisor signoff |
| RouteTwin | Entry to 3D schematic truck rehearsal | Licensed truck-legal geometry, authoritative WSDOT data, NWS forecast, real route simulation and browser/field QA |

## Why the first proof is client-side and synthetic

This initial rebuild proves the product's interaction architecture and deterministic freight state transitions. It **deliberately does not store real freight data in localStorage** or permit private uploads on an unauthenticated public page. All modifications are in-memory, disappear on refresh, and can be exported as explicitly labeled sample JSON. No emails, shipment records, invoices, carrier records or provider accounts are touched.

`draft → quoted → booked → in_transit → delivered → closed`

Sample workflow guards:
- A sample carrier-attestation flag is required before synthetic booking, but **is not official verification**.
- Synthetic dispatch transition requires the rate-confirmation and BOL checklist flags.
- Synthetic closeout requires POD checklist and no open exceptions.
- An invalid transition, unknown carrier, malformed prices or inconsistent origin/destination fails with a safe error.
- Evaluation and exported records explicitly carry `synthetic_training_only` / no verified real-world source.

These flags are demonstration guards only, not a legal or insurance compliance determination.

## Production architecture (design, not a shipped claim)

`Tenant authentication & role-scoped workspace → Atlas canonical freight transaction graph → quote/load/dispatch/evidence workflows → provider adapters → RouteTwin/World Engine → reviewed exceptions → settlement reconciliation → signed audit pack`

1. **Authorization:** organization isolation, shippers/carriers/dispatchers/drivers, server enforced RBAC/ABAC; all writes checked against org/workspace. No client-side trust of role.
2. **Canonical freight state:** versioned shipment, stop, equipment, carrier, customer, quote and document models. Idempotent writes and retries, optimistic concurrency and conflict logs.
3. **Trusted carrier sources:** build the current FMCSA data strategy and confirm active authority, insurance and identity with appropriate authoritative sources. Do not rely on a legacy snapshot alone. As of 2026 FMCSA guidance, Licensing & Insurance may provide historical records and some current filings are on Motus; review current agency guidance before specifying data connectors. No API or automated scrape is assumed available.
4. **Trustworthy financials:** separately reconcile quote, carrier cost, detention, accessorial, customer invoice, proof of service, payment, refund and settlement. Sample gross spreads must never be presented as received revenue.
5. **Driver and training:** authenticated phone-first checklists, incident/near-miss intake, role-appropriate language packs, competency/recertification schedule and evidence-gated audit exports.
6. **RouteTwin:** truck-legal route plus as-of official restrictions, weather, pass closures, forecast/hypothetical separation; all safety-critical gaps stay unknown/hold. Human dispatcher approval only.
7. **Operational independence:** Evercraft-owned source/runtime and GitHub canonical; no Base44, TinyFish, hosted third-party app builders or vehicle-control authority.
8. **No misleading public distribution:** keep listing marked discovery-only until production URL, mobile QA, customer authorization, provider evidence and commercial handoff have been verified.

## Test and run

From the repository root:

```bash
node --test tests/systemia-atlas-rebuild.test.mjs tests/atlas-route-twin.test.mjs
node --check public/apps/systemia-atlas/atlas-core.mjs
node --check public/apps/systemia-atlas/app.mjs
python3 -m http.server 8766 -d public
# Browser: http://localhost:8766/apps/systemia-atlas/
```

The 3D RouteTwin page is present only after the stacked PR is merged or checked out. There is no real public customer URL verified by these commands.

## Acceptance gates before public launch

- [ ] Automated regression and browser QA (desktop + physical phone) with receipts, successful loading under target hosting
- [ ] Authenticated owned server, tenant data isolation, encryption/key custody, durable DB, migrations, backup + restore proof
- [ ] Full freight schema & transaction invariants, customer and carrier CRUD with access controls, safe document storage and audit logs
- [ ] Current official carrier operating-authority and insurance verification plan, verified integration terms and source freshness
- [ ] Driver assignment, POD collection, incident flow, dispatch and customer communications with approval gates
- [ ] Reviewed compliance and bilingual training content (no automatic certification claims)
- [ ] RouteTwin official WSDOT/NWS + truck-legal routing and real-source/hypothetical separation, see issue #2100
- [ ] Reviewed commercial offer, explicit service scope, checkout, fulfillment and postpayment customer success
- [ ] External owned HTTPS, independent fresh-session browser audit, receipts and manual trucking-operator pilot

## Authoritative source starting points

- WSDOT Traveler Information API (commercial vehicle restrictions, pass alerts and bridge-clearance disclaimer): https://apps.wsdot.wa.gov/traffic/api/
- FMCSA: https://www.fmcsa.dot.gov/registration/ask-fmcsa?topic=23021
- FMCSA insurance: https://www.fmcsa.dot.gov/registration/insurance-filing-requirements
- NWS API: https://www.weather.gov/documentation/services-web-API

Current official providers must be verified again at time of integration, not treated as static legal advice.

## Relationship to other Evercraft work

- **Systemia** orchestrates missions, evidence review and permissions, not a duplicate freight CRM.
- **Atlas** owns trucking workflow and operational knowledge.
- **RouteTwin** is an Atlas route-rehearsal capability, not a separate truck operating company.
- **Evercraft Worlds** provides the future canonical spatial rendering/simulation substrate after integration proof.
- **EarthWorks** provides compatible simulation ideas, but public-road freight and controlled quarry machine autonomy have separate safety, equipment, legal and execution boundaries.
