import test from 'node:test';
import assert from 'node:assert/strict';
import {asrTokens,wordEdits,compareForensiScopeAsr} from './asr-comparison.mjs';

const sha='sha256:'+'a'.repeat(64);
function sample(overrides={}){
  return {
    sample_id:'authorized-synthetic-001',rights_attested:true,
    declared_source_sha256:sha,
    reference_text:'one two three four five six seven eight nine ten',
    baseline:{engine_id:'incumbent',transcript:'one two three four five six seven eight nine wrong',processing_ms:1200,qa_minutes:4,direct_cost_usd:0.4},
    candidate:{engine_id:'faster-whisper',transcript:'one two three four five six seven eight nine ten',processing_ms:850,qa_minutes:3,direct_cost_usd:0.3},
    ...overrides
  };
}
const input=(samples=[sample()])=>({
  schema:'evercraft.forensiscope.asr-comparison-input.v1',
  experiment_id:'synthetic-asr-lab-001',samples
});

test('tokenizer and bounded Levenshtein count edits deterministically',()=>{
  assert.deepEqual(asrTokens('Hello, WORLD!'),['hello','world']);
  assert.equal(wordEdits(['one','two','three'],['one','wrong','three']),1);
  assert.equal(wordEdits(['one','two','three'],['one','two']),1);
  assert.equal(wordEdits(['one','two'],['one','two','three']),1);
});

test('candidate with better quality and delivery economics is preferred only for further tests',()=>{
  const result=compareForensiScopeAsr(input());
  assert.equal(result.decision,'candidate_preferred_for_further_testing');
  assert.equal(result.sample_count,1);
  assert.equal(result.metrics.baseline.word_error_rate,0.1);
  assert.equal(result.metrics.candidate.word_error_rate,0);
  assert.ok(result.improvements.length>=1);
  assert.equal(result.authority.production_admission,false);
  assert.equal(result.authority.paid_delivery_verified,false);
  assert.equal(result.evidence_scope,'caller_supplied_metrics_not_independently_verified');
  assert.match(result.comparison_digest,/^sha256:[a-f0-9]{64}$/);
});

test('faster but inaccurate output fails closed',()=>{
  const s=sample({candidate:{...sample().candidate,transcript:'one two bad bad bad bad bad bad bad bad',processing_ms:20}});
  const result=compareForensiScopeAsr(input([s]));
  assert.equal(result.decision,'reject_candidate_in_comparison');
  assert.ok(result.rejection_reasons.includes('candidate_word_error_regressed'));
  assert.ok(result.rejection_reasons.includes('candidate_absolute_wer_exceeds_25_percent'));
});

test('candidate with only trivial improvement cannot qualify',()=>{
  const s=sample({candidate:{...sample().candidate,processing_ms:1190,qa_minutes:3.99,direct_cost_usd:0.399}});
  const result=compareForensiScopeAsr(input([s]));
  assert.equal(result.decision,'reject_candidate_in_comparison');
  assert.ok(result.rejection_reasons.includes('no_measured_10_percent_operational_improvement'));
});

test('one cheap metric cannot conceal huge QA or processing regressions',()=>{
  const s=sample({candidate:{...sample().candidate,processing_ms:2000,qa_minutes:7,direct_cost_usd:0.01}});
  const result=compareForensiScopeAsr(input([s]));
  assert.equal(result.decision,'reject_candidate_in_comparison');
  assert.ok(result.rejection_reasons.includes('processing_time_regressed'));
  assert.ok(result.rejection_reasons.includes('qa_effort_regressed'));
});

test('two authorized samples are weighted by reference words',()=>{
  const s2=sample({sample_id:'authorized-synthetic-002',declared_source_sha256:'sha256:'+'b'.repeat(64),
    reference_text:'hello world',baseline:{...sample().baseline,transcript:'hello bad'},candidate:{...sample().candidate,transcript:'hello world'}});
  const result=compareForensiScopeAsr(input([sample(),s2]));
  assert.equal(result.metrics.reference_words,12);
  assert.equal(result.sample_count,2);
  assert.equal(result.metrics.candidate.word_error_rate,0);
});

test('transcript strings do not appear in receipts',()=>{
  const secret='secretcustomerphrase';
  const s=sample({reference_text:'one two three '+secret,
    baseline:{...sample().baseline,transcript:'one two three '+secret},
    candidate:{...sample().candidate,transcript:'one two three '+secret}});
  const result=compareForensiScopeAsr(input([s]));
  assert.equal(JSON.stringify(result).includes(secret),false);
  assert.equal(result.privacy.transcripts_not_embedded_in_result,true);
});

test('consent, hashes, experiment schemas, distinct engines are required',()=>{
  assert.throws(()=>compareForensiScopeAsr(input([sample({rights_attested:false})])),/rights_attestation_required/);
  assert.throws(()=>compareForensiScopeAsr(input([sample({declared_source_sha256:'sha256:incorrect'})])),/source_hash_invalid/);
  assert.throws(()=>compareForensiScopeAsr(input([sample(),sample()])),/duplicate_sample/);
  const same=sample({candidate:{...sample().candidate,engine_id:'incumbent'}});
  assert.throws(()=>compareForensiScopeAsr(input([same])),/distinct_engines/);
  assert.throws(()=>compareForensiScopeAsr({schema:'wrong',samples:[sample()]}),/schema_invalid/);
});

test('NaN, negative and unbounded input are rejected',()=>{
  assert.throws(()=>compareForensiScopeAsr(input([sample({candidate:{...sample().candidate,direct_cost_usd:-1}})])),/direct_cost_usd_invalid/);
  assert.throws(()=>compareForensiScopeAsr(input([sample({candidate:{...sample().candidate,qa_minutes:Number.NaN}})])),/qa_minutes_invalid/);
  assert.throws(()=>compareForensiScopeAsr(input([sample({reference_text:'word '.repeat(701)})])),/word_count_invalid/);
  assert.throws(()=>compareForensiScopeAsr(input(Array.from({length:13},(_,i)=>sample({sample_id:'s'+i})))),/sample_count_invalid/);
});
