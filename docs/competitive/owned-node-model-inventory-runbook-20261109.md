# Raven owned-node local model inventory: zero-inference acceptance

**Prepared:** 2026-11-09  
**Status:** candidate / read-only / not run against Penguin or NextGen in this PR.  
**Review:** [Draft PR #1867](https://github.com/jgaethle10/forge-operator/pull/1867) • [Systemia tracking issue #1860](https://github.com/jgaethle10/forge-operator/issues/1860)

## Why this exists
NextGen has previously reported a running local Qwen GGUF through `llama-server`, while Raven v1's documented inference gateway supports Ollama, Gemini and OpenAI. **An Ollama-only inventory request would not prove anything about the existing llama-server process.** A metadata-only probe for both interfaces avoids installing a new model or selecting cloud inference prematurely.

Official endpoint references: [llama.cpp server /v1/models](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md) and [Ollama tags](https://docs.ollama.com/api/tags). These describe the endpoints, not live health of user hardware.

## Operator commands: no bootstrap/install/restart
Use a **trusted checked-out version** of the review branch on the **same machine running the model**. Do not execute the probe from GitHub Actions or a remote cloud instance as evidence for a local node. Run only after inspecting the code and permissions.

**Node002 / NextGen (historically reported local llama-server on loopback 36095):**
```bash
node systemia/raven/benchmarks/probe-owned-local-model.mjs --provider llama-cpp --origin http://127.0.0.1:36095
```
Optional exact model identity after its ID has been observed:
```bash
node systemia/raven/benchmarks/probe-owned-local-model.mjs --provider llama-cpp --origin http://127.0.0.1:36095 --model Qwen3-4B-Q4_K_M.gguf
```
The model ID is an *example derived from prior GGUF file naming*, not proof it is the currently served model; use the exact ID the endpoint reports.

**An owned node with Ollama installed:**
```bash
node systemia/raven/benchmarks/probe-owned-local-model.mjs --provider ollama --origin http://127.0.0.1:11434
```

The CLI reads metadata only using one HTTP GET from loopback. It rejects external IPs, HTTPS hosts, origin credentials, redirect-following, paths, queries, fragments and unsupported provider IDs. No POST, inference prompt, credentials, service configuration, deployment or automatically persisted artifacts.

## Receipt interpretation
- `status=observed` means a local model list was returned (and exact `--model` found, when specified).
- `status=held` means the requested metadata condition was not verified. Keep every hold; do not convert it to zero available models.
- `metadata_receipt` is a SHA-256 fingerprint of this local observation, **not** a signed hardware attestation or independent provider execution receipt.
- `route_eligible=false` is intentional. Model inventory does **not** establish token cost, operator-approved model budget, latency under workload, effective compute availability, or that a Raven inference adapter supports the runtime.
- `inference_performed=false`, `external_effect_authorized=false`, and `cost_estimate_usd=null` prevent false claims.
- `llama-cpp` is **currently a metadata probe only**. It is not a supported production Raven model adapter. Do not point Raven's hosted or Ollama adapter at the llama-server URL and claim routing works.

## Local acceptance record
A live owned-node observation must retain: node identity; date/time with timezone; pinned repository SHA; exact command; CLI output; node-side local service `/health` result if independently inspected; any redactions; and the presence/absence of the model file and server process. Save only to an owner-controlled private state directory with permission 0600, not public GitHub or public discovery.

Do not publish hostnames, private paths, tokens, private prompts, or customer data in the GitHub issue.

## Next gates
1. Review the probe code and [offline CI](https://github.com/jgaethle10/forge-operator/actions). Observe **actual** NextGen and/or Penguin local metadata; do not fabricate this receipt in CI.
2. Add a reviewed local `llama-server` inference adapter to Raven *only after* the model and server contract have been verified on the owned node. Its GET validation must be separate from any POST inference.
3. Measure real single-model inference with a bounded non-sensitive test, record identity/time/cost/receipts. No unapproved cloud API use.
4. Only then attempt two separate local model invocation receipts under the owner-approved Systemia team-review gate. Two synthetic outputs or two role prompts on one model are not independent model opinions.
5. Production still needs admission, identity, rate limits, budget, privacy controls and separate external-effect authorization.

This runbook is a preparation artifact, not a live runtime claim.

## Second gate: explicit, synthetic local inference (review branch only)

After the metadata command has returned the *actual* model ID and the operator has reviewed the branch and chosen to spend local compute, there is a separate **non-production, opt-in** canary. It does **not** install or restart any service or enable hosted providers:

```bash
node systemia/raven/benchmarks/run-owned-local-inference-canary.mjs --model THE_EXACT_ID_FROM_LOCAL_PROBE --origin http://127.0.0.1:36095 --execute-local
```

Without `--execute-local` the command holds without opening the adapter or submitting a prompt. With the flag, it performs `GET /v1/models` and (only if the ID is present) **one** `POST /v1/chat/completions` with a fixed non-sensitive synthetic request, `max_tokens=96` and `stream=false`. It never accepts a user-supplied prompt, hosted provider, API key, remote URL, or tool invocation. It is a direct same-node probe, **not** Systemia admission.

**Result truth:** `state=observed` means one local response was received and internally hashed; `state=held` with `inference_outcome=not_started` means validation failed before inference; `unknown_after_activation` means the request may have reached the engine but completion cannot be proven. Do not auto-retry an unknown outcome. A receipt is local integrity evidence, not independent verification of correctness, external work or an actual multi-model team.

Production implementation and independent second-opinion operation remain **not authorized / not deployed**. The reviewed Ollama provider in Raven is a separate existing adapter; this llama.cpp path stays disconnected from the production gateway.

### Model-ID privacy note

Recent llama.cpp documentation allows the `id` in `GET /v1/models` to be an **absolute or relative GGUF file path** unless the operator configures an alias. The local probe and candidate adapter therefore match the exact reported ID, including safe Unix path characters. The ID is only passed as a JSON model identifier to loopback; no file is opened by this candidate. Treat the full CLI observation as **private** because a model path can reveal a user or directory name. Do not paste the unredacted receipt into public GitHub issues or customer support. Prefer an operator-chosen non-sensitive llama.cpp model alias at a separately approved runtime configuration step.
