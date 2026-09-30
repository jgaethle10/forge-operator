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
- `REWARDS_GATEWAY_TOKEN` - private server-to-server bearer token for the sovereign Rewards migration edge.
- `REWARDS_STATE_DIR` - optional durable state directory for the owned Rewards service. Defaults to `/tmp/evercraft-rewards` for development only; production Yard leases must bind durable authorized storage.

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


## Evercraft Rewards Yard migration edge

Forge now exposes a first-party Rewards migration boundary:

- `GET /api/rewards/health` - safe runtime/configuration health. It exposes no customer identifiers.
- `POST /api/rewards/profile` - authenticated server-to-server Scratch Lab profile read.
- `POST /api/rewards/scratch/play` - authenticated idempotent cosmetic Scratch Lab write.

This first slice intentionally has **no economic write authority**. It cannot mutate wallet points, Arcade XP, prize entries, cash value, promotional odds, provider fulfillment, or the Daily Prize Ticket. Subject identifiers are hashed in the owned store, writes are atomic, and duplicate run keys are idempotent.

Base44 remains temporary compatibility for the unmigrated Rewards wallet/auth/value surfaces only. The Scratch Lab owned-runtime canary must pass persistent-storage, route, rollback, and observation gates before any Base44 Scratch Lab write path is retired.


## Evercraft Clip owned public edge

Forge/Yard now carries a read-only Clip discovery and planning edge:

- `GET /api/clip` - capability discovery; `?view=openapi` and `?view=llms` expose machine-readable documentation.
- `POST /api/clip` - deterministic non-executing `capabilities`, `plan_job`, and `plan_distribution_campaign` actions.
- `GET /mcp/evercraft-clip?action=health` - owned MCP health.
- `POST /mcp/evercraft-clip` - Streamable HTTP JSON-RPC for `get_clip_capabilities`, `plan_clip_job`, and `plan_distribution_campaign`.

The owned public edge has no upload, checkout, payment, rendering, or publication authority. Existing provider execution lanes remain compatibility-only until each first-party social adapter passes provider authorization, live canary, readback, rollback, and observation gates. Do not update the public Clip registry away from its legacy endpoint until the Yard route and MCP contract are independently verified.


## Owned social provider adapters

Forge now carries the first direct provider adapter used to remove Clip's Base44 OAuth/runtime dependency:

- `META_USER_ACCESS_TOKEN` - Meta user token held only in the private runtime secret store.
- `META_EPS_PAGE_ID` - expected EPS Facebook page ID.
- `META_GRAPH_VERSION` - optional Graph API version, default `v23.0`.
- `EVERCRAFT_FACEBOOK_PUBLISH_ENABLED` - explicit fail-closed publish switch.
- `SOCIAL_PROVIDER_OPERATOR_TOKEN` - private operator token for provider canaries.
- `GET /api/social/providers/health` - safe readiness only; never returns provider secrets.
- `POST /api/social/providers/facebook/identity-canary` - verifies page identity and create-content authority without publishing.

The provider primitive can publish a feed post and requires exact provider-visible message readback before returning `verified: true`, but no autonomous queue is routed to it until credentials, live canary, rollback and observation gates pass.


## RIVET AliEV source boundary

`ALIEV_YARD_SOURCE_URL` is mandatory for RIVET report generation and must resolve to an Evercraft-owned AliEV evidence service. There is no Base44 default or compatibility fallback. If the owned AliEV source is not configured, the RIVET report gateway reports itself unconfigured and holds report generation rather than tunneling through the legacy platform.


## AliEV owned public edge

Forge/Yard now carries the non-transactional AliEV agent surface:

- `GET /api/aliev` - capabilities; `?view=offers` returns the paid-depth catalog.
- `POST /api/aliev` - `capabilities`, `offers`, `create_handoff`, and `analyze_site`.
- `GET /mcp/aliev?action=health` and `POST /mcp/aliev` - owned MCP for capabilities, offers, paid-depth human review, and source-gated site screening.
- `GET /aliev/review` - owned human review page. It creates no checkout, payment, entitlement, report access, or outreach.
- `ALIEV_PUBLIC_SCREEN_SOURCE_URL` - optional owned public-screen evidence source. If absent, `analyze_site` returns a migration hold. Base44 hosts are rejected.
- `ALIEV_YARD_SOURCE_URL` may serve as the same owned evidence source when one service supports both public and RIVET snapshot profiles.

Checkout creation and purchase status are intentionally unavailable on this owned edge until the first-party commerce execution rail is independently verified. Public registry URLs remain on the legacy route until the owned site evidence source and Yard route pass parity/canary.
