# Black Box × Spider Society | Visual Operations RC01

**Status:** Review-only, source-locked, offline **synthetic replay**. This is not a live operation center and does not enable remediation. The implementation extends the existing Agent Continuity and Black Box evidence contract. It does not create another orchestration system or source of truth.

## What the visual floor does

The Incident Observatory is a standalone interactive HTML viewer for one incident envelope:

- **Continuity topology:** worker, external action, possible downstream nodes, Black Box assessment, Spider Society persistence hypothesis, Systemia admission hold and Network delivery state.
- **Six-scene replay:** select a reconstruction phase or play the ordered analysis. These are **analyst scenes, not raw observed event timestamps**.
- **Evidence inspector:** click any graph node for its evidence classification, source-locked state and scope.
- **Evidence ledger:** inspect uncertainty, no-authorization boundaries and SHA-256 input fingerprint.
- **Portable evidence export:** export the projected, allowlisted packet as JSON. No secrets or raw incident logs are read by the browser.
- **Conservative UX:** no provider verification, no production scan, no containment, no Systemia admission, no settlement, and no physical Network proof are claimed.

The visual system consumes the existing reconcileIncident function directly. It fails closed when the synthetic inputs fail the Black Box / Spider identity and evidence gates. The rendered view is a derived projection, not a new evidence authority.

## Reproducible local demo

From repository root with Node 20+:

    node --test systemia/agent-continuity/visual-ops/packet.test.mjs
    node systemia/agent-continuity/visual-ops/build.mjs \
      systemia/agent-continuity/scenario.synthetic.json \
      systemia/agent-continuity/visual-ops/assessment.synthetic.json \
      /tmp/evercraft-agent-visual-ops.html

Open the resulting /tmp/evercraft-agent-visual-ops.html in any modern browser. It is self-contained and requires no API keys, CDN, external assets, hosted account or Base44 dependencies.

To use the actual existing Go Black Box inspector instead of the minimal compatible synthetic assessment sample:

    (cd integrations/entire-blackbox && go run . inspect examples/unknown.json) > /tmp/blackbox-assessment.json
    node systemia/agent-continuity/visual-ops/build.mjs \
      systemia/agent-continuity/scenario.synthetic.json \
      /tmp/blackbox-assessment.json /tmp/evercraft-agent-visual-ops.html

The existing Entire Black Box evidence CI workflow now tests the visual read-model and offline HTML build.

## Promotion path without misleading customers

1. **Real sources:** permission-scoped telemetry, verified source identity, provenance and tenant separation for agent runtimes, schedules, queues, callbacks, provider readbacks and custody.
2. **Read-only live connector:** canonical Systemia incident admission and independently verified producer/transport/consumer receipts, reconnect/replay cursor, stale-data detection and explicit evidence strength.
3. **Safe operations:** scoped independent approval through Identity / Passport / Execution Gate, explicit action preview and reversible adapters with operator accountability. No self-approval or blind retries with unknown side effects.
4. **Commercial experience:** incident room, customer-safe sharing, risk/uncertainty views, multi-incident library, evidence export and explicit paid entitlement checks before gated services.
5. **Verification:** authentication, cross-tenant denial, malicious payload redaction, provider readback, no-regeneration probe, continuity across power loss and independent adversarial review.

Do not market the offline RC01 viewer as production containment, live Entire integration, auto-remediation or a deployed hosted dashboard. Live incident evidence must never be sent to an unauthenticated public visualization endpoint.

**Canonical mission:** evercraft-agent-continuity-fabric-20261016. **Parent engineering review:** https://github.com/jgaethle10/forge-operator/pull/1291
