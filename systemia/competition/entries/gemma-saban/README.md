# Saban for Gemma 4 Developer Agent

This is Evercraft's first competition-native scaffold for Google's **Gemma 4 Developer Agent Competition** on Kaggle.

It is intentionally narrow. It does not claim a leaderboard score, a fine-tuned adapter, or successful private-harness execution yet.

## Current strategy

Saban uses the required `gemma-4-31b-it-qat-w4a16-ct` base model and the official competition tool surface. The first version is prompt-and-tool strategy only:

- graph-first repository navigation when the target is unclear
- semantic search before broad grep
- explicit failure reproduction when affordable
- one repair hypothesis at a time
- smallest production patch
- targeted verification before broad verification
- diff cleanup before `submit_patch`
- no test weakening to manufacture passes
- no internet dependency
- no unverified LoRA adapter claims

## Submission tree

```
agent.yaml
configs/
  sampling.yaml
prompts/
  system.md
```

The competition accepts optional LoRA adapters and subagents, but this scaffold deliberately starts without either. We should earn complexity from benchmark evidence instead of adding it because the format permits it.

## Static validation

```bash
node validate.mjs
```

This checks the exact model ID, include paths, official tool allowlist, prompt doctrine, and absence of an unverified adapter declaration.

## What is still required

The live Kaggle competition harness and public training dataset are behind the competition rules gate. Once that gate is accepted, the next machine steps are:

1. fetch the official sample submission and `HARNESS_README.md`
2. diff this scaffold against the official current schema
3. run the 129 public development tasks
4. capture per-task failure taxonomy, token/time use, graph-tool use, and pass rate
5. tune prompts and agent topology based on measured failures
6. only introduce LoRA training if prompt/tool strategy reaches a clear ceiling
7. package `submission.zip` with `agent.yaml` at root
8. submit only after Raven records the evaluation and artifact receipts

The optional paper track closes November 12, 2026. The main entry gate is November 25, and final submission is December 2.
