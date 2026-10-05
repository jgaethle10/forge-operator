# Terrain-Aware Mesh + Critical-Infrastructure Trust Boundaries

Evercraft Network should understand the ground beneath a route, not only the graph between nodes.

This module adds a bounded terrain-aware planning contract that can feed a 3D Evermaps/network surface while preserving the evidence discipline already used elsewhere in Systemia.

## What it adds

1. **Terrain-aware path admission**
   - Nodes carry latitude, longitude, elevation, antenna height, authorization state, sensitivity, and evidence state.
   - Links may carry an elevation profile plus source provenance.
   - A supplied terrain profile is compared with the straight-line path between endpoint antennas.
   - Terrain clearance remains **modeled**, even when the source DEM is authoritative. It does not become field-verified radio performance.

2. **Observed vs modeled routing**
   - `verified` and `observed` links are eligible by default.
   - `modeled` links require an explicit mission opt-in.
   - Missing evidence is never converted into a green link.
   - Route output records the weakest evidence state across the selected path.

3. **3D scene contract**
   - The planner emits `evercraft.terrain-mesh-scene.v1`.
   - Evermaps or another renderer can place nodes at elevation and draw the selected route over terrain.
   - The scene carries terrain-source identifiers so the visual can preserve source lineage rather than becoming decorative geography.

4. **Relay placement intelligence**
   - Candidate relays are ordinary authorized nodes.
   - A route can prefer a ridge or high point when the direct path is terrain-obstructed.
   - The planner does not invent or deploy hardware, alter radios, or perform flight control.

5. **Critical-infrastructure guardrails**
   - Sensitive nodes may be labeled `restricted`, `critical`, or `sensitive`.
   - Public scene output strips exact coordinates for those nodes.
   - Authorization is required for every node and link used.
   - Mission intent is gated against interception, jamming, targeting, credential theft, exfiltration, mass surveillance, and similar misuse.

6. **Receipts**
   - Every plan carries a deterministic SHA-256 receipt over the mission boundary, selected route, evidence policy, terrain sources, and public/private view.
   - Receipts do not prove physical RF performance. They prove what inputs and policy state produced the software decision.

## Proof

Run:

```bash
npm run proof:terrain-mesh
```

The proof checks that:

- a terrain-blocked direct path is rejected;
- a ridge relay can produce an admitted route;
- modeled links fail closed unless explicitly allowed;
- a public view redacts a critical node's coordinates;
- disallowed intent is denied;
- a deterministic receipt is emitted.

## Truth boundary

This is a **software planning proof**. It does not claim FCC/regulatory authorization, physical mesh range, LoRa/Meshtastic/MeshCore compatibility, Fresnel-zone accuracy, antenna-pattern behavior, propagation under weather/foliage, or field-verified link quality.

Those claims require adapter-specific implementation plus real-world test receipts.

## Product direction

The 3D mesh view should ultimately combine:

- terrain/elevation;
- node health and last-seen state;
- link evidence state;
- observed vs modeled coverage;
- authorized relay candidates;
- dead-zone/obstruction explanations;
- store-and-forward opportunities;
- emergency routing;
- provenance for every terrain and radio-derived layer;
- public redaction for sensitive infrastructure.

The UI should make uncertainty visible rather than painting every line green.
