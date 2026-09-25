# Yard Operator Deployment Contract

Forge Operator's canonical production path is:

Systemia admission → Forge/Yard release → GitHub immutable source/release artifact → Yard Operator → Evercraft Compute / Sovereign Compute Fabric → Evercraft-owned Linux capacity → public route → independent verification → deployment receipt.

GitHub is the source and artifact registry. It is not the runtime provider. DigitalOcean is not part of the canonical Forge deployment path.

## Expected Yard Operator lifecycle

The bounded deployment interface is expected to support these operations:

1. `deploy_release`
2. `deployment_status`
3. `verify_route`
4. `get_live_url`
5. `rollback_release`

The runtime desired state is declared in `evercraft.compute.json`.

## Admission rules

- provider preference must be `evercraft-owned`
- no infrastructure-provider fallback is permitted unless explicitly authorized
- deployment must consume a CI-passing release
- the deployed container must pass `/api/health`
- public discovery surfaces must resolve after routing
- checkout remains disabled unless a human-approved `FORGE_CHECKOUT_URL` is supplied
- release completion requires a deployment receipt containing the live route and rollback target

## Runtime handoff

The release artifact is published to GHCR only as a durable transport artifact. Yard Operator should hand the immutable image digest to Evercraft Compute, which allocates authorized Linux capacity through the internal compute fabric and binds the public route after verification.

## Executable operator

The deployment boundary is implemented in `systemia/yard/operator.mjs`.

The operator consumes immutable release references, negotiates an `evercraft.capacity.v1` lease, invokes only an admitted workload, persists deployment state, verifies receipt completeness, and records rollback handoff authority.

The first executable private workload is `systemia.private-core-origin.v1`, implemented by Evercraft Compute without any named cloud-provider dependency.


## CHUM public origin

Evercraft Compute admits `systemia.chum-public-origin.v1` as a read-only discovery workload. It serves only the admitted `public/` tree, blocks path escape and write methods, exposes `/api/health`, and dynamically emits absolute sitemap and robots references at the verified route.

Yard treats local service health and public-route verification as separate states. A healthy local origin is not a public deployment. `verifyPublicRoute` must observe the exact resident `instance_id` and bound deployment receipt through a public HTTPS origin before the route is marked verified. Only then may `runtimeOriginReceipt` emit the sanitized `evercraft.runtime-origin.v1` record consumed by CHUM Crawl Pressure. Capacity node IDs, lease credentials, private endpoints and internal topology are not included in that public receipt.
