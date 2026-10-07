# Runbook Zero

Runbook Zero is a bounded autonomous repository repair agent powered by **NVIDIA Nemotron on Nebius Token Factory**.

It is built for the Coding and Agentic Engineering track of the 2026 Nebius x NVIDIA Global AI Hackathon.

## The idea

A model that can write code is easy. A repair operator that can change a real repository without quietly acquiring unlimited authority is harder.

Runbook Zero separates reasoning authority from execution authority:

1. An operator supplies a repository, an argv verification command, and an explicit allowlist of editable files.
2. Runbook Zero runs the real verification command and captures the failure.
3. NVIDIA Nemotron 3 Super is called through Nebius Token Factory to diagnose the failure and return a machine-readable exact-text repair plan.
4. The runtime rejects edits outside the file allowlist, non-unique searches, path escapes, oversized patches, and model-proposed shell authority.
5. The patch is applied.
6. The exact verification command runs again.
7. The loop repeats up to a bounded number of rounds.
8. If verification never becomes green, every allowed file is rolled back to its original state.
9. A receipt records the model, rounds, file hashes, test outcome, and rollback state without exposing the Nebius key.

The model reasons. The runtime controls what the model is allowed to touch.

## Nebius + NVIDIA

Default model: `nvidia/nemotron-3-super-120b-a12b`

Default Token Factory endpoint: `https://api.tokenfactory.nebius.com/v1`

```bash
export NEBIUS_TOKEN_FACTORY_KEY="..."
npm test
npm start
```

The hosted demo contains a deliberately broken invoice calculator. Each demo run creates an isolated temporary repository, runs the failing Node test, asks Nemotron for the repair, applies only an allowed exact-text patch, reruns the real test, and shows the receipt.


## Public demo guardrails

The public HTTP demo fails closed by default. A deployment must set both a Nebius credential and `RUNBOOK_ZERO_DEMO_ENABLED=1` before `POST /api/demo` can call Token Factory.

The demo also enforces a process-level inference budget and cooldown:

```bash
export RUNBOOK_ZERO_DEMO_ENABLED=1
export RUNBOOK_ZERO_DEMO_MAX_RUNS=25
export RUNBOOK_ZERO_DEMO_COOLDOWN_MS=4000
```

`RUNBOOK_ZERO_DEMO_MAX_RUNS` is hard-capped at 100 per process. Failed provider calls still consume the run budget. This keeps a public competition demo from becoming an unbounded inference-credit endpoint.

## CLI

```json
{
  "repository_path": "/absolute/path/to/repo",
  "allowed_files": ["src/calculator.mjs"],
  "verify_command": ["node", "--test", "test/calculator.test.mjs"],
  "objective": "Repair the failing calculator test with the smallest safe change.",
  "max_rounds": 3
}
```

Run: `node cli.mjs mission.json`

The verification command is supplied by the operator. Nemotron cannot create or alter commands.

## Safety boundary

- No shell commands from the model.
- No arbitrary file creation.
- No path traversal.
- Only exact-text replacements in the declared allowlist.
- At most eight edits per model round.
- Automatic rollback if the real verification remains red.
- API key server-side only.
- No payment, deployment, merge, or external-action authority.

## Competition packaging

This directory is self-contained and carries its own MIT license so it can be extracted to a dedicated public repository without relicensing the wider Evercraft monorepo.

## Competition judging packet

- `submission.md`: Devpost-ready project narrative and current evidence boundary.
- `DEMO_VIDEO_PLAN.md`: sub-three-minute judge-facing demo shot plan.
- `PROVIDER_FEEDBACK_CAPTURE.md`: structured live-use feedback capture for Nebius Token Factory and NVIDIA Nemotron.

The feedback file intentionally leaves live-provider observations pending until a legitimate Token Factory canary has executed.

