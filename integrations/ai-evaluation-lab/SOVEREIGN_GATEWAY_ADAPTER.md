# EO-001 sovereign gateway candidate (draft adapter, not an experiment)

This is a research-only adapter for the **original pinned Evercraft Sovereign AI gateway** (Qwen3-4B / llama.cpp), using its observed `POST /v1/chat/completions` interface. It **does not install Ollama, launch the model or gateway, start/stop processes, modify Node002 shadow mode, touch Systemia mission state, make payments, or authorize model evaluation**. The existing Raven candidate remains unchanged and supplies its bounded prompt, signed-evidence policy guard, and v2 receipt recorder.

## What is implemented

- The only network target is a numeric `127.0.0.1` TCP port, explicitly provided by the local owner. Only `GET /health` and `POST /v1/chat/completions` can be called. No redirect, DNS, remote origin, proxy, or arbitrary URL.
- A private owner-readable regular token file (mode 0600) is required. It must be an ephemeral test token created by a separately reviewed **isolated test gateway runner**, never a production token. The adapter never prints it.
- Gateway health must report `ok=true`, `bind=127.0.0.1`, and `tools_enabled=false` before prompting. Model ID is pinned to `qwen3-4b-q4-k-m`. Baseline proposal: `temperature=0`, `max_tokens=128`, a 12-second local inference HTTP deadline, and a 1.5-second preflight HTTP deadline.
- Invalid, unavailable, malformed, overlong, or truncated outputs fail closed. The caller's existing deterministic guard distinguishes raw model proposals from permitted synthetic actions and produces private mode-0600 v2 decision receipts. Synthetic Lab evidence is not proof of fulfillment or native Systemia authority.
- Tests use an injected fake gateway transport; they **do not** run Qwen. Research branch tests use the existing policy recorder in the import path, without installing a new inference engine.

## Review gates before any physical model run

1. Agree with AI Evaluation Lab on exact source SHAs, prompt/context serialization and hashes, warm-up prompt/timeout, model/runtime SHA-256, generation parameters and token limit, wall-time measurement, six-decision maximum, stop semantics and output naming (Lab PR #51).
2. Review how to launch a temporary **already staged, pinned** llama.cpp and Evercraft gateway in a separate user-owned run directory with loopback-only ports, isolated state and ephemeral token file. The older smoke acceptance script exits and stops both processes; it is **not** a resident model service or an EO-001 runner.
3. Execute a **metadata-only offline test first**:
   ```sh
   node --test integrations/ai-evaluation-lab/eo001-sovereign-gateway-candidate.test.mjs
   ```
4. Do not run the Lab four-case harness or expose the private receipt until the joint run manifest is reviewed and the user expressly opts into that bounded local experiment.

After those gates, the future isolated runner may use:

```sh
# Example ONLY after isolated gateway admission and an approved run manifest.
node integrations/ai-evaluation-lab/eo001-sovereign-gateway-candidate.mjs \
  --port <ISOLATED_LOOPBACK_PORT> \
  --token-file <PRIVATE_EPHEMERAL_GATEWAY_TOKEN_FILE> \
  --probe
```

The `--probe` mode sends **no model prompt**. The normal stdin/stdout decision mode additionally requires `--receipt-dir` and emits only a bounded action to stdout. A failed model decision exits nonzero, writes only a safe unresolved action, and retains an error receipt when the recorder was initialized.

## Limitations

- Hardware/model identity remain `UNVERIFIED_EXTERNAL` absent independent attestation. The gateway's self-reported model ID and timing are not independent proof of installed weights.
- A 12-second HTTP call plus per-decision subprocess startup, health preflight, policy checks and receipt writing may exceed Lab's proposed 15-second total wall-time budget. Do not imply compliance from a timeout setting.
- The 17.81-second October 30 acceptance was one initial smoke request, **not** a warmed decision measurement. Do not claim warm readiness without a measured result.
- The current bounded prompt passes a verified-status summary to Qwen, rather than asking Qwen to inspect raw signed evidence. It tests decisions under a verifier-provided interpretation, not the model's own cryptographic verification.
- The Lab's runner/host and synthetic signer remain trusted, and same-user subprocesses are not an untrusted-code sandbox. No production authority, live Systemia dispatch, payment, fulfillment or revenue is established.

Coordination: [Lab #35](https://github.com/kaulastudies/ai-evaluation-lab/issues/35), [Lab PR #51](https://github.com/kaulastudies/ai-evaluation-lab/pull/51), [Evercraft PR #1744](https://github.com/jgaethle10/forge-operator/pull/1744).
