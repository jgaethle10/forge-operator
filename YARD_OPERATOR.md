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

## Private control-plane workloads

Forge Operator may carry the **public handoff contract** for a private Systemia workload without becoming the source repository for that workload.

For SYSTEMIA Core / Collider specifically:

- the actual Core source repository must be private
- this public repository stores only the provider-neutral handoff under `systemia/core/`
- Yard resolves the private source through an authorized opaque repository/release reference
- private repository identity, private topology, secrets, mission records, and privileged state are not published here
- moving a release through GitHub does not widen payment, publication, sensitive-data, or external-action authority
- production cutover still requires CI, immutable artifact identity, runtime admission, health/route verification, rollback state, and a deployment receipt

See `systemia/core/public-handoff.json`.
