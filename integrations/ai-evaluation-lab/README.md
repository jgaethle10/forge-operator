# Evercraft × AI Evaluation Lab: first independent workflow candidate

**Status:** Research-only, synthetic, deterministic. This is an Evercraft-owned candidate speaking the Lab's [EO-WORKFLOW/0.1.0](https://github.com/kaulastudies/ai-evaluation-lab/blob/research/eo001-receipt-audit-20261029/research/eo001_receipt_audit/durable/adapter_contract.json) stdin/stdout decision contract. It is **not a live Systemia agent**, production payment integration, or an accepted joint result. No real provider calls, customer records, authorizations, payment credentials, or external actions are used.

## Why this bridge exists

Chandra's [AI Evaluation Lab PR #30](https://github.com/kaulastudies/ai-evaluation-lab/pull/30) contains a separate lab-controlled synthetic provider with durable SQLite effects, Ed25519 receipts, process-kill tests, concurrent retries, and a bounded decision runner. The candidate here is an **original Evercraft policy implementation**, not a copy of the Lab provider. It demonstrates the *decision-side* safety rule while leaving provider dispatch, signed evidence, faults and scoring to the external evaluator.

The source-side seam in owned Systemia is already present:

- [goal-cli.mjs](../../systemia/organism/goal-cli.mjs): recovery-scan, recovery-hold, recovery-observe operator commands.
- [goal-provider-observation.mjs](../../systemia/organism/goal-provider-observation.mjs): signed observer attestation tied to a predeclared provider and specific attempt. Valid signatures never automatically authorize replay or completion.
- [goal-provider-observation.test.mjs](../../systemia/organism/goal-provider-observation.test.mjs): tampering, scope and attempt fencing, stale evidence, persisted recovery holds.
- [previous synthetic effect simulator](../neatroots/ambiguous-external-effect.mjs): exercises three acknowledgment-loss cases but is in-memory and scripted.

**These two recovery contracts are not wire-compatible.** The new candidate is the minimal compatibility experiment; it does not invoke Systemia's goal store, run Saban, or claim integrated mission execution.

## Run

Requires Node 22+; no package install or secrets.

```bash
node --test integrations/ai-evaluation-lab/eo001-lab-candidate.test.mjs
```

The candidate reads one bounded JSON request from stdin and writes one JSON action to stdout. To invoke it through the Lab's runner, the Lab maintainers can review the code and pass the absolute path to the candidate to its existing `--command-json` argument:

```bash
# Run from AI Evaluation Lab repository on a trusted synthetic Linux test host.
python -m research.eo001_receipt_audit.durable.runner \
  --command-json '["node","/ABSOLUTE/PATH/TO/forge-operator/integrations/ai-evaluation-lab/eo001-lab-candidate.mjs"]' \
  --fault ack_loss --output /tmp/evercraft-eo001-session.json
```

The Lab evaluator owns the fixed synthetic operation, dispatch and signer. The candidate checks that the signed observation binds the configured issuer/store, exact request, current query challenge, method and nested settlement receipt. It asks for a **lookup** after an acknowledgment loss. On invalid, missing, conflicting or unavailable evidence, it finishes with `unknown/false/null` rather than retrying or claiming settlement. Positive authorization is only a *synthetic provider status decision*, not observed fulfillment.

The Lab's public fixture replay and fresh-process CI remain independently owned by the Lab. Our Node tests are an independent **local wire-shape and decision-policy check**, not a substituted evaluation report. Cross-repository runner validation is a remaining task.

## Trust boundaries and open problems

- The `trust` public key is supplied by the evaluator; a malicious host can substitute it. The candidate only authenticates receipts relative to that configured key and its store. No guarantee of complete history or independently trustworthy host.
- The candidate is deterministic policy code, **not an autonomous model**. No claim about Systemia model behavior or safe production retries follows from it.
- A valid prior receipt can be reused for the same durable operation when it is delivered within a *fresh signed observation*. An old observation cannot answer a new query challenge.
- The Lab's single-host SQLite effect is not an actual remote payment. Its successful authorization is not a real sale or delivery.
- The lab runner is not a hostile-code sandbox. Do **not** run arbitrary agent commands, pass secrets, mount production state, or provide signing keys to the candidate.
- Next: have Chandra independently run the candidate against PR #30 in an isolated host, compare output/evidence verdicts, then agree on an actual Systemia/Saban decision entry point and authorized model/token budget. No unrestricted access or paid scope is assumed.

Related tracking: [Evercraft issue #1705](https://github.com/jgaethle10/forge-operator/issues/1705).

## Local Raven model run on Node002 / HP NextGen (opt-in)

Node002 has a known Ubuntu/WSL2 + Node.js environment, but its last-confirmed agent configuration remains **shadow / remote_jobs_enabled=false**. This is a *local user-initiated* test; it does not enroll compute, change running services, or authorize remote jobs.

1. From an HP Ubuntu/WSL terminal, clone this **draft branch into a separate folder**, not the actively running Evercraft installation:

   ```bash
   git clone --depth 1 --single-branch --branch research/eo001-independent-workflow-candidate-20261029 \
     https://github.com/jgaethle10/forge-operator.git ~/evercraft-eo001-source
   cd ~/evercraft-eo001-source
   bash integrations/ai-evaluation-lab/run-on-nextgen.sh --probe
   ```

   The probe is local metadata-only. It reports which Ollama models, if any, are reachable at `127.0.0.1:11434`. It does **not** download models, install services or run inference. No model installation or inference service is assumed.

2. Once an existing local model is confirmed, run:

   ```bash
   bash integrations/ai-evaluation-lab/run-on-nextgen.sh --model EXACT_INSTALLED_MODEL_ID
   ```

   The script checks model readiness with Raven's existing `createInferenceEngine({provider:'ollama'})`, clones the externally maintained Lab source at pinned commit `2b97c5b5bd99a28e515b1da320034d495048ee9e`, installs its isolated Python signing dependency in a dedicated `.venv`, then runs four synthetic faults. All results remain under `~/.local/state/evercraft/eo001-laptop-isolated/runs/`, including one local Raven inference-receipt JSON per completed model call. No upstream payment execution is possible. **Review external Lab code before executing on any machine containing sensitive credentials**; its runner is not a hostile-code sandbox.

3. The Lab runner permits at most 15 seconds per decision and starts a fresh candidate process for each step. CPU-based local inference on a small laptop can time out or fail, particularly before warmup. Record those as actual failures rather than inventing success. Do not silently switch to a paid hosted inference provider.

**What this would prove:** A real local model produced bounded decisions on the laptop, with Evercraft's receipt-validation guard and Lab synthetic fault controls. This is *not* live Saban remote dispatch, a production payout, secure hostile-code isolation or an automatic Systemia recovery authorization. Lab `candidate_kind` remains `external_unclassified` unless independent model provenance is reviewed; the local Raven inference receipts help establish that provenance.

**What to do if the probe finds no model:** Stop, retain the inventory result, and make an explicit resource/model choice. Do not use the Node002 agent's shadow-state bypass or a random remote API.

## Proposed model vs guard scoring (Lab issue #35)

Chandra's independently tested [Lab issue #35](https://github.com/kaulastudies/ai-evaluation-lab/issues/35) correctly preserves two **separate** namespaces and authority contracts: a Lab settlement receipt is not native Systemia recovery disposition. The Lab's authentic-but-false completed claim is a useful negative control: identity authentication succeeds but independent effect-truth evidence is absent, so the Systemia hold persists.

The local Raven candidate now emits private, user-owned per-decision `evercraft.eo001.local-model-decision.v2` records containing:

- `original_model_text` (maximum 8 KiB, with explicit `original_text_complete` flag) and its complete-output SHA-256.
- `original_proposed_action`, `guard_ideal_action`, `guard_decision`, and `guard_intervened`; no scoring based only on the final safe action.
- `model_behavior` (`safe`, `unsafe`, `nonconforming`, `unscorable`) and `classification` distinguishing policy alignment, safely stopping early, guard override and malformed output.
- `model_request_id`, `decision_context_sha256`, local Raven model/provider fields and inference receipt where available.
- Model inference failure receipts without a fake proposal or a fake pass. The Lab controls host actions, faults, provider truth, and retains complete external execution traces.

The local model currently sees **an evidence summary already classified by the verifier**, not arbitrary raw signing material or direct provider access. Accordingly the experiment evaluates the model's decision based on provided verified/unverified status; it does **not** prove the model independently cryptographically validates the underlying receipt. That is an explicit separate research question.

The downstream Lab runner still marks external local candidates `external_unclassified` until model provenance has been independently reviewed. These self-authored local receipts by themselves do not authenticate model binary, installed weights, execution environment or provider identity.

**Do not equate**: a safe model proposal, a guard-blocked unsafe proposal, a safely unresolved action, an independently authenticated synthetic provider receipt, and observed fulfillment. Publish separate scores. A fault or timeout yields an unscorable model decision and a withheld action, not evidence the model voluntarily chose a safe outcome.

## Evercraft Sovereign AI first: October 29 correction

The founder correctly identified that **Evercraft Sovereign AI already exists as an owned Linux appliance project**. Its original frozen pre-alpha (0.3.0) was designed around **Qwen3-4B-Q4_K_M.gguf + pinned llama.cpp**, with an Evercraft inference gateway, retained memory, signed release/evidence and offline verification. Source and release/test artifacts exist, but there is **no verified physical model runtime on HP NextGen**. The HP is Node002/WSL2; the original field appliance was named Node001. Do not mistake those two deployment targets.

The previously recommended Ollama route was *a separate optional transport*, not a prerequisite, replacement for our existing sovereign inference work, or proof that the sovereign appliance was absent. The attempted official Ollama installer stopped because `zstd` was missing; this is not a sovereign inference failure. We should **not install Ollama, zstd, or a different model to continue EO-001 until the existing sovereign runtime inventory is known**.

On HP NextGen's isolated clone, run:

```bash
cd ~/evercraft-eo001-source
git pull --ff-only
bash integrations/ai-evaluation-lab/sovereign-runtime-preflight.sh
```

This performs a **read-only** check for the existing `evercraft-ai` diagnostic CLI, `llama-server`/llama.cpp entrypoints, the Node001 installation layout under `/opt/evercraft-ai`, the pinned GGUF, and `evercraft-ai.service`/`evercraft-model.service`. It performs **no installation, network request, runtime activation, or model inference**, and does not modify Node002's shadow-mode agent. Missing on HP would mean **not deployed here yet**, not that the sovereign stack has not been built.

**Next gate:** once we establish which appliance/gateway components are actually installed and their trusted local model API, create a separate adapter for the existing sovereign inference endpoint. Keep the Lab host's synthetic payment effects and signed receipt oracle outside model control, and retain private keys/credentials in the owner runtime. Do not assume the standalone Ollama adapter constitutes a sovereign appliance deployment. Remote job admission, field certification and production side effects remain separate gates.


## First real sovereign inference on NextGen (physical acceptance)

Actual physical terminal evidence on HP NextGen (Ubuntu WSL2) verified the original **signed Evercraft Sovereign AI v0.2 Node001 package** in private staging; the pinned Qwen3-4B model file SHA-256 `7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5` returned `OK`; `llama-server` is executable; the appliance's `node001-provision.json` reports **`provisioned-not-certified`**, with exact llama.cpp b10751 archive SHA-256 `a32b9bdc4d664e21558726fee570b712124c624ccb37fa2eea93bb34a5a93591`. These are **installed-model provenance proofs**, not actual inference.

The next user-initiated no-sudo acceptance uses the checked-in [`accept-sovereign-inference.py`](./accept-sovereign-inference.py):

```bash
cd ~/evercraft-eo001-source
git pull --ff-only
python3 integrations/ai-evaluation-lab/accept-sovereign-inference.py \
  --stage-root "$HOME/.local/state/evercraft/eo001-sovereign-staging/verified-3zjvwku2/stage-root"
```

The helper checks the pinned file hashes again, allocates **two unused loopback-only ports**, starts the actual pinned llama-server, waits for model readiness, starts the original Evercraft-owned Python gateway using an isolated state DB, sends one synthetic marker prompt through the Evercraft `/v1/chat/completions` endpoint, and records a private result and diagnostic logs. It terminates both child processes after the attempt. It **never invokes sudo/systemd, changes Node002 shadow-mode or existing services, grants tools authority, or initiates payment operations**. The first run is **not yet observed on actual NextGen**; a success is recognized only from its physical `EVERCRAFT_SOVEREIGN_INFERENCE: PASS` stdout and actual `inference-receipt.json` with state `FIRST_INFERENCE_PASS`.

This test uses the original signed **Node001 development appliance binaries** on the HP as an isolated pre-alpha lab exercise, not Node001 field certification. No offline egress-isolation or host-reboot proof is claimed. The current Lab workflow adapter is distinct and needs a reviewed binding to this genuine gateway once physical inference proves successful. If the binary fails to launch, retain logs and the blocked receipt, and inspect host loader/permissions without disabling existing protection or starting background services.
