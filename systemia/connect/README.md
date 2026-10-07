# Evercraft Connect

Evercraft Connect is the governed routing layer for opportunities Evercraft discovers but should not personally execute.

The core rule is:

> If Evercraft is not the right executor, who is?

## Canonical routes

Every admitted opportunity can end in one of four dispositions:

- `EXECUTE`: Evercraft has the fit, capacity, authority, and timing to do the work.
- `PARTNER`: Evercraft should remain in the execution chain, but shared delivery is stronger.
- `CONNECT`: another person or organization is clearly better positioned.
- `MONITOR`: the opportunity is real, but evidence, consent, timing, or capacity is not ready.

## Privacy model

Connect is metadata-first.

- Tier 0: internal full problem state.
- Tier 1: public-safe abstracted need.
- Tier 2: identity / protected operating context, only with owner consent.
- Tier 3+: protected materials, only under NDA or equivalent controlled disclosure.

The matching engine does not require confidential financials, customer lists, private family circumstances, source code, or creative assets just to discover whether a potential match exists.

## Economic guardrails

Supported connection economics are:

- no compensation
- free introduction
- disclosed referral fee
- disclosed success fee
- disclosed revenue share
- co-delivery economics

Regulated categories fail closed for compensated referral structures until compliance review is explicitly recorded.

## Relationship safety

The duplicate-outreach guard preserves one canonical relationship owner per organization/person unless that owner is intentionally transferred.

Do-not-contact entities are removed before ranking.

## Module

`connection-desk.mjs` currently provides:

- connection object validation
- deterministic route selection
- provider ranking
- consent/disclosure gates
- regulated-economics gates
- duplicate outreach protection
- human-gated intro packet generation

Run the focused tests with:

```bash
node --test systemia/connect/connection-desk.test.mjs
```

This module does not send messages, initiate transactions, expose protected data, or create financial/legal obligations.
