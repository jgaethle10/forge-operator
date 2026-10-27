# Evercraft Work Saban · formation preview v0.1

**Product:** Evercraft Work Saban. **Promise:** You bring the work. Saban brings the team.

This first vertical slice accepts an ordinary office request, dynamically selects specialist roles, creates dependency waves, surfaces permissions, and returns a machine-readable, non-executing mission proposal. It uses the real Saban formation DAG utility; it does **not** claim to dispatch AI models or connected tools. Team cards always say `proposed_not_running`.

## Run locally

```bash
node systemia/work-saban/mission.mjs --task "Analyze monthly sales and build presentation slides"
node systemia/work-saban/mission.proof.mjs
node systemia/work-saban/server.mjs
# browse http://127.0.0.1:8789
```

The preview binds only to loopback and stores no task submissions. The server allows only JSON POST requests to `/api/compose`, rejects cross-origin requests, and has a 16 KiB request ceiling. The UI escapes user-visible text using `textContent`. There is no paid tier or payment action.

## Next governed runtime integration

1. Authenticate an employee and bind team/task to a private workspace with retention policies.
2. Map specialist roles to approved `systemia/saban/multiplication-registry.json` software contracts. Do not turn generated role strings into executable code paths.
3. Obtain consent per connected source, per outbound action, per spend. Default to preparing drafts and analysis only.
4. Admit missions through Systemia; use existing Saban `admission.mjs`, `registered-worker.mjs`, scheduler, NodeSeed leases, and receipt checks, never shadow execution.
5. Stream actual agent/tool events to the UI. Maintain an honest distinction among proposed, queued, executing, verified, and delivered states.
6. Verify provenance/quality, durable idempotency, tenancy, redaction, retry behavior, quotas and end-to-end outcomes before a customer-facing release.

## Acceptance criteria for preview

- Arbitrary nontrivial office text yields a clear team and DAG with deterministic role selection.
- Data task includes Analyst; writing task includes Communications; slides include Designer.
- Concurrent specialists share a wave; auditor waits for specialists; coordinator waits for auditor.
- Invalid or oversized inputs are rejected.
- Formation does not authorize external side effects, account access, payments, or compute.
- No live agent execution is claimed absent independent receipts.

This is a deployable preview foundation, **not** evidence of autonomous task completion or a functioning checkout.

## Governed local execution v0.2

The local product preview now has a **Run example team** action. It runs a **clearly synthetic** six-row, three-month sales CSV fixture against a **registered Saban multiplication contract** with five independent role assignments in dependency order:

1. Analyst: validate month/revenue CSV and sum exact integer cents by month.
2. Writer: generate a fact-only written summary without invented causes.
3. Designer: package a Markdown report with source SHA-256 and monthly table.
4. Auditor: independently recompute each monthly total and the latest change, verify input provenance and report hash, and fail closed on discrepancies.
5. Coordinator: prepare the audited result for explicitly authorized local delivery.

Each specialist goes through Saban's canonical registered-worker boundary, work-state lease / scheduler, admission constraints and per-stage quality checks. This is **actual local deterministic software execution**, but not model inference, a remote enrolled HP/Chromebook worker, or end-user identity/authenticated multitenant execution. A current operator must run it locally; no background service or customer-facing checkout is implied.

Try the CLI with synthetic data:

```bash
node systemia/work-saban/execute-local.mjs --demo --out /tmp/work-saban-deliveries
node systemia/work-saban/execute-local.proof.mjs
```

For an owned CSV you authorize locally:

```bash
node systemia/work-saban/execute-local.mjs --csv /path/to/monthly-sales.csv --approve-local-read --out /path/to/approved-private-output
```

Only month and revenue columns are analyzed. Input size is bounded to 256 KiB and 2,000 rows. There is **no HTTP customer CSV upload** or third-party account access. The report is written only to an explicit local output directory, alongside a receipt with the input/report digest and worker verification timeline. The source CSV is not uploaded or bundled into the receipt. Temporary test files are removed during CI.

This proves a narrow real office-work outcome with evidence. It does **not** establish generative multi-agent quality, production autonomy, distributed compute readiness, server-side customer security, any payment, or broad office task support. Those require separate gates from Issue #1630.


## Visual Work Floor v0.3 (TraceOffice-style experience)

The default local preview now opens into an **isometric virtual office** with six inspectable stations: Mission Director, Data Analyst, Communications Specialist, Presentation Designer, Quality Auditor and Delivery Coordinator. These are visual representations of task roles, not six separate installed language models.

- **Actual worker telemetry:** \`POST /api/run-demo-stream\` and \`POST /api/run-csv-stream\` return NDJSON observations: \`accepted\`, \`stage_started\`, \`stage_verified\`, \`completed\` or \`failed_closed\`. The existing approved local Saban worker execution remains the only source of \`stage_verified\` receipts.
- **Observed animation, not a scripted show:** a desk changes to *running* only upon a \`stage_started\` event and to *verified* only upon a role-matching \`stage_verified\` quality receipt. The floor never shows ongoing workers based solely on a generated mission proposal.
- **Agent inspector:** select a desk via pointer or keyboard to inspect role, current state and receipt digest.
- **Event timeline and replay:** replay the **observed** event sequence, with browser receipt times marked explicitly. Playback can highlight a specialist, but cannot fabricate activity or claim remote model inference.
- **Failure handling:** missing or failed output does not become a successful delivery. The scene can display a held worker and an error status.
- **Privacy:** no customer file is persisted by the loopback browser preview; uploaded file contents are passed to the local process and included only in the immediate request, not saved as a source file. Do not expose this preview port to the internet.
- **Rendering:** first-pass responsive SVG/isometric art with no third-party scene-rendering library. It is a visual monitor of the **local deterministic** worker pipeline, not a 3D free-roaming agent simulation.

Launch the existing local preview with \`node systemia/work-saban/server.mjs\`, then open \`http://127.0.0.1:8789\`. The Work Floor is the top-level experience. Start the synthetic example or upload one explicitly authorized CSV.

### Future 3D/agent-world graduation

Do not animate agents as if they are doing live model reasoning without a supported model/session trace. Next stages are (1) true agent/model session-to-avatar identity mapping, (2) attested distributed NodeSeed events, (3) semantically meaningful avatar locomotion/interaction events backed by work handoff receipts, (4) saved consented session playback with workspace isolation and retention, and (5) a more freely navigable cinematic 3D view once the real telemetry data model can justify it.

## Navigable visual workplace (3D preview)

The local Work Floor now defaults to an actual CSS 3D scene rather than a flat agent-status dashboard. Six work rooms and character-like desks represent Mission Director, Analyst, Communications, Designer, Auditor and Delivery Coordinator. The classic isometric SVG remains available using the **2D floorplan** control, particularly for older or low-power devices.

**Controls:** Drag in an empty part of the floor to orbit. Hold Shift while dragging to pan. Mouse wheel or +/− buttons zoom; Q/E rotate. Focus the 3D viewport and use arrows or WASD to pan. The scene accepts touch dragging on phones, and the camera has safety clamps to avoid flying infinitely out of view. Click any workstation to inspect its role and real receipt state.

**Evidence boundary:** Agent characters and animated handoff packets are visual metaphors. Only observed `stage_started` and `stage_verified` events from the local Saban registered-worker execution may set workers to running or verified. The office does not claim that the AI personally walks around a building, that LLM calls have happened, or that a proposal implies autonomous work. When no real worker event exists, desks remain idle or proposed. Verified event replay remains accessible in the inspector; no arbitrary simulated progress runs in the background.

**Verification:** `node systemia/work-saban/office-3d.proof.mjs` exercises the actual browser office controller in a dependency-free DOM harness, including six spatial workstations, proposal versus execution state, 2D/3D switching and navigation bounds. `node systemia/work-saban/preview.proof.mjs` checks local resource delivery and authorized streamed worker execution. Real-device visual and accessibility acceptance is a **separate** step; CI cannot prove scene aesthetics, FPS on iPhone hardware, or 3D accessibility.

**Scope warning:** This is navigable spatial CSS 3D, not yet a WebGL walking simulator with physics, independent employee navigation, agent conversations, or arbitrary agent mobility. Nothing is publicly hosted, tenant-isolated, or payment-verified merely because the local preview serves these assets.

## Local mission evidence v0.5

The visual office now displays exact per-specialist worker receipts in its inspector: QA disposition, bounded attempt count, observed duration, assignment idempotency key, registered worker receipt schema and SHA-256 result digest. These details come from the real local registered worker scheduler, never decorative status timers.

The NDJSON execution endpoints wrap every ordered event in a per-run SHA-256 chain with a unique trace ID, sequence number and previous-event digest. The browser uses Web Crypto to verify each link **before** forwarding the event to the 2D and 3D office. It also compares all five observed worker receipts to the final delivery, checks role sequence, requires explicit local verified outcome and independently hashes the delivered Markdown before exposing it. If the event sequence or output does not match, the browser fails closed and the deliverable is withheld.

A completed mission unlocks a user-triggered **Download verified mission trace** action. The exported JSON contains all 12 observed events and the full report, so it may include private company figures; handle it as confidential data. The local preview holds it only in the current browser memory and makes no automatic persistent upload. `node systemia/work-saban/trace-chain.proof.mjs` verifies the server/client chain and adversarial cases. `preview.proof.mjs` checks actual localhost worker-stream integrity.

**Security limitation:** This is a local *unsigned* integrity chain, **not** a digitally signed proof of worker identity, independent cryptographic attestation, tamper-proof storage, external audit service, production durable log or permission to access a new source. Anyone controlling the local server could replace the stream and recompute hashes. A future authenticated workspace should bind identity, immutable execution receipts, durable replay and signatures at the Systemia admission boundary before using this as enterprise audit evidence.

### Independently check a downloaded trace

The browser's **Download verified mission trace** control produces `work-saban-verified-local-trace.json`. You can verify its event ordering, role receipts, output integrity and unmodified report without opening the app:

```bash
node systemia/work-saban/audit-trace.mjs /path/to/work-saban-verified-local-trace.json
```

This command checks hashes and financial-report delivery invariants, emits only an audit verdict and digests (not the private report body), and exits nonzero on corruption or incomplete runs. Its positive result still cannot authenticate which person or machine generated the unsigned chain. Do not upload sensitive customer traces to public CI logs or third-party issue attachments.
