# Raven local llama.cpp canary | owned-node acceptance

**State:** review only, no live node verified, no Systemia mission admission.

This is the small, mainline-based handoff from the older [Duck.ai / Raven prototype PR #1867](https://github.com/jgaethle10/forge-operator/pull/1867). It does not merge that older diverged PR. This branch contains only local metadata and a disabled-by-default, synthetic single-call canary. **No existing production Raven inference gateway or supervisor is modified.**

## Safety and scope

- Supports same-node HTTP loopback only. Never use an IP on the LAN or public internet, and never expose the llama.cpp server to a public interface as part of this test.
- Metadata probe uses one read-only `GET /v1/models` request. It neither generates text nor grants model-routing authority.
- The canary requires `--execute-local`, validates the exact model first, then sends one fixed, synthetic prompt with `max_tokens=96` through `POST /v1/chat/completions`. This consumes local CPU/GPU resources; do not invoke on a busy machine without checking first. It does not touch external accounts, purchases, publication or GitHub.
- No customer or sensitive input is accepted. There are no model tools, cloud adapters, API keys, installer scripts, daemon changes, or auto-retry.
- An `observed` canary result is a **local inference observation** with a hash. It is not a production agent, independently verified external effect, second opinion, or evidence of customer completion.
- Only share redacted results publicly: `/v1/models` can return full GGUF disk paths revealing the user's local filesystem.

## Operator procedure

On Node002 NextGen **inside the environment where the model server is running**, in a checked-out, reviewed copy of branch `engineering/raven-llamacpp-local-canary-20261110`:

```bash
node --version
node --test systemia/raven/benchmarks/owned-local-model-probe.test.mjs systemia/raven/benchmarks/probe-owned-local-model.test.mjs systemia/raven/benchmarks/local-llama-inference.candidate.test.mjs systemia/raven/benchmarks/run-owned-local-inference-canary.test.mjs
node systemia/raven/benchmarks/probe-owned-local-model.mjs --provider llama-cpp --origin http://127.0.0.1:36095
```

If the metadata result shows `status: observed`, copy the *exact* reported model ID into the next command in the private terminal. A port of `36095` is historical, not verified on today's hardware.

```bash
node systemia/raven/benchmarks/run-owned-local-inference-canary.mjs --model 'EXACT_MODEL_ID_FROM_METADATA' --origin http://127.0.0.1:36095 --execute-local
```

The second command runs **one actual local inference** if validation passes. It is not required for metadata discovery, and omission of `--execute-local` intentionally holds.

**Interpretation:** `state: observed` with `real_local_inference_performed: true` indicates a bounded local response was received; `state: held` indicates no completion evidence. `inference_outcome: unknown_after_activation` means a timeout or error may have happened after the prompt was accepted; do not automatically replay it.

## Evidence handling

On an approved owned node, retain the exact checked-out Git commit, node OS/hostname (private), timezone-aware time, command, metadata observation and canary result in a private state directory. Do not upload raw model IDs or host directory paths into a public GitHub issue. The CLI does not write these records automatically.

Next gate after owner-observed local receipts: separately review integration into the existing Raven private runtime and Systemia's admission, budget and evidence gates. Do not wire this candidate into production based solely on synthetic CI.
