# Systemia Unified Control Plane

This directory is the executable contract for Evercraft's one-machine operating model.

The rule is simple:

```
intent
  -> Systemia admission
  -> dependency and human-gate checks
  -> specialist route
  -> optional Saban scale
  -> Yard / Compute runtime handoff when needed
  -> observed evidence and receipts
  -> Systemia reconciliation
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

Products such as RIVET, AliEV, ForensiScope, EventWave, FindMyPart, FAIE, and future products attach to this control plane as capabilities. They do not need to reinvent orchestration, scaling, deployment, discovery, or receipt semantics.

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

This control plane is intentionally provider-independent. It is meant to survive movement away from Base44 and other temporary hosting or orchestration layers without changing Evercraft's core operating doctrine.
