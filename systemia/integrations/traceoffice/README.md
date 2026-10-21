# TraceOffice interoperability proof (read-only)

This adapter is a **proposed, unmerged Evercraft integration** for the TraceOffice v1 snapshot importer. It is not deployed, does not communicate with Discord or TraceOffice, and does not grant execution authority. The receiving UI and any live room remain owned by the TraceOffice developer.

## Why this exists

Systemia is the mission control plane, Saban plans and tracks jobs, NodeSeed/Compute furnish authorized workload capacity, and TraceOffice supplies the human spatial interface. A *job* is not an LLM session or necessarily a running model. This first adapter deliberately renders each Saban job as a clearly identified **job seat**, not a fictional agent or physical worker. Live session identity, approval controls, tool telemetry and deeper trace links need separate reviewed contracts.

## Start with the zero-secret demo

```sh
node systemia/integrations/traceoffice/bridge.mjs --demo --output /tmp/traceoffice-synthetic.json
```

Import the generated JSON file via TraceOffice's existing **Import agents** snapshot option. Records are labeled `SYNTHETIC` and must not be represented as real operational activity. The sample contains three simulated seats and two simulated interactions.

## Export an authorized local Saban state

```sh
# Use a *trusted*, explicitly authorized local Saban work-state file.
# Set a private, persistent 32+-byte pseudonymization key by your usual secret manager.
# Don't paste it into chat, commit it, or put it directly in a shell command.
# Load TRACEOFFICE_EXPORT_KEY through a secure local environment/secret manager.
node systemia/integrations/traceoffice/bridge.mjs \
  --input /path/to/authorized/work-state.json \
  --output /tmp/traceoffice-private-preview.json
```

The v1 export is **local-only** and outputs `version:1`, `agents[]`, `interactions:[]`. It does **not** upload, create public rooms, send network requests, or read model transcripts. Work identifiers are HMAC-pseudonymized; the key must stay private and stable if the user wants stable identities. Outputs omit job payloads, work details, customer information, titles, prompts, environment values, paths, raw IDs, underlying agent IDs, addresses, worker IDs, error strings, model choices and source URLs. Never publish a private export to Discord or a live room without a separate privacy review and explicit sharing authorization.

`--output` creates a new file mode 0600 and refuses to overwrite. A real export is capped at 50 Saban jobs and 2MB in TraceOffice v1 format. If more than 50 jobs exist, the adapter **fails** rather than silently hiding the extra work. Use an explicitly scoped source snapshot before exporting.

## Status truth table

| Saban recorded job state | TraceOffice visual status | Important caveat |
| --- | --- | --- |
| queued, fresh | idle | Queued is **not** executing |
| leased, recent heartbeat, unexpired | working | A lease is not independent proof of actual model/process execution |
| queued/leased with stale or invalid freshness | unknown | Never display stale data as actively working |
| completed | idle | Historical completion, not a live person/model |
| dead_letter | error | Recorded terminal failure, not automatically a current outage |

No agent-to-agent relationships are inferred from job allocation. A separate evidence-backed adapter will be needed to show real interactions or human approvals. `Passport` and the Systemia execution gates retain full authority regardless of anything displayed in TraceOffice.

## Proof and limits

```sh
node --test systemia/integrations/traceoffice/bridge.test.mjs
```

Tests cover stable pseudonyms, no raw secrets in output, freshness and lease transitions, missing/invalid source contracts, unknown statuses, and the strict 50-seat limit. This is an **adapter proof**, not a production deployment or an independent end-to-end TraceOffice UI canary. Live bridge and remote operations remain **not ready** until the receiving developer confirms the contract, the public route works from outside Evercraft's network, and the authorization/privacy checks and operational canaries pass.

Sources reviewed: [TraceOffice snapshot validator](https://github.com/PatrickKish1/traceOffice/blob/main/src/snapshot.ts), [TraceOffice types](https://github.com/PatrickKish1/traceOffice/blob/main/src/types.ts), and Evercraft `systemia/saban/work-state.mjs`.