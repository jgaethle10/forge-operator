# SYSTEMIA Core / Collider GitHub Boundary

This directory is the **public handoff contract** between Forge/Yard and the private SYSTEMIA Core / Collider control plane.

It is intentionally **not** the SYSTEMIA Core source tree.

## Identity boundary

- **SYSTEMIA Core / Collider** is Evercraft's private internal control plane for mission orchestration, Capability Fabric, checkpoints, execution policy, evidence, and staged authority.
- **SYSTEMIA Marketing Agency** is a separate public customer-facing product.
- **Forge Operator** is a public operational front door and Yard deployment bridge.
- **Evercraft Machine Commerce** is a neutral public machine-commercial authority. It is not hosted by the Marketing Agency.

These identities must not be collapsed because they happen to share historical names or legacy infrastructure.

## Source-control boundary

Private SYSTEMIA Core source must live in a **private GitHub repository**. This public repository may contain only:

- provider-neutral deployment contracts
- public-safe schemas and interface descriptions
- conformance rules
- public machine-discovery metadata
- opaque release references
- deployment receipt requirements

This public repository must not contain:

- private app or workspace identifiers
- private endpoints or internal topology
- credentials, tokens, cookies, secrets, or session material
- private customer or mission data
- privileged execution state
- private Systemia, Raven, or Collider records

## Canonical release flow

```
Systemia admission
  -> private Core source/release
  -> CI
  -> immutable artifact
  -> Yard Operator
  -> Evercraft Compute
  -> route + health verification
  -> DeploymentReceipt
```

A build, Git commit, image push, or reachable endpoint is not by itself deployment proof. Production completion requires the configured verification gates and a deployment receipt.

## Authority

Moving source into GitHub does not widen authority. Payment, publication, outreach, privileged access, sensitive data, external side effects, and consequential fulfillment retain their existing confirmation and authorization gates.

See `public-handoff.json` for the machine-readable boundary.
