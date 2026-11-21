# Raven local-model response-format reliability

Date: 2026-11-16  
Status: proposed / synthetic-only; no live model comparison, rollout, or spend.

## Why

Agent orchestration fails when downstream tools expect machine-readable objects but a local model returns explanatory prose, Markdown fences, malformed JSON, arrays, or truncated responses. Anecdotes about one coding model performing better are **hypotheses**, not benchmark results.

This slice extends the **existing owned Raven inference gateway**. It does not install a model, contact a remote machine, or add an autonomous execution tool.

## Opt-in local JSON contract

The authenticated `POST /v1/infer` body already requires:

- `schema: "evercraft.raven.inference.request.v1"`
- `request_id`, `role`, `input`
- `constraints.internal_analysis_only: true`
- `constraints.no_external_actions: true`
- `constraints.no_credential_return: true`

Callers can now include **`response_format: "json"`** when the configured provider is `ollama`. The adapter sends `format: "json"` to Ollama's local `/api/generate`, then accepts only one syntactically valid JSON **object**. For example:

```json
{
  "schema": "evercraft.raven.inference.request.v1",
  "request_id": "local-json-canary-1",
  "role": "qa",
  "input": "Return a JSON object with a boolean success field. No prose.",
  "response_format": "json",
  "constraints": {
    "internal_analysis_only": true,
    "no_external_actions": true,
    "no_credential_return": true
  }
}
```

- Default `text` mode is unchanged and adds no Ollama `format` field.
- Unexpected formats are rejected **before** any model call.
- Hosted providers remain in text mode until separate documented contracts are added.
- Structured output is byte-faithfully checked (not silently cleaned, fixed, or retried).
- Markdown fences, explanatory prose, arrays, scalars, invalid JSON, and oversized JSON are rejected.
- Successful inference reports `output_format` and `structured_output_validated` with hashed prompt/output receipts; failed format validation gives a blocked result, not a completed receipt.
- This proves **syntax and top-level shape only**. Callers MUST validate the exact domain schema and check authority before using a result. JSON is not permission to execute instructions.

Official Ollama API reference: https://docs.ollama.com/api/generate (the `format` parameter supports `"json"` or a JSON schema object).

## Test and acceptance gates

Synthetic-only tests:

```bash
node --check systemia/raven/inference-gateway.mjs
node --test systemia/raven/inference-gateway.test.mjs systemia/raven/inference-json-contract.test.mjs
```

Regression cases include unchanged text default; valid JSON; invalid fences/prose/arrays/scalars; raw invalid control characters; oversized JSON; unsupported format before network; hosted provider denial; authenticated gateway pass and blocked response; no external side-effect authority.

**Live model compatibility canary (not yet executed):** Use a fixed, explicitly authorized set of models already installed on an owned machine. For each, run the same 10-20 small JSON object requests with identical temperature, prompt, context, and resource settings; record exact model digest, raw reply hash, HTTP status, parser status, latency, timeouts, and hardware load. Compute completion / JSON compliance percentages and p50/p95 latency. Do not infer 30B superiority from one builder's logs. Avoid silent retries and ensure owner-approved capacity thresholds.

## Out of scope

No deployment to Penguin or NextGen; no remote LLM installs; no agent replication; no changes to inference credentials or provider selection; no prompt injection into model instructions; no shell access; no security boundary downgrade; no commercial readiness or revenue claim.

This is one reproducible compatibility mechanism, not a solution to every model issue. Model crashes may also be caused by memory pressure, prompt-template incompatibility, response limits, or runtime bugs, which require separate evidence.
