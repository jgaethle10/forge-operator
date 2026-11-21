# Systemia Living Graph v0.2

A read-only, standalone HTML prototype for exploring the Systemia operating architecture and imported operational snapshots.

## Current implementation

- Interactive relationship map drawn from the repository's Unified Control Plane, Saban, and Evercraft OS contracts.
- Views for overall architecture, memory paths, mission flow, and evidence reconciliation.
- Node inspector, relationship navigation, filtering, keyboard input, and responsive mobile overview with optional expanded full-size map.\n- Pre-rendered, inline preview-safe graph image plus initial SVG topology: mobile document viewers that restrict JavaScript still show the architecture, with a clear note that interactions require an actual browser.
- Offline JSON import with a bounded `evercraft.systemia.visual-snapshot.v1` schema.
- Imported data visualized as a separate, **unverified snapshot** graph; this prototype never claims any service is currently healthy.
- No network calls, credentials, work dispatch, arbitrary command execution, financial activity, or mutation APIs.

## Data envelope

```json
{
  "schema": "evercraft.systemia.visual-snapshot.v1",
  "observed_at": null,
  "source": "canonical source identifier",
  "nodes": [
    {"id": "worker-1", "name": "NodeSeed-1", "kind": "compute", "status": "unknown", "receipt_id": null}
  ],
  "edges": [
    {"from": "worker-1", "to": "systemia", "relationship": "reports_to"}
  ],
  "receipts": []
}
```

No JSON field conveys execution authority. The UI only displays what a snapshot claims. A production adapter must independently authenticate the source and freshness before it may display a verified health state.

## Next integration gate (not implemented yet)

1. Write a read-only Systemia-owned snapshot exporter. Accept only allowlisted evidence types from Systemia Organism, Context Fabric, Signal Fabric, Saban, Yard/Compute/NodeSeed, and receipts. Do not read private content directly from browser code.
2. Keep Passport scope checks and Context Fabric redaction on the server, before any snapshot leaves the trusted runtime. Redact names, raw prompts, secrets, internal addresses, and PII by default.
3. Bind each displayed claim to `observed_at`, source, provenance, status semantics and receipt reference. Use age limits and explicit `unknown`/`stale`/`held` states; do not transform source presence or plan approval into runtime execution.
4. Serve the graph through Evercraft-owned infrastructure behind the approved Identity/Passport front door, with a narrow, authenticated, read-only data endpoint. Do not use Base44 or introduce a new independent mission authority.
5. Test live on Node001 and NextGen individually and in failure scenarios. On lost telemetry show a stale/unknown state, never a counterfeit green state.
6. Include drill-down from memory/mission to signed evidence and show cause/effect between intake, permissions, work, artifact, delivery and receipt.

## Local use

Open `index.html` in a modern browser. In iPhone document previews that suppress JavaScript, the page still shows a static map; open in Safari or Chrome for interactive selection, search and imported-snapshot graph rendering. Click any node for the right-side inspector. Use the **JSON template** button to get the expected import structure, then **Import evidence JSON** to explore a snapshot. File data is parsed in the browser and not uploaded anywhere.

## v0.2 verification (November 4, 2026)\n\n- Headless Chromium at 390 px and 1280 px confirms the 15-node map appears with JavaScript both enabled and disabled.\n- The fallback image is embedded in the HTML; the download remains a single file.\n- Mobile Expand map works without JavaScript via CSS; a true browser provides clickable nodes, memory filtering, and snapshot import.\n- These tests are **browser emulation, not an on-device iPhone Safari test**.\n\nSource anchors:

- `systemia/control-plane/README.md`
- `systemia/saban/README.md`
- `systemia/context-fabric/README.md`
- `systemia/evercraft-os/README.md`

## v0.3 One-Body handoff snapshot support

The Import snapshot view now displays `summary.counts` and a bounded list of `summary.gap_samples` when included in an `evercraft.systemia.visual-snapshot.v1` import. Handoff edges are distinguished visually:

- `planned_unverified`: no authenticated consumer receipt is currently supplied
- `unobserved_overdue`: expected observation window passed; this is not evidence of failure
- `consumer_receipt_verified`: an authoritative backend verifier accepted the consumer acknowledgement (not payment or execution proof)
- `invalid_event_time`: event time is unusable or in the future

All imported labels and summary details are displayed using text-only DOM APIs rather than parsing source strings as HTML.

The complementary, read-only exporter lives in `systemia/organism/one-body-visibility.mjs` on the separate draft branch [One-Body cohesion PR #1849](https://github.com/jgaethle10/forge-operator/pull/1849). Both changes need review, merging, and real, authorized backend wiring before the UI can be called live.

**Validation (2026-11-04):** local headless Chromium at 390px and 1280px with an explicitly synthetic snapshot: summary visible, unobserved-overdue edge styled, graph nodes rendered, and no JS page errors. No actual iPhone or production runtime was tested.
