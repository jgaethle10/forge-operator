# Saban bounded worker diagnostic timeline

Date: 2026-11-22  
Status: draft source change and synthetic tests; no machine deployment.

## Problem addressed

An independent developer's debugging experience highlights a general agent-system failure mode: a watchdog can reject malformed model output and retry while hiding the conversational output, making the exact sequence difficult to diagnose. This **does not** establish a defect in Saban. Saban already implements bounded worker leases, retries, checkpoints, and execution timing, but previously persisted just the latest job status and error rather than a minimal sequence of events.

## Independent Evercraft implementation

A bounded per-job event timeline now accompanies Saban's existing work state:

- queued
- leased
- checkpointed
- retry_queued
- lease_expired_queued / lease_expired_dead_letter
- failed_dead_letter
- completed

Each event includes only a sequence number, timestamp, canonical state, number of attempts, and a tightly restricted failure category. The record keeps the most recent 16 events and counts older events without retaining their details. Heartbeats are not individually logged so frequent heartbeats cannot drown out meaningful transitions. It is a *diagnostic view*, never authority to run an operation.

A pure projection function returns at most 100 jobs by default and reports how many were omitted. It deliberately excludes worker output, prompt text, analysis, execution command text, task payloads, raw error messages, checkpoint data, and user secrets. It does not open network connections, access model providers, initiate retries, or write files. The ordinary Saban state persistence flow continues to own saving; the trace is supplementary. Existing work-state snapshots lacking trace fields remain loadable.

### Explicit limitations

- This records Saban job state transitions, not the private chain-of-thought or conversational trace of a model.
- The event sequence can show that a retry happened, but it does not prove the *underlying reason* unless a separately verified and safely categorized result is available.
- Redaction of these event fields does **not** make the rest of the legacy work-state JSON safe to publish. Only the projection should be considered for a future operator display, with authorization and further review.
- The feature does not alter retry limits, admission authority, model selection, output parsing, or agent execution. A future bounded model-format recovery policy needs independent tests.
- We have not installed, run, or tested this on Penguin or NextGen.

## Verify

```bash
node --check systemia/saban/work-trace.mjs
node --check systemia/saban/work-state.mjs
node --test systemia/saban/work-trace.test.mjs
node systemia/saban/kernel-proof.mjs
```

Regression checks cover recoverable failures, final dead-letter, expired leases, checkpointed state, successful completion, sanitized reason categories, event-history bounds, older state snapshots, and a strict projection size limit.

## Follow-on gated steps

Once code review and CI pass, integrate a *read-only* event timeline in Work Saban. After that, measure retry counts and blocked-job time to decide whether malformed model outputs warrant a different repair strategy. Do not optimize by allowing unvalidated commands or hiding failure details.

No third-party agent source code or archive content is included in this feature.
