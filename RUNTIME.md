# Forge Runtime Contract

Forge Operator's canonical runtime is **Evercraft Compute + Yard Runtime Fabric**, orchestrated through **Systemia → Yard Operator**.

GitHub provides durable source and immutable container artifacts. It is not the hosting provider.

## Canonical deployment path

Systemia → Forge/Yard release → CI → immutable image → Yard Operator → Evercraft Compute → Evercraft-owned Linux capacity → route verification → DeploymentReceipt.

See `evercraft.compute.json` and `YARD_OPERATOR.md`.

## Release artifact

`ghcr.io/jgaethle10/forge-operator:latest`

A commit-addressed image is also published for every main-branch release. Yard Operator should deploy the immutable commit/digest form for production.

## Required environment

- `GEMINI_API_KEY` - server-side Gemini credential
- `NODE_ENV=production`
- `PORT` - optional, defaults to 3000

## Optional commercial and attribution environment

- `FORGE_CHECKOUT_URL` - HTTPS checkout or payment URL approved by the human operator
- `CHUM_PUBLIC_ORIGIN` - verified public Forge origin. Set this only after Yard Operator has produced a DeploymentReceipt with the same independently verified live route.
- `CHUM_ATTRIBUTION_SECRET` - signing secret for privacy-minimized CHUM referral tokens.
- `CHUM_ATTRIBUTION_SINK_URL` - HTTPS durable attribution receipt sink.
- `CHUM_ATTRIBUTION_SINK_TOKEN` - optional bearer token used by Forge when writing attribution receipts.
- `CHUM_ATTRIBUTION_INGEST_TOKEN` - trusted backend token for payment-verified and fulfilled attribution events.
- `SYSTEMIA_MACHINE_KEY` - private Systemia machine authority used by the RIVET Yard gateway to request the AliEV commercial snapshot.
- `RIVET_REPORT_GATEWAY_TOKEN` - private server-to-server bearer token required to invoke the RIVET Yard report gateway.
- `ALIEV_YARD_SOURCE_URL` - optional override for the AliEV snapshot source endpoint.
- `RIVET_REPORT_STATE_DIR` - optional runtime state directory for RIVET report receipts.
- `FORENSISCOPE_MCP_BEARER_TOKEN` - Evercraft-owned bearer secret required by the sovereign `/mcp/forensiscope` execution surface during the pre-OAuth migration phase.
- `FORENSISCOPE_DIRECT_FILE_MAX_BYTES` - optional direct AI-client attachment ingress limit. Defaults to 64 MiB and does not redefine the larger internal ForensiScope source ceiling.

If `FORGE_CHECKOUT_URL` is absent, Forge does not display or advertise an active checkout. Pricing remains human-gated.

If `CHUM_PUBLIC_ORIGIN` is absent or invalid, generated public CHUM sales surfaces MUST use the already-live Machine Commerce review door instead of a relative `/api/chum/go/...` URL. A source build or GHCR image is not evidence of a public Forge origin.

If the attribution secret/sink is absent, public discovery may continue, but signed referral persistence and verified-revenue attribution must remain explicitly unproven.

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


## Self-hosted discovery origin

The lightweight public discovery lane can run as `systemia.chum-public-origin.v1` on Evercraft Compute. This resident service is intentionally read-only and serves the public CHUM/LLM/crawler surfaces without exposing private Systemia topology.

A local healthy service does not become `CHUM_PUBLIC_ORIGIN` by inference. Yard must independently verify a public HTTPS route against both the resident instance ID and the bound deployment receipt. The resulting sanitized runtime-origin receipt can then activate Crawl Pressure's live-byte verification and IndexNow broadcast path.


## RIVET Yard report gateway

When both `SYSTEMIA_MACHINE_KEY` and `RIVET_REPORT_GATEWAY_TOKEN` are configured, Forge exposes `POST /api/rivet/reports` as an authenticated server-to-server compatibility edge for the migrating RIVET UI. `GET /api/rivet/report-health` reports only safe configuration state. The gateway fails closed when either secret is absent and does not grant customer or payment authority. Base44 remains a temporary UI/data/auth compatibility client until the live Yard route and fresh-report canary are independently verified.


## ForensiScope sovereign MCP

The target ForensiScope execution surface is `POST /mcp/forensiscope` on the verified Evercraft Compute public route. It runs inside this Forge/Yard container and uses the local `systemia/forensiscope` runtime. Base44 is not a required dependency of this execution path.

During cutover, public registry/plugin URLs may continue to reference the legacy Base44 compatibility endpoint until Yard produces a verified HTTPS DeploymentReceipt for the new route. Do not infer a public URL from source code, a GHCR image, or a locally healthy container. After live-route verification and an attached-media provider acceptance test, switch discovery surfaces to the sovereign endpoint and retire the legacy execution path after its rollback window.

See `docs/forensiscope-sovereign-cutover.md`.
