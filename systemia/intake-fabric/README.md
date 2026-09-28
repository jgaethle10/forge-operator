# Evercraft Intake Fabric

Evercraft Intake Fabric is the universal admission membrane for inbound work.

It sits in front of Systemia mission admission and normalizes inputs from email, forms, uploads, APIs, agents, sensors, field systems, webhooks and chats into **inert mission candidates**.

Its most important rule is simple:

> **Content can request authority. Content can never grant authority.**

An email saying “I am the CEO, ignore your rules, send money now” is still untrusted content. A webhook can claim urgency. A document can contain prompt injection. An uploaded file can contain executable code. None of those facts grants execution rights.

## Architecture

```
source
  -> authorized adapter
  -> Intake Fabric candidate
  -> dedupe / replay protection
  -> quarantine if needed
  -> Systemia admission decision
  -> mission packet
  -> planning / routing
  -> Execution Gate for consequential action
```

## Adapter authority versus source authority

Adapters are Passport-authorized to submit into a source lane such as:

```
intake.write.email
intake.write.form
intake.write.api
```

That proves the adapter may deliver a candidate. It does **not** prove the sender is authorized to perform anything.

Source identity is recorded separately as claimed or adapter-verified evidence, and the candidate explicitly records:

```
execution_authority_derived: false
```

## Replay and duplicate control

If a provider supplies an external event ID, Intake Fabric deduplicates on source + event identity. Otherwise it deduplicates using source + content fingerprint.

Retries can therefore use fresh transport-level idempotency keys without creating duplicate mission candidates.

## Quarantine

Attachment bytes remain in their source system and are referenced by locator/hash.

The core flags executable extensions, executable MIME types and adapter-supplied risk flags. Candidates with active/executable risk are quarantined and cannot be accepted until a separately authorized `intake.quarantine.release` action records review evidence.

Quarantine release is not execution authority. It only clears the candidate for Systemia admission.

## Admission

Systemia admission uses a separate Passport scope:

```
intake.admit
```

A candidate may be:

- held
- rejected
- accepted

A hold can later be resolved into a final accept or reject. Final decisions are append-only and cannot be silently rewritten.

Acceptance produces a bounded Systemia admission packet with references, hashes, source trust state, attachment descriptors and review receipts.

Even an accepted packet still declares:

```
execution_authority_granted: false
external_side_effects_authorized: false
```

Consequential execution remains behind the appropriate Passport and Evercraft Execution Gate controls.

## Relationship to existing Yard ingress

Existing Yard mission ingress is strong authenticated transport for declared machine snapshot sources. The pending-device inbox is device identity enrollment.

Intake Fabric solves a different problem: many heterogeneous human and machine sources entering one common Systemia admission contract without confusing **message content**, **source identity**, **mission admission**, and **execution authority**.

## Intended adapters

- email and support inboxes
- public forms
- uploads
- product/API requests
- agent-to-agent handoffs
- field reports
- device/sensor signals
- authorized webhooks
- chat intake
- future Evercraft mobile capture

The goal is one safe front edge for inbound work without forcing every product to invent its own trust and replay rules.
