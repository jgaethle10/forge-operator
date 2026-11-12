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

## Durable One-Body state and consumer receipts (operator-only)

The new `one-body-store.mjs` is a **private local file-store adapter**, not a separate mission authority. It persists the existing `evercraft.one-body.state.v1` structure inside a revisioned envelope, using a cross-process single-writer directory lock, an atomic file replacement, restrictive file permissions and forward-only event/acknowledgement checks. A crash-held lock requires explicit operator review; it is never automatically cleared by guessing its age.

The narrow command-line surface `one-body-operator.mjs` supports:

```bash
# Privileged runtime filesystem only; choose an operator-controlled directory.
node systemia/organism/one-body-operator.mjs init ./private/one-body.json
node systemia/organism/one-body-operator.mjs ingest ./private/one-body.json ./private/inert-event.json
node systemia/organism/one-body-operator.mjs ack ./private/one-body.json ./private/signed-consumer-receipt.json ./private/consumer-trust.json
node systemia/organism/one-body-operator.mjs export ./private/one-body.json ./private/consumer-trust.json > ./private/visual-snapshot.json
```

The trust file must be a **local regular file accessible only to the runtime owner** (0600), pinned by the privileged operator. It contains *public* verification keys scoped to exact receiving lanes; signing private keys remain with the sending consumers. The operator must prevent untrusted actors from choosing or replacing the trust file.

A successful `ack` means an enrolled consumer signed an exact event+lane receipt accepted by the operator's configured trust registry, **not** that mission execution, customer fulfillment or payment succeeded. The exporter re-verifies it on every read. If the signer is revoked, the snapshot returns to unverified without rewriting history.

An ingest is an inert planning admission; the CLI exposes no execution, messaging, payment, publishing or deployment command. The private state file is not a public API and cannot be safely served raw. A real authenticated, Passport-redacted, rate-bounded control-room endpoint and a deployed consumer adapter are still required for live phone observations.

The deterministic `one-body-store.proof.mjs` covers creation, single-writer exclusion, replay, append-only safeguards, signed receipt persistence, restart visibility, unauthorized file permissions, tampering and key revocation. CI runs it as part of `npm run proof:one-body`.

## Local consumer inbox bridge (first real handoff boundary)

`one-body-local-consumer.mjs` and `one-body-consumer-cli.mjs` implement a **local-only** receiving adapter:

1. The consumer reads an already-persisted One-Body event, checks that its exact event ID is routed to its lane, and takes a single-writer lock on the recipient's own inbox.
2. It records a minimal inbox acceptance in a private, atomically replaced file. It does not execute any assigned work.
3. Only **after durable inbox acceptance** does it sign a domain-separated Ed25519 receipt binding the event, lane, stable receipt reference, timestamp and consumer identity.
4. The signed receipt is written create-only to a private file. Systemia's existing `one-body-operator.mjs ack` verifies it against the independently provisioned lane trust registry and persists the reference. The read-only graph exporter verifies the signature again on each read.

Local operator flow with externally provisioned, owner-protected private signer keys and pinned verifier keys:

```bash
node systemia/organism/one-body-consumer-cli.mjs \
  ./private/one-body.json \
  ./private/context-inbox.json \
  "<event-id-from-canonical-state>" \
  context_fabric \
  "<enrolled-consumer-key-id>" \
  ./private/context-signer-private.pem \
  ./private/ack-output.json

node systemia/organism/one-body-operator.mjs ack \
  ./private/one-body.json ./private/ack-output.json ./private/consumer-trust.json
```

**Truth boundary:** this proves only that an enrolled local inbox accepted an event, not that a specialist executed, memory was updated, a customer received work, or a provider settled a payment. It is not a network adapter and has not been deployed to Node001 or NextGen. A real remote handoff needs authenticated transport, replay-safe dispatch envelopes, a consumer-side permit scoped to its lane, host key provisioning/rotation, and actual specialist acceptance evidence. Do not distribute runtime private signer keys via GitHub or through consumer-uploaded event files. The private signer file must be a regular 0600 file, not a symlink.

`one-body-local-consumer.proof.mjs` verifies independent-process inbox acceptance, end-to-end signature admission into the canonical store, idempotent replay, private receipt file mode, lock contention, signing-key permission rejection and revocation-driven loss of verified state. It is part of `npm run proof:one-body`.

## Passport-scoped Living Graph read membrane

`one-body-snapshot-reader.mjs` creates a **host-internal read adapter**. An existing authoritative identity middleware must provide `verifySession` and return a verified opaque subject reference. A request's claimed `subject_ref` is never accepted directly.

For every read, the adapter calls existing Evercraft Passport using product `evercraft-context`, scope `context.read.systemia`, and resource `systemia:one-body`. Without an active grant, the response is a uniform denial with **no graph, event count, filename, receipt information or hint that the private store exists**. Revocation applies on the very next read.

Only after authorization does the adapter open the One-Body private state and generate a redacted snapshot. It re-verifies lane acknowledgements with **operator-pinned** public signing keys. No raw event payloads, private buyer/source refs, or signer private keys are returned. It grants no work execution permission.

**Not an HTTP server.** The adapter must be wired into an owned HTTPS route with session authentication, Passport state provisioning, access logs, request limits, redaction review, and endpoint/host deployment receipts before a real phone/browser can poll it. Do not expose the file store, accept a caller-supplied key registry, or report this API as live from these repository changes.

`one-body-snapshot-reader.proof.mjs` exercises no-grant and wrong-scope denial, a verified subject's scoped read, cross-subject isolation, redaction, and immediate grant revocation. It is included in `npm run proof:one-body`.

## Node001 / NextGen consumer enrollment (offline, operator-reviewed)

`one-body-enrollment.mjs` and `one-body-enroll-cli.mjs` produce an **enrollment candidate** on the actual receiving host without transmitting any private signing material:

```bash
# Run separately on each owned host. Never check in the output directory.
node systemia/organism/one-body-enroll-cli.mjs \
  node001 context_fabric node001:context:v1 \
  "$HOME/.local/state/evercraft/one-body-private"

# For Node002, on that machine, use its own independent signing identity:
node systemia/organism/one-body-enroll-cli.mjs \
  node002 context_fabric node002:context:v1 \
  "$HOME/.local/state/evercraft/one-body-private"
```

Each run creates a **0600 private Ed25519 PEM** and a **0600 public candidate JSON** under a **0700 directory**, using create-only filenames. It refuses to overwrite an existing identity or use a group/world-accessible directory. The CLI prints paths and a public fingerprint, **not the private key**. The candidate includes `pending_operator_verification` and `enrolled: false`. It is not an authorization grant, a health receipt, or a runtime bootstrap.

**Operator ceremony:** Verify the host identity through an out-of-band trusted channel, inspect the candidate public fingerprint, then manually provision its `{ "lane": "context_fabric", "public_key_pem": "..." }` entry under `node001:context:v1` (or `node002:context:v1`) in the already privileged One-Body consumer trust registry. No candidate may self-enroll or choose the authoritative registry. If a host is lost or compromised, revoke its registry entry; subsequent snapshot reads fail back to **unverified** without altering older history. Host-specific private PEM files must stay on their own machines and never enter chat, source control, logs, or a browser.

After real consumer deployment and protected key provisioning, the locally generated private signer path may be supplied to `one-body-consumer-cli.mjs`, with the event's correct routed lane. This step records only **local inbox acceptance**. It does not activate specialist runtime dispatch, sign payments, or prove remote delivery. No command above has been executed on Node001/NextGen from this chat.

`one-body-enrollment.proof.mjs` covers private/public file modes, candidate state, duplicate rejection, cryptographic compatibility, lane mismatch, and trust revocation. The suite runs under `npm run proof:one-body`.

## Proof

Run:

```bash
npm run proof:one-body
```

The proof specifically covers the failure mode that exposed the gap: a RIVET procurement signal can no longer stop at “canonical record created.” It must either become an active commercial opportunity, a missed-primary recovery path, or a documented non-commercial result.
