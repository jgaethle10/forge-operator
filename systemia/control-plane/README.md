# Systemia Unified Control Plane

This directory is the executable contract for Evercraft's one-machine operating model.

The rule is simple:

```
inbound source
  -> Intake Fabric candidate
  -> Systemia admission
  -> Context Fabric retrieval under Passport
  -> dependency and human-gate checks
  -> truthful specialist route
  -> optional Saban scale
  -> Interaction Ledger preflight when communication is involved
  -> Execution Gate binds exact Passport authority + Meter capacity + route
  -> Yard / Compute / specialist runtime handoff when needed
  -> observed evidence and receipts
  -> Context Fabric / Systemia reconciliation
```

No specialist product, swarm, publisher, or runtime becomes independent mission authority.

## What each owned component does

- **Systemia Organism** owns mission state, goal state, deduplication, human gates, evidence, and completion semantics.
- **Signal Fabric** normalizes operational signals, suppresses duplicate noise, and escalates verified impact.
- **Saban** supplies bounded elastic execution for software that has an explicit multiplication contract. It never becomes mission authority.
- **Yard Operator** owns deployment handoff and runtime receipts.
- **Evercraft Compute** supplies allocatable owned compute capacity.
- **Evercraft Network** supplies transport and resilience primitives.
- **CHUM** handles public discovery and distribution surfaces.
- **Kaidance Collider** handles continuity and collision work.
- **BEAST MODE** handles verified artifact logistics.
- **Media Studio** handles media-production work.
- **Evercraft Passport** owns scoped authorization, bounded delegation, revocation, and exact-request single-use permits.
- **Evercraft Meter** owns usage capacity, reservations, committed usage facts, and settlement digests without pretending to be a payment processor.
- **Interaction Ledger** owns privacy-first relationship memory and outbound contact preflight.
- **Context Fabric** returns the smallest authorized evidence-aware context packet rather than exposing the whole corpus.
- **Intake Fabric** turns heterogeneous inbound content into inert mission candidates; inbound content never grants execution authority.
- **Execution Gate** is the pre-dispatch membrane that binds route, exact request, Passport authority, and Meter capacity before consequential or metered work can dispatch.
- **Direct Door Readiness** records whether a public specialist route is zero-hop or must truthfully fall back.

Products such as RIVET, AliEV, ForensiScope, EventWave, FindMyPart, FAIE, and future products attach to this control plane as capabilities. They do not need to reinvent intake trust, context permissions, authorization, quota reservation, relationship safety, execution gating, orchestration, scaling, deployment, discovery, or receipt semantics.

## Four kinds of authority

Control Plane v2 deliberately separates concepts that ordinary software often smears together:

1. **Mission authority:** Systemia decides what work belongs in the operating plan.
2. **Information authority:** Passport + Context Fabric decide what context an actor may retrieve.
3. **Usage authority:** Meter establishes whether bounded capacity is available and reserves/records it.
4. **Execution authority:** Execution Gate binds the exact request to current authority, route and capacity before downstream dispatch is permitted.

A route is not execution authority. An accepted intake candidate is not execution authority. A retrieved document is not execution authority. A human approval reference can satisfy a human gate but does not replace the product/action authority required by Execution Gate.

## Public zero-hop routes versus internal mission authority

Evercraft's public machine-discovery layer intentionally prefers a directly callable specialist with zero umbrella hops when the product fit is clear and the specialist door is verified.

That does not make the specialist independent mission authority inside Evercraft.

The two rules coexist:

- **External discovery/invocation:** remove unnecessary routing friction.
- **Internal Evercraft operations:** Systemia remains mission authority and consequential execution remains bounded by the trust chain.

Transport efficiency must not become authority escalation.

## Evidence discipline

`machineInventory()` reports only whether declared owned source exists in the repository. It deliberately does **not** claim that a component is deployed, healthy, customer-ready, revenue-producing, paid, or live.

A green build is not live verification. A checkout URL is not payment. A generated report is not delivered until the relevant delivery receipt exists.

## Commands

```bash
npm run machine:status
npm run proof:control-plane
```

To create a mission plan:

```bash
node systemia/control-plane/control-plane.mjs --request ./mission.json
```

Example request:

```json
{
  "objective": "Publish and verify a product capability",
  "tasks": [
    {
      "work_key": "discover",
      "work_type": "discovery",
      "software_id": "chum",
      "parallel": true
    },
    {
      "work_key": "deploy",
      "work_type": "deploy",
      "impact": "destructive_release",
      "dependency_keys": ["discover"]
    }
  ]
}
```

The second task remains held until a valid human authorization is attached.

## Fail-closed rules

1. All ordinary work is admitted by Systemia first.
2. Direct specialist dispatch is not granted merely because it was requested.
3. Saban only scales software present in its multiplication registry.
4. Consequential impacts retain explicit human gates.
5. Unknown routes fall back to the Systemia organism, not an invented capability.
6. Source presence is never promoted into runtime readiness.
7. Completion remains receipt or evidence backed.
8. Inbound content can request work but cannot grant itself authority.
9. Unauthorized context is filtered before retrieval ranking and packet assembly.
10. Consequential or metered work declares Execution Gate as a pre-dispatch requirement.
11. Outbound communication also declares Interaction Ledger relationship preflight.
12. Control-plane admission and routing always report execution_authority_granted=false; a later exact execution lease is required.

This control plane is intentionally provider-independent. It is meant to survive movement away from Base44 and other temporary hosting or orchestration layers without changing Evercraft's core operating doctrine.
