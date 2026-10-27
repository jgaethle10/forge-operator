# Evercraft rentable-capacity pilot (proposal, not live billing)

## Principle
Rent *measured outcomes or reserved capacity*, not access to untrusted credentials or unrestricted agents. Provider costs must be observable; no claim of hard caps unless provider enforces them.

## Pilot 1: Fallen Studios reserved render slots
- Customer receives a finished video asset, not GPU SSH access.
- Quote before reservation: output duration, resolution, revisions, delivery window, compute estimate and storage.
- Internal scheduler uses read-only Vast discovery. GPU creation is disabled until owner approval, provider spending controls, teardown and receipt capture are verified.
- Reserve only one slot at a time. Job state: quoted -> approved -> queued -> running -> delivered -> deleted -> reconciled.
- Price must cover compute, storage, voice/music licensing, revision labor, payment fees and margin.
- Never market the system as a public GPU cloud until independent tenant isolation, abuse controls, metering and support exist.

## Pilot 2: ForensiScope metered media processing
- Sell bounded duration tiers only after upload limits, deletion policy, consent, provenance and checkout are validated.
- No unrestricted access to uploaded third-party recordings; customer attests rights.

## Pilot 3: Fabric dedicated API quotas
- Authenticate clients, meter per endpoint and tenant, set quotas, throttle, publish uptime and data-retention policies.
- No pass-through of privileged Systemia tools or owner secrets.

## Release gates
1. A verified end-to-end canary with cost and quality receipts.
2. Automated cleanup tested on success, failure and timeout.
3. Tenant isolation and abuse policy.
4. Published terms, refund policy, licensing and privacy controls.
5. Checkout and metering verified independently.

## Current state
Design only. No rentable compute inventory, paid provisioning, or public self-serve capacity has been authorized by this document.
