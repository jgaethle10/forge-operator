# Systemia Signal Fabric

Systemia Signal Fabric is the company-wide alarm nervous system. It exists to stop every tool, product, workflow, crawler, payment rail, deployment, agent, and external dependency from independently yelling at humans.

## Core model

Every operational event becomes a `systemia.signal.v1` record before it can page a person. The router assigns a stable fingerprint, evidence state, severity, dedupe window, and delivery route.

The four severities are:

- `receipt`: expected activity, successful checks, cancellations, skipped work, superseded runs.
- `notice`: useful drift or unfinished work that belongs in a digest or queue.
- `warning`: mainline/release degradation or repeated dependency trouble needing owner attention.
- `critical`: verified live customer impact, security/compliance danger, data loss, or a blocked trust-sensitive action requiring immediate human action.

A red tool badge is evidence, not a verdict. A failed CI job does not become a production outage merely because GitHub used red paint.

## Company-wide contract

All Evercraft products and shared infrastructure should emit structured signals into this fabric rather than directly emailing, texting, paging, or pushing a human. Product-specific adapters may collect GitHub Actions, deployment health, security, payments, customer support, crawl/discovery, runtime, weather/operations, and other signals, but classification and notification policy remain centralized.

The fabric must preserve existing human gates. It may say that an invoice, refund, contract, destructive release, trust-sensitive action, or payment decision needs attention. It must not perform that action merely because a signal exists.

## Noise controls

Signals are fingerprinted from stable operational dimensions so repeats collapse into one incident family. The default dedupe window is 15 minutes. Recovery signals should close/coalesce with their incident rather than create another storm. Immediate notifications have an explicit hourly budget and are reserved for critical signals.

`notice` and `warning` are digest-oriented. `receipt` stays in the ledger. `critical` can page immediately.

## Adoption path

1. Emit a normalized signal rather than sending directly.
2. Attach evidence state such as `source_build_green`, `live_verified`, or another explicit state.
3. Route through `router.mjs`.
4. Persist the decision and fingerprint.
5. Apply dedupe/recovery state.
6. Deliver only through the routes authorized by policy.
7. Record the delivery receipt and human acknowledgement when applicable.

Adapters for Slack, email, SMS, push, dashboards, and product-specific channels should remain replaceable downstream modules. The policy is the durable company primitive.
