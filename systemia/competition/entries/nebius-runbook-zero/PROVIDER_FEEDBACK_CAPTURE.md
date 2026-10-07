# Nebius + NVIDIA Feedback Capture

This file is a capture template, not a claim of live provider use. Complete the observation fields only after a legitimate live Token Factory canary has run.

## Integration context

Product: Runbook Zero

Track: Coding and Agentic Engineering

Nebius surface:
- Token Factory inference API
- OpenAI-compatible chat-completions interface

NVIDIA model:
- `nvidia/nemotron-3-super-120b-a12b`

Use case:
- diagnose a real failing repository verification
- return a machine-readable exact-text repair plan
- participate in a bounded repair loop where the runtime owns edit authority and verification

## What to capture during the first live canary

### Zero to first successful inference

Record:
- account/token setup friction
- whether the documented endpoint and authentication shape worked unchanged
- time from legitimate credential availability to first successful model response
- any model-name or endpoint mismatch
- any billing/credit activation friction

Observation:
PENDING LIVE CANARY

### Response quality

Use the built-in broken invoice fixture and record:
- whether Nemotron identifies the arithmetic defect
- whether the returned response can be parsed into the required JSON repair schema
- whether the proposed search text exists exactly once
- whether the patch is minimal
- whether the same real verification turns green after the patch

Observation:
PENDING LIVE CANARY

### Structured-output reliability

Run at least five bounded fixture calls if available within authorized credits.

Record:
- valid JSON responses
- responses requiring fence/thinking-tag cleanup
- schema-invalid responses
- unsafe or out-of-allowlist proposals
- mean and worst-case rounds needed before green

Observation:
PENDING LIVE CANARY

### Latency and developer experience

Record:
- request latency for the fixture
- whether latency feels appropriate for an interactive repair workflow
- clarity of Token Factory errors
- usefulness of provider/model identifiers in responses
- documentation gaps encountered

Observation:
PENDING LIVE CANARY

### Security and secret handling

Verify:
- Token Factory key is server-side only
- public receipt does not echo the key
- health endpoint reports configuration state without secret material
- failed provider calls consume public-demo budget
- demo remains disabled unless explicitly enabled

Current local/CI evidence:
PASS for runtime secret-boundary and public-demo guardrail tests. Live provider behavior remains pending.

### Would we build with it again?

Answer after live use:
- yes / no / depends
- why
- which workload fits best
- what would make Token Factory materially better for agentic engineering

Observation:
PENDING LIVE CANARY

## Submission-ready feedback rule

Do not replace the pending fields with generic praise. The final Devpost feedback should cite specific observed behavior from the live canary, including at least one thing that worked well and one concrete friction point or improvement request.
