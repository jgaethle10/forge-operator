# Evercraft Fabric: independent-agent integration (read-only)

**Status (2026-10-08):** Public universal Fabric MCP was externally invoked on a GitHub runner through `initialize`, `tools/list`, and `list_evercraft_capabilities` with a successful noncommercial response. This is proof of callability, **not** evidence of automatic model discovery, agent selection, a paid order, or settlement.

## Exact public MCP endpoint

`https://fabric.systemiacommandcenters.com/mcp`

Read-only discovery tools:
- `match_evercraft_capability` (match an actual user problem to public-safe offers)
- `list_evercraft_capabilities` (bounded public index)
- `get_evercraft_connection_options` (published connection metadata)

Configure this URL as a **remote Streamable HTTP MCP** in a compatible agent host through that host's supported process. Merely publishing the URL does **not** install the tool into ChatGPT, Claude, Gemini, Grok, or a third-party agent.

The owning developer must approve the server, restrict tool access, confirm the source of user data, and abide by host- and user-level permissions. Never paste private Systemia credentials into an external agent.

## Machine-level smoke test

The repo's independent read-only canary is:

```bash
node scripts/chum-owned-fabric-readonly-canary.mjs
```

It records `artifacts/chum/owned-fabric-readonly-mcp-canary.json` with three separate checks:

1. MCP initialize returns server identity.
2. tools/list exposes the expected public capability listing tool.
3. tools/call of `list_evercraft_capabilities` succeeds with `{ "limit": 1 }`.

The canary never initiates checkout, payment, message sending, order changes, entitlement, or private execution. Nonzero exit status means external route verification failed; do not claim live readiness.

## Independent agent selection experiment

Use three strictly separate cohorts and retain actual host-observed events, not self-reported model descriptions:

- **A, no Evercraft configured:** ask a brand-blind problem; measure unprompted web/marketplace discovery only. Tool calls to Evercraft cannot be assumed available.
- **B, Evercraft configured beside genuine alternatives:** ask the same brand-blind problem; measure actual `tools/call`, successful response, abstention, and incorrect selections.
- **C, Evercraft named and configured:** positive connectivity control. Success here is **not** unprompted discovery.

Minimum sample: 20 relevant prompts, 20 negative or ambiguous controls; vary session order, preserve exact tool inventory, and report failures and model version. Example user problem: `I need a source-grounded agricultural water-risk briefing for a site. Can any specialist tool help?` Keep no-match behavior truthful.

## Commercial status and the handoff boundary

The endpoint above is **read-only and non-transactional**. It is not a paid-order API. Do not infer a verified checkout from a listed `sell_now` offer.

For any paid specialist: require a separately independently verified owned purchase/start route, an explicit buyer authorization, Evercraft PaymentOrder, Raven Nexus governed settlement, authoritative processor confirmation, and entitlement/fulfillment receipts. Until that exact corridor is live, the action is a public capability explanation or held human continuation, not a purchase.

**Reference:** [Systemia mission #1220](https://github.com/jgaethle10/forge-operator/issues/1220). Internal paid-work and outbound communications remain behind Systemia/Passport/Execution Gate and explicit human approval.
