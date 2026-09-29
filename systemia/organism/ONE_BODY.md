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

## Proof

Run:

```bash
npm run proof:one-body
```

The proof specifically covers the failure mode that exposed the gap: a RIVET procurement signal can no longer stop at “canonical record created.” It must either become an active commercial opportunity, a missed-primary recovery path, or a documented non-commercial result.
