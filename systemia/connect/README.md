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


## Recovery Radar + Capability Mesh bridge

Evercraft Connect now has a source-level bridge for the Partner-Before-Purchase / Recovery lane.

`fabric-bridge.mjs` can:

1. convert a Recovery candidate into a metadata-first `Connection`;
2. read Evercraft's public product directory plus live Capability Mesh declaration state;
3. score owned Evercraft capabilities without upgrading discovery metadata into runtime proof;
4. combine owned capability candidates with external human/company providers;
5. preserve unmatched capability gaps instead of inventing a partner;
6. produce a safe Opportunity Fabric handoff packet.

The Opportunity Fabric handoff is deliberately non-transactional. It contains public-safe opportunity metadata and an execution-chain suggestion only. It does **not** create a ConnectionRequest, team invitation, work acceptance, payment, protected disclosure, or legal agreement.

This connects the systems without collapsing their trust boundaries:

```
Recovery Radar candidate
  -> Evercraft Connect routing
  -> Capability Mesh evidence
  -> EXECUTE / PARTNER / CONNECT / MONITOR
  -> safe execution-chain proposal
  -> human review
  -> Opportunity Fabric private-runtime workflow, when appropriate
```

Opportunity Fabric remains the protected collaboration/execution system. Evercraft Connect is the cross-portfolio routing and connection-decision layer.
