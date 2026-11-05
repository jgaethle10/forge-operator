# Evercraft One-Body Fabric

Evercraft is one operating body, not a pile of apps.

The body contract is:

```
anything observed
  -> evidence ledger
  -> product/capability identity
  -> signal fabric
  -> shared context
  -> commercial test
  -> mission/goal runtime
  -> bounded execution
  -> fulfillment/distribution when authorized
  -> receipt
  -> shared memory
  -> next motion
```

No useful event is allowed to end at “we found something.”

## Anatomy

- **Senses:** RIVET/AliEV, Sentinel, TOWI, FAIE, Journal, Household Fabric, web/research collectors, field systems, customer operations, finance/payment rails and every other product or adapter.
- **Nervous system:** Signal Fabric. It classifies operational urgency and suppresses duplicate noise.
- **Brain:** Systemia Organism and Goal Runtime. It converts admitted signals into coordinated, persistent work.
- **Memory:** evidence ledger, context fabric, registries, receipts and mission state.
- **Circulation:** One-Body routing. Evidence is carried to every system that has a legitimate use for it.
- **Commercial metabolism:** Revenue Circulation plus CHUM. Procurement, buyer intent, expansion, grants, capex and other money-shaped evidence must be tested for a real commercial path.
- **Muscle:** Saban, Yard and bounded execution adapters.
- **Hands:** specialist runtimes such as RIVET, ForensiScope, Clip, media studio, fulfillment and field systems.
- **Voice:** Journal, CHUM discovery surfaces and Evercraft Clip when a public-safe artifact is actually authorized for distribution.
- **Immune system:** security, trust, legal, payment and human-authority gates.

## Non-negotiable invariants

1. A new source, product or experiment may be unresolved, but it may not become invisible. Unknowns route to Portfolio Sentinel.
2. Every event is receipted into shared evidence/context before specialty routing.
3. Commercialization is structural. Every signal is tested for buyer, value, deadline, procurement stage and next commercial motion.
4. A missed primary tender is not discarded. It becomes an awardee/subcontractor/follow-on-scope recovery path plus a lesson for earlier detection.
5. Payment, legal, employment, safety, trust, destructive changes and consequential external actions keep their existing human gates.
6. Fulfillment starts only from authoritative paid/authorized state, never from checkout creation or inferred buyer interest.
7. Publishing/distribution receives only explicitly public-safe candidates.
8. Product identity comes from the canonical registry rather than a hand-maintained one-off router list.
9. Duplicate evidence does not create duplicate opportunities.
10. No route may silently dead-end.

## Runtime

`systemia/organism/one-body.mjs` is provider-independent. It can accept events from Base44 adapters during migration, native Yard/Forge runtimes, GitHub, internal crawlers, MCP/plugin surfaces or future Evercraft infrastructure without making any provider the nervous system.

The output is `evercraft.one-body.event.v1`. State is `evercraft.one-body.state.v1`.

The router intentionally produces instructions and receipts, not unbounded external side effects. Existing adapters and authority gates remain responsible for execution.

### Handoff truth contract

- A one-body event indicates **planned routing**, not that a recipient consumed a message or completed work. `handoff_state=routing_planned_unverified` makes that distinction machine-visible.
- Inbound `status=paid`, `stage=payment_verified`, `payment_verified=true`, and `fulfillment_ready=true` are **claims to reconcile**. They route to `payment_authority_reconciliation`, not directly to `portfolio_fulfillment_router`. The downstream Evercraft Payments / universal fulfillment authority check must independently establish canonical paid state and scope before execution.
- Inbound `human_gate_required=false` never overrides consequential action categories. Identity, Passport, signed approvals, Execution Gate, provider reconciliation, and product-specific gates remain separate requirements.
- Do not render `dead_end=false` as proof of completed delivery. It means the planning router emitted at least one lane; actual lane admission, receipt bridges, runtime freshness, and outcome completion need their own observed evidence.

This avoids green-status theater while tightening circulation between the body’s shared parts.


## Living Graph handoff observability (read-only)

The One-Body snapshot exporter reuses the existing `evercraft.systemia.visual-snapshot.v1` format accepted by the Living Graph. It turns a **persisted event-state file** into a small privacy-filtered map of routes, lane destinations, and unconfirmed handoffs. It never calls a worker or initiates a payment.

```bash
node systemia/organism/one-body-visibility.mjs ./private/path/to/one-body-state.json > ./one-body-visual-snapshot.json
```

When an operator has provisioned **lane-scoped public keys** outside the repository and verified that the consumer private keys are protected, a local export may revalidate signed acknowledgements:

```bash
node systemia/organism/one-body-visibility.mjs ./private/state.json --trusted-consumers-file ./private/trusted-consumers.json > ./private/snapshot.json
```

The trust file is a JSON object mapping signer IDs to `{ "lane": "context_fabric", "public_key_pem": "..." }`. It must be securely provisioned by the privileged Systemia operator. Neither the event, an uploaded JSON document, nor the signer may choose or replace this trust registry. If the trust file is absent or the key has been revoked, all such acknowledgements remain **unverified**.

Import the resulting JSON using the Living Graph's **Import snapshot** control in a browser. This is a local, point-in-time projection, **not a live telemetry feed**; do not publish a private snapshot without an authorized review.

- `planned_unverified`: no accepted consumer acknowledgement; may still be in flight.
- `unobserved_overdue`: no accepted acknowledgement after a configurable observation window. This does **not** prove failure, delivery, or customer impact.
- `consumer_receipt_verified`: a trusted adapter's `verifyReceipt(receipt)` callback has accepted a matching, time-valid event + lane receipt. This verifies only the consumer acknowledgement, not execution, payment, or customer delivery.
- `invalid_event_time`: source event time is absent, invalid, or later than export time.
- Identities and receipt references are hashed; buyer names, source refs, full source records, and payment/order secrets are omitted.
- Only a subset of recent events is exported to keep the phone graph legible. The summary includes the full state-event count and warns when sampled.
- All graph views are read-only and carry explicit `execution_authority_granted:false`, `payment_verified:false`, and `verified_runtime_health:false` summary markers.

### Privileged consumer acknowledgement (source contract, not deployed)

`recordBodyLaneAcknowledgement(state, receipt, {verifyReceipt, now})` in `one-body.mjs` accepts a **matching event + routed lane**, a past/present receipt timestamp, and an explicitly trusted verifier. It returns a new private One-Body state containing a bounded receipt pointer. A caller-owned runtime adapter must persist that state; the function itself has no storage or network effects. Duplicate acknowledgements are idempotent and older contradictory receipts fail closed.

`one-body-lane-signature.mjs` provides a concrete Ed25519 verifier. The participating consumer signs a fixed-order, domain-separated `evercraft.one-body.lane-consumer-receipt.v1` payload binding event, lane, receipt reference, time, and signer identity. The signer key is checked against a **runtime-provisioned, lane-scoped public-key trust registry**. Keys carried inside the event or receipt are never accepted as trust anchors. The private key is not in the repository.

On every read/export, the trusted verifier runs **again** against persisted acknowledgement pointers. A stored receipt ref, flag named `verified`, or stale signature cannot magically grant a green status. A valid consumer signature only attests which enrolled consumer acknowledged an event; it is **not** payment authority, execution permission, customer delivery evidence, or independent proof that external work completed.

**Remaining integration gaps:** Real consuming adapters must sign their acknowledgements; the privileged Node001/NextGen runtime must provision and rotate lane-scoped trust, durably persist the returned state, expose only Passport-redacted read-only snapshots, and verify actual consumer liveness/freshness. Until deployed and observed, the Living Graph is an offline snapshot explorer, not a live company nervous system.

## Proof

Run:

```bash
npm run proof:one-body
```

The proof specifically covers the failure mode that exposed the gap: a RIVET procurement signal can no longer stop at “canonical record created.” It must either become an active commercial opportunity, a missed-primary recovery path, or a documented non-commercial result.
