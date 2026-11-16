# Evercraft Human Experience Sentinel

This lane makes the human-visible product experience part of portfolio integrity.

Systemia owns admission and repair routing. Saban fans bounded, read-only inspections across every product in the public Evercraft directory. The existing Customer Gauntlet / Raven Nexus lane remains the authority for rendered screenshots, pixel-level beauty, keyboard behavior, and deep interaction.

## What is checked

- public availability and HTTP failure
- obvious error shells and unfinished/default copy
- retired or unclear brand identity
- mobile viewport and rigid-width risks
- document language, image alt coverage, and unnamed controls
- placeholder/dead links and missing interaction affordances
- static beauty defects that can be proven without rendering

A static HTML response is never treated as proof that the rendered UI is beautiful. SPA shells become BLOCKED until the owned browser lane supplies a visual receipt.

## Severity

- P0: dead/unreachable public surface
- P1: broken human path, server failure, legacy-brand leak, visible runtime failure
- P2: polish, metadata, mobile/accessibility risk
- BLOCKED: a required human/browser check could not be executed and therefore does not count as PASS

The reconciled receipt is written to `artifacts/human-experience/latest.json` and is ingested by Portfolio Sentinel so the same Systemia repair queue owns the defect.

## Brand-source contract (v1)

The existing visual and mobile guardrails now have an explicit, first-party source check:

```bash
npm run test:design-contract
node systemia/experience/design-contract.mjs
```

`DESIGN.md` is the agent-readable cross-product guidance; `design-contract.mjs` records the observed root colors and basic focus/HTML affordances in Headquarters and Work Saban. Product-specific brand differences, including the seven commercial brand worlds, remain authoritative in their own existing sources.

This test is included in `check:ai`. It runs without external services, packages, secrets or telemetry. A `source_pass` proves only checked source declarations. It is neither a browser/pixel audit nor Systemia release authority. Keep Customer Gauntlet and Raven Nexus visual receipts as separate admission requirements.
