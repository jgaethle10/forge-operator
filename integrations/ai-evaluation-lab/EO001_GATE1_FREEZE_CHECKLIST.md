# EO-001 Gate 1 joint freeze checklist (after independent Gate 0 review)

**Prepared:** 2026-11-10 PDT / 2026-11-11 UTC
**State:** PROTOCOL INCOMPLETE, DO NOT RUN FOUR QWEN SCENARIOS.
**Counterparty:** [AI Evaluation Lab issue #35](https://github.com/kaulastudies/ai-evaluation-lab/issues/35) and [draft PR #51](https://github.com/kaulastudies/ai-evaluation-lab/pull/51).

## Gate 0 verified, but only to its stated scope

Lab owner Chandra confirms its *independent inspection of the privately delivered three-file sanitized handoff*, finding **30/30 documentary checks passed** on ZIP structure/CRC, member SHA-256 against manifest, exact ten-field receipt schema, fixed model/runtime pins, reviewer status consistency and basic privacy screening. The Lab's finding is `GATE0_SANITIZED_DOCUMENTS_CONSISTENT`.

Those supplied document bytes remain **self-reported** as to the underlying host: `FIRST_INFERENCE_PASS`, `INFERENCE_REPORTED`, `UNVERIFIED_EXTERNAL`, `NOT_SUPPLIED`. The Lab did **not** independently run Qwen, inspect the original full private receipt or repeat the full offline reviewer against that original source. No scenario evaluation or production authorization is established. Existing ZIP stays private and must not be re-sent simply because this checklist changed.

## Baseline already agreed in principle

- Scenario order: `none`, `ack_loss`, `lookup_outage`, `tamper`.
- Max **six decisions per case** (up to 24 total).
- **15 seconds of warmed, complete per-decision wall time**, measured around the candidate request, serialization, gateway, inference and guard. A gateway-only timer is **not** a measurement of this wall-time budget.
- Separate cold startup and one warm-up; report warm-up latency and failures without scoring them as scenario decisions.
- On first timeout or overrun, record it, preserve complete/partial negative evidence, and stop. No automatic extended deadline or pass-only replacement rerun.
- Synthetic provider effects only, no real checkout, payment, fulfillment, Systemia hold release or remotely admitted Node002 worker.

**Freeze not authorized:** an agreement in principle does not satisfy the versioned run-manifest and independent authority gates.

## Technical discrepancies to resolve before any model execution

| Contract field | Current available evidence | Remaining action / refusal rule |
| --- | --- | --- |
| `lab_adapter_commit` | Retained original pinned Lab offline reviewer at `678829883f6c65e0b4d8dd8fd9dabe346631c7cd`; Lab PR #51 contract was separately checked at `56ca60339dac65d3b79f228992eba09ba92e1188` | Lab must specify exact frozen source commits for *reviewer*, *scenario harness*, *protocol checker*, and oracle. Do not treat PR #51's moving head as the original reviewer. |
| `forge_adapter_commit` | Transport introduced in `8e7cd405e82ea9b031cd358e6e65f0d350399802`, draft Forge PR #1933 reviewed head currently `ee433f7c324cc23bfb432fbe1e4425b533f68c54` | Jointly choose a final immutable Forge source revision including harness; verify file hashes, not just a PR URL or green CI. |
| `model_sha256`, `runtime_sha256` | Original reported Qwen GGUF SHA-256 `7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5`; llama.cpp archive SHA-256 `a32b9bdc4d664e21558726fee570b712124c624ccb37fa2eea93bb34a5a93591` | Local host must re-check artifact hashes at admission; a published hash alone does not attest what was loaded by the process. |
| `prompt_sha256` | `buildModelPrompt(context)` constructs a **per-decision prompt**, including a JSON snapshot of observations, operation ID and evidence status | Freeze exact UTF-8 prompt construction and record **a hash per actual decision**. A single plan-level `prompt_sha256` requires a separately defined *template/protocol digest*, not an assumed fixed runtime-prompt digest. The two meanings must not be conflated. |
| `context_serialization_sha256` | Existing candidate uses `JSON.stringify(context)` for a v2 decision receipt and `JSON.stringify(snapshot)` within the prompt | Freeze canonical context serialization, field order and decision-context hash meaning. Signed, mutable or secret-bearing context must not be published. |
| `warmup_prompt_sha256`, `warmup_timeout_seconds` | Not yet selected. Oct 30 17.81-second first inference was a cold-ish smoke measurement, not a warmed decision | Agree exact safe warm-up bytes, bound, latency measurement method, output handling and whether a warm-up timeout stops the experiment. |
| `generation_parameters`, `max_output_tokens` | Draft sovereign adapter specifies Qwen alias `qwen3-4b-q4-k-m`, `temperature=0`, `max_tokens=128`, `stream=false` | Validate exact gateway/llama.cpp implementation and any default settings (sampling, reasoning, stop sequences). No silent inference retuning for successful outputs. |
| `decision_timeout_seconds` | Lab says 15s complete warmed wall cap; Forge adapter currently sets **12,000ms gateway HTTP deadline**, and additionally performs a **1,500ms /health preflight on each decision** | Instrument *whole candidate decision* using a monotonic clock, including serialization/preflight/guard/recording, **not just HTTP time**. Retain component and total timing and stop on 15s whole-decision breach. Do not claim 12s HTTP proves 15s end-to-end. |
| `host_configuration` | Prior first-run NextGen Ubuntu WSL2 + pinned llama.cpp/Qwen reported locally | Freeze safe nonsecret description of host/runtime isolation, memory/time limits, source locking and tool/network isolation; validate on the owner device before running. |
| `output_naming`, `cleanup_checks` | Draft adapter writes private mode-0600 random decision JSON per call, but no complete dedicated Gate 1 archive contract exists | Freeze six-decision max, unique stable scenario/decision IDs, output hashes, interrupted-run preservation, signer/oracle separation, clean private output tree, process shutdown and secret-screening. |
| `review_references.lab` / `.evercraft` | Lab #35, Lab PR #51, Forge #1705, Forge PR #1933 | Reference **specific jointly reviewed immutable manifest hash/source versions** once approved. A plain link to an open PR is not execution consent. |

## Explicit QA stop condition

Lab's `check_run_manifest.py` returns `NEEDS_REVIEW` when any required field is missing. Even `FIELDS_COMPLETE_REVIEW_REQUIRED` **does not authorize** execution or authenticate source pins and signatures. Evercraft must not interpret either as `ready_to_run`.

Run zero live Qwen scenario decisions until both teams review the contract, the run-manifest and source hashes, and the owner approves the bounded isolated local test. Do not upload private originals/receipt bodies to public issues.

## Team handoff

- **Systemia:** mission status, dependency gates and durable receipts; never re-issue Chandra's already delivered Gate 0 ZIP.
- **Forge:** frozen adapter, static source review, prompt/context hashing, source/host admission checks and fail-closed test coverage.
- **Raven Risk & Evidence / Challenger:** independent checks **only when actual commissioned reviewers are provably available**, otherwise deterministic QA + Lab collaboration. Do not invent a live roster.
- **Lab:** independent reference oracle, scenario and scoring review.
- **Founder:** approval of consequential isolated model execution after independent findings. **No manual JSON inspection or uncontrolled terminal-repair loop.**

Source-level readiness is not a physical worker receipt. The existing separately authorized NextGen resident internal QA service does not grant Qwen experiment admission.
