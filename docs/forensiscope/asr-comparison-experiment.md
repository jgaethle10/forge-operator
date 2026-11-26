# ForensiScope autoresearch-style ASR comparison gate

**State:** source-only candidate, review required. This implements an *evaluation discipline*, not Karpathy's `autoresearch` GPU training engine. No outside model, dependency, service, agent, release or cost commitment has been installed. Existing ForensiScope production engines remain unchanged.

## Why this exists

The next ForensiScope revenue improvement must be measurable: reduce actual transcription/QA cost per order while holding the quality line. Before swapping engines, record the same permitted recording's reference transcript and the baseline/candidate outputs. Comparisons should be reproducible and reasons for rejecting a worse engine visible.

- Code: `systemia/forensiscope/asr-comparison.mjs`
- Tests: `systemia/forensiscope/asr-comparison.test.mjs`
- CI: existing `.github/workflows/forensiscope-asr.yml`, alongside the runtime test suite
- Existing local engine candidate: **draft PR #2190**, not installed or production-accepted

The comparison receives **previously measured** values. It does NOT transcribe, automatically choose an engine, start a GPU job, contact an AI provider or validate whether the caller actually measured its timing/cost. Passing is **candidate preferred for further testing**, never production admission.

## Input contract

```js
import {compareForensiScopeAsr} from './systemia/forensiscope/asr-comparison.mjs';
const receipt=compareForensiScopeAsr({
  schema:'evercraft.forensiscope.asr-comparison-input.v1',
  experiment_id:'asr-test-with-consented-source-001',
  samples:[{
    sample_id:'clip-001',
    rights_attested:true, // user-supplied attestation, not independently verified
    declared_source_sha256:'sha256:' + 'a'.repeat(64), // substitute ACTUAL media SHA-256
    reference_text:'one two three four',
    baseline:{engine_id:'incumbent-model-version',transcript:'one two three four',
      processing_ms:2400,qa_minutes:4,direct_cost_usd:0.40},
    candidate:{engine_id:'local-model-version',transcript:'one two three four',
      processing_ms:1600,qa_minutes:3,direct_cost_usd:0.30}
  }]
});
console.log(JSON.stringify(receipt,null,2)); // transcript texts intentionally excluded
```

This is a synthetic example, not measured Evercraft performance. Never put sensitive media or transcript content in GitHub issues, PR comments or Actions logs. Run real comparisons only in private, authorized, locally protected workloads; use existing customer media-rights, retention and access controls. **A declared hash is not an independently verified hash of bytes.** Generate and verify it against immutable source before accepting actual evidence.

## Scoring & release boundary

- Word error rate (WER) uses word-level edit distance divided by reference word count, aggregated across all included samples. Case and punctuation are normalized. The scorer is deterministic but isn't an independent factual quality judge.
- Candidate must **not increase WER**, must remain at or under **25% WER**, and must improve at least one of processing time, QA minutes or direct cost by **10% or more**.
- Candidate processing time, QA effort or direct cost must each stay within **10% of baseline**. A cheaper engine with materially worse human correction time is rejected.
- Each sample requires rights attestation, declared media hash, distinct engine IDs, a nonempty reference and bounded numeric metrics; duplicates, large/unbounded inputs, NaN, and negative costs fail closed.
- Output exposes score, hashed transcript/reference fingerprints and an unverified evidence-state label, **not transcript contents**. Neither baseline nor candidate creates an Evercraft Payments transaction.
- No synthetic pass grants `production_admission`, `model_release`, `paid_delivery_verified` or `settled_payment_verified`.

## Real pilot acceptance

1. Use a small, **consented** representative audio sample with independently stored reference transcript and real immutable source hash, and do not upload the audio or transcript to this repository.
2. Run existing incumbent and a pinned, licensed candidate model using the **same owned machine and hardware budget**, recording model version, CPU/RAM, startup time, audio duration, word errors, wall clock, compute cost, and independent human QA minutes.
3. Compare both with this gate, separately spot-check human content accuracy, speaker attribution and segment timestamps. For legal/evidence work, unacceptable omissions override a favorable WER.
4. Retain private receipt and independent reproduction. Systemia, Capability Mesh and Execution Gate owner then decide whether to authorize a wider canary; this utility never makes that decision.
5. Only after real buyer consent, exact Evercraft Payments settlement verification, completed deliverable and verified client acceptance, compute paid fulfillment margin. No early revenue claims.

## Relationship to Karpathy repositories

Inspired by the repeatable baseline/experiment/retain-or-revert technique described in [karpathy/autoresearch](https://github.com/karpathy/autoresearch). **No source code from autoresearch is copied** and its main GPU training pipeline is not run. Reuses Evercraft's own ForensiScope engine and CI. The more elaborate LLM Wiki idea would attach to existing Context Fabric, not create another memory system.
