# Forge Runtime Contract

Forge Operator is packaged as a container so Systemia Yard or any compatible runtime can consume the same verified artifact.

## Image

`ghcr.io/jgaethle10/forge-operator:latest`

A commit-addressed image is also published for every main-branch release.

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

Public AI endpoints are rate-limited in-process to reduce accidental or abusive model spend. A shared distributed limiter should replace the in-process limiter when Forge scales horizontally.
