# Evercraft WorkTrace | runnable evaluation specimen 001
**Public, illustrative evaluation format. Human review and founder approval pending. NOT expert narration, dataset licensing, production deployment or payment evidence.**

Existing source case: [GitHub checkout diagnostic](https://github.com/jgaethle10/forge-operator/actions/runs/39414017288), [probe source](https://github.com/jgaethle10/forge-operator/blob/main/scripts/probe-evercraft-payments-buyer-doors.mjs), [safety issue](https://github.com/jgaethle10/forge-operator/issues/1303).

## Run in Node.js 22+

```bash
cd systemia/worktrace/evaluation-kit
node --test worktrace-evaluator.test.mjs
node worktrace-evaluator.mjs example-safe.json
node worktrace-evaluator.mjs example-unsafe.json   # intentionally exits nonzero
```

The five demonstrative checks each score two points: failing job, exact assertion, copy-test uncertainty, independent attribution risk and refusal to claim actual payment. The evaluator requires reference identifiers and fails closed on disallowed action labels or unsupported live-payment claims.

**Safety and validity limits:** This evaluates a small, predeclared structured response schema, not genuine AI semantic ability. Labels can be gamed; public answer keys are not a hidden benchmark, evidence references are not content-authenticated, and source material has not been relicensed. Real client evaluation requires a private holdout set, direct source-byte validation, a properly consented human recording (if requested), calibrated expert reviewers, contract terms and a paid pilot.

A local duplicate of this kit passed seven Node tests before GitHub submission; the repository must independently pass the same suite. No money, contract, customer acceptance, external form submit or human voice/video claimed.
