# Forge Runtime Contract

Forge Operator's canonical runtime is **Evercraft Compute + Yard Runtime Fabric**, orchestrated through **Systemia → Yard Operator**.

GitHub provides durable source and immutable container artifacts. It is not the hosting provider.

## Canonical deployment path

Systemia → Forge/Yard release → CI → immutable image → Yard Operator → Evercraft Compute → Evercraft-owned Linux capacity → route verification → DeploymentReceipt.

See `evercraft.compute.json` and `YARD_OPERATOR.md`.

## One-organism coordination

Systemia's provider-independent coordination kernel lives under `systemia/organism/`.

A release that can dispatch multi-agent or elastic-agent work must preserve these invariants before runtime admission:

- one canonical mission state;
- human/authority gates before execution;
- required assigned-agent memory freshness before ordinary work;
- memory-repair exemption so stale memory can heal without deadlock;
- equivalent-work suppression before execution;
- observed postflight reconciliation with a coordination receipt.

`npm run proof:organism` is part of the repository's required `npm run check` path. A green source proof does not itself prove Yard deployment.

## Release artifact

`ghcr.io/jgaethle10/forge-operator:latest`

A commit-addressed image is also published for every main-branch release. Yard Operator should deploy the immutable commit/digest form for production.

## Required environment

- `GEMINI_API_KEY` - server-side Gemini credential
- `NODE_ENV=production`
- `PORT` - optional, defaults to 3000

## Optional commercial environment

- `FORGE_CHECKOUT_URL` - HTTPS checkout or payment URL approved by the human operator

If `FORGE_CHECKOUT_URL` is absent, Forge does not display or advertise an active checkout. Pricing remains human-gated.

## Health and discovery

- `GET /api/health`
- `GET /api/capabilities`
- `GET /api/commercial`
- `GET /llms.txt`
- `GET /.well-known/evercraft-capabilities.json`

## Invocation

- `POST /api/forge` - diagnosis and prioritized plan
- `POST /api/forge/deep-dive` - implementation blueprint

Public AI endpoints are rate-limited in-process to reduce accidental or abusive model spend. A shared fabric-level limiter should replace the in-process limiter when Forge scales across multiple Evercraft Compute leases.
