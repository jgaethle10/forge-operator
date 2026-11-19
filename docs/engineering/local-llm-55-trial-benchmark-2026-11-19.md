# Evercraft / Systemia University: 11-model, 55-trial local agent benchmark

Date: 2026-11-19
Evidence state: source implementation and synthetic tests; **NO live model comparisons completed**.

## Why

An independent builder reports that Qwen3-Coder 30B is more reliable in his autonomous agent than GPT-OSS and DeepSeek-R1, which tend to return prose when the surrounding execution system expects a structured JSON object. This is one person's observation, not established cross-model evidence.

This experiment focuses on *agent-contract reliability*. It is not an intelligence leaderboard, model-security certification, or benchmark of other people's machines.

## Candidate list (reference, not an Evercraft inventory)

From the builder's supplied screenshot:

1. deepseek-coder-v2:16b
2. glm-4.7-flash:latest
3. qwen2.5-coder:32b
4. devstral-small-2:24b
5. qwen3.5:9b
6. mistral-small3.2:24b
7. qwen3-vl:8b
8. gpt-oss:20b
9. deepseek-r1:latest
10. qwen3-coder:30b
11. llama3:latest

The runner reads the **actual exact local model names and digests** from Ollama's loopback /api/tags endpoint. Missing models receive not_installed receipts and are never downloaded or silently substituted. A screenshot cannot establish which model exists on Penguin or NextGen.

## Five comparable exercises per model (11 × 5 = 55)

- **arithmetic_json**: exact arithmetic and typed fields
- **structured_extraction**: extract fields from a bounded operational record
- **dependency_order**: maintain the ordering of dependent tasks
- **authorization_hold**: enforce a missing-approval hold without taking an action
- **untrusted_log**: ignore an untrusted log entry that demands an unsafe response format

Each task requires one standalone JSON object with exactly the expected fields and values. There are no live tools, filesystem operations, network browsing, deployment actions, payment actions, or arbitrary shell commands in the prompts.

Five different cases test breadth, not five statistical replications of any single case. The sample is too small for broad claims of model superiority.

## How to use on an explicitly owned, prepared local machine

Preview only (default; no inference or model download):

    node scripts/benchmark-owned-local-llms.mjs

Run on models that are **already installed**, sequentially:

    node scripts/benchmark-owned-local-llms.mjs --run

Run a smaller canary first to protect low-memory machines:

    node scripts/benchmark-owned-local-llms.mjs --run --models=qwen3-coder:30b

Optional separate prompt-only baseline:

    node scripts/benchmark-owned-local-llms.mjs --run --mode=prompt --models=qwen3-coder:30b

**Do not run 11 models on a memory-limited production node without checking disk/RAM/thermal capacity and its job schedule.** The runner never installs or fetches a model. It cannot benchmark a model on someone else's machine without permission and a local execution environment.

It only connects to an owned Ollama loopback server, uses one request at a time, sets temperature=0, seed=42, num_predict=256, num_ctx=2048, and keep_alive=0 to unload after each trial. This makes cold-load overhead visible, which should be considered separately from generation latency. Different quantizations and host hardware cannot be compared as though equivalent.

Each run saves a private JSON receipt under ~/.local/state/evercraft/local-llm-bench/ with restrictive permissions. It contains hashes, exact digest, pass/fail status, parser failures, elapsed and model-reported times, and token counts where available. It **does not save raw model outputs or secrets**. A model that generates syntactically valid JSON with wrong values does not pass. No silent repair or retry.

**Authority:** Output text is untrusted. Even a pass never authorizes execution, model downloads, files, messages or payments. A policy gate and exact output schema are still required for Saban.

## After a run

Compare pass rate (out of five), JSON syntax success, failure reason, load duration, output token count, and elapsed time. Compare a second baseline (mode=prompt) only under separately documented matching conditions. Pin suite hash and each installed model's digest for reproducibility.

If the inventory fails or no candidates are installed, the runner produces a **blocked** receipt rather than fabricated benchmark scores.

## Code/test

    node --check scripts/benchmark-owned-local-llms.mjs
    node --test tests/benchmark-owned-local-llms.test.mjs

This suite runs with synthetic Ollama responses in GitHub Actions. Synthetic pass/fail results do not establish any actual model's competence.

Ollama references:
- https://docs.ollama.com/api/generate
- https://docs.ollama.com/api/tags

## Engineering boundary

The Nexus provider-discovery probe suite is a different benchmark. This implementation does not replace that lane, the Raven inference-gateway contract, Saban authorization, or physical Node002 acceptance. Systemia remains orchestration authority and GitHub the canonical source. No Base44, other third-party runtime, cloud inference charges, or production changes are involved.
