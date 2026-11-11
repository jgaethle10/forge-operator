# EO-001 Gate 1: Offline fingerprinting and complete-decision timing implementation

**Status:** Draft research-only, no scenario execution, no Gateway/llama.cpp startup, no production authority.

**Lab collaboration:** [Issue #35](https://github.com/kaulastudies/ai-evaluation-lab/issues/35) and [draft PR #51](https://github.com/kaulastudies/ai-evaluation-lab/pull/51). Chandra's independent Gate 0 inspection of a privately received sanitized archive passed 30/30 documentary checks. This is **not** independent attestation of original HP hardware or Qwen execution.

## What this branch adds

`eo001-gate1-offline-contract.mjs` reads tracked Forge implementation bytes and computes SHA-256 for the exact owned source files. It exercises `buildModelPrompt(context)` using **synthetic** fixture context and reports three deliberately distinct hashes:

- `existing_recorder_context_sha256`: hash of `JSON.stringify(context)`, the current v2 receipt recorder's serialization.
- `candidate_canonical_context_sha256`: proposed recursively key-sorted JSON serialization. **Not equivalent** to the existing recorder and **not** approved for adoption.
- `actual_fixture_prompt_sha256`: SHA-256 of a particular *fixture-specific* prompt produced by the real existing prompt-builder. Not a template hash and **not** a final per-decision prompt hash.

This prevents mislabeling a sample hash as a frozen protocol, while giving both parties exact test vectors for agreeing on serialization rules.

`reviewManifest()` mirrors the Lab's `EO001-RUN-PLAN/0.1.0` required-field rules and enforces the 15-second complete warmed decision, six decisions/case, one warm-up, fixed case order and failure retention. If all values are present, the maximum status is `FIELDS_COMPLETE_REVIEW_REQUIRED`, never `execution_authorized=true`. It does not authenticate source signatures or review authors. It must not be used as a live Gate 1 runner.

`measureGuardedResearchDecision()` wraps **the actual `liveModelDecision` guard and its receipt callback** in a monotonic wall-clock budget. Timer begins before prompt construction, runs across inference and guard, and ends after the private receipt callback. A full-decision overrun, abort or inference error is preserved as a negative measured outcome and returns the pre-existing safe unknown action, never an unsupported positive claim. It does not relay that action to any provider or Lab harness.

`eo001-sovereign-gateway-candidate.mjs` now accepts an AbortSignal and passes it through *both* its health preflight and chat-completion requests. An aborted health check cannot proceed to inference. An HTTP abort destroys its loopback socket. The request remains pinned to `127.0.0.1` and the two allowlisted routes, with owner-only ephemeral token input. No Ollama or third-party host is added.

## What this still does NOT prove

- A Node event-loop timer can be delayed by synchronous compute, disk writes or an uncooperative inference implementation. The measured result records the full overrun once control returns, but a **hard 15-second process-level stop** still requires a reviewed isolated supervisor that can kill its child process and preserve partial receipts safely. Do not describe `AbortSignal` alone as guaranteed hard containment of all model work.
- Gateway `12,000ms` HTTP component timeout and `1,500ms` preflight are not guarantees that the **entire warmed decision**, including the policy guard and write, stays below 15 seconds.
- A single 17.81-second original first-inference receipt is not a warmed performance measurement.
- Source SHA digests by themselves do not prove which executable weights/runtime the physical HP loaded.
- The Lab must still review pinned source commits (original reviewer and current contract are different), runtime/model IDs and SHA-256, exact context/prompt byte rules, warm-up prompt/hash and timeout, generation settings, resource constraints, output naming, cleanup and privacy release requirements.
- No new physical case run, payment, real fulfillment, systemd service modification, Raven commissioned-agent action, or independent source inspection has been conducted by this branch.

## Verification

```sh
node --test integrations/ai-evaluation-lab/eo001-gate1-offline-contract.test.mjs
node --test integrations/ai-evaluation-lab/eo001-gateway-abort.test.mjs
node --test integrations/ai-evaluation-lab/eo001-guarded-whole-decision.test.mjs
node --test integrations/ai-evaluation-lab/eo001-sovereign-gateway-candidate.test.mjs
node integrations/ai-evaluation-lab/eo001-gate1-offline-contract.mjs
```

All tests above use fake synthetic contexts, deterministic execution callbacks, or a locally created loopback HTTP test endpoint. **None sends a Qwen prompt, starts a resident model or exercises the four cases.** The offline command prints only hashed code and synthetic fixture metadata. It reports `NEEDS_REVIEW` for the intentionally incomplete Evercraft proposal.

**Next gate:** obtain a jointly accepted specification for exact prompt/context serialization and Lab/Forge source revisions. Only after that may we prepare a separately approved isolated physical supervisor and bounded four-case execution. Do not quietly rerun failures or extend the baseline timeout.
