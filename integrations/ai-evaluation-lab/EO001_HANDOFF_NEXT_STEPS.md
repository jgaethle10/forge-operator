# EO-001: NextGen Gate 0 handoff and Gate 1 admission (research, November 2026)

**State:** private handoff tooling built and tested with synthetic fixtures; **not** evidence that Chandra has inspected the private artifacts, nor approval of the four-scenario model experiment. No payment, Systemia dispatch, production promotion, or remote agent admission is permitted by this work.

## What we already know (reported by NextGen terminal)

The founder executed the ten-field receipt exporter on physical HP NextGen, followed by the pinned Lab offline reviewer at commit `678829883f6c65e0b4d8dd8fd9dabe346631c7cd`.

The local reviewer reported:

- `hardware.state=INFERENCE_REPORTED`
- `hardware.provenance=UNVERIFIED_EXTERNAL`
- `evidence_coverage=NOT_SUPPLIED`
- `hardware.eo001_decisions_established=false`
- `problems=[]`
- `promotion_allowed=false`

Those values establish **consistency of self-reported readiness fields**, not independently attested physical model provenance and not four actual Qwen decisions. Do not fill missing fields or publish source host paths, logs or raw replies.

## Private handoff gate

The new `eo001-gate0-private-handoff.py` standard-library-only CLI reads only:

1. The original *ten-field sanitized export* produced by `export-sovereign-receipt.py`. It **does not** read the original raw host receipt.
2. The local JSON report produced by the pinned Lab reviewer.

It validates field sets, expected statuses, SHA pins, no inference or production authorization, source file permissions, the absence of duplicate keys, and a clean receipt-only review. It writes a unique private `0600` ZIP containing just:

- `readiness-ten-fields.json`
- `lab-review-status.json` (strictly allowlisted fields; free-text reviewer `note` intentionally excluded)
- `handoff-manifest.json` (SHA-256 of both JSON files, the reviewer source pin, explicit `UNVERIFIED_EXTERNAL`, `independent_lab_has_inspected_payload=false`)

No network call, upload, message send or model execution occurs. The ZIP itself is private. The packager fails rather than mislabeling a four-scenario report as Gate 0 or silently filtering extra receipt fields.

**Authorized local usage, after reviewing the exact source:** run with full absolute paths for `--receipt`, `--review`, and a new `--output` path in a private `0700` directory. For example:

```text
python3 eo001-gate0-private-handoff.py --receipt /PRIVATE/EXPORTED/sanitized-receipt.json --review /PRIVATE/EXPORTED/independent-review.json --output /PRIVATE/EXPORTED/gate0-private-handoff.zip
```

No `set -e` is needed. Keep the original source files unchanged. Inspect the ZIP entries and field values locally. Share only after the owner explicitly approves the payload and Chandra confirms a suitable private channel. **Never upload the private ZIP into a public GitHub issue or PR.**

## Gate 1 proposal is not yet complete

The companion [Evercraft run-plan proposal](eo001-run-plan.evercraft-proposed.json) carries known source and model/runtime SHA pins and the discussed initial baseline (one warm-up, four fixed scenarios, six decisions maximum per scenario, 15-second decision wall clock, no failure replacement). Chandra's `check_run_manifest.py` from Lab PR #51 should return `NEEDS_REVIEW` until missing fields are agreed. In particular, we have not yet frozen prompt/context hashes, warm-up prompt or limit, host configuration, cleanup validation, review references, and output naming.

Our sovereign adapter has a **12-second HTTP request component timeout**, not a proved 15-second end-to-end wall-time result. The earlier 17.81-second first inference was an un-warmed smoke result. Real decision timing remains unmeasured.

**Do not run the four actual-Qwen scenarios** until the two teams agree and record a versioned protocol and the founder approves the bounded isolated local experiment. Preserve all timeouts and negative results.

## Reproducible, non-model test

```sh
python3 integrations/ai-evaluation-lab/test_gate0_private_handoff.py
node --test integrations/ai-evaluation-lab/eo001-sovereign-gateway-candidate.test.mjs
```

Both run only synthetic local fixtures. The GitHub Actions workflow checks these without production credentials or local model weights.

Coordination: [Evercraft draft PR #1933](https://github.com/jgaethle10/forge-operator/pull/1933), [Lab draft PR #51](https://github.com/kaulastudies/ai-evaluation-lab/pull/51), [Lab issue #35](https://github.com/kaulastudies/ai-evaluation-lab/issues/35).
