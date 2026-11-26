import {createHash} from 'node:crypto';

// Read-only evaluation of already-produced transcripts. No provider calls, model
// execution, payment operations, or automatic release/admission authority.
const MAX_SAMPLES=12;
const MAX_WORDS=700;
const MAX_TEXT=6000;
const SHA=/^sha256:[a-f0-9]{64}$/;
const numeric=(n,key)=>{
  if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1e9) throw Error(key+'_invalid');
  return n;
};
const str=(v,key,max=128)=>{
  if(typeof v!=='string'||!v.trim()||v.length>max) throw Error(key+'_invalid');
  return v.trim();
};
const hash=v=>'sha256:'+createHash('sha256').update(v).digest('hex');

export function asrTokens(text){
  if(typeof text!=='string'||!text.trim()||text.length>MAX_TEXT) throw Error('transcript_text_invalid');
  const words=text.normalize('NFKC').toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)||[];
  if(!words.length||words.length>MAX_WORDS) throw Error('transcript_word_count_invalid');
  return words;
}

export function wordEdits(ref,hyp){
  // Two-row Levenshtein. Costs: insertion/deletion/substitution each 1.
  let previous=Array.from({length:hyp.length+1},(_,i)=>i);
  for(let i=1;i<=ref.length;i++){
    const current=[i];
    for(let j=1;j<=hyp.length;j++){
      current[j]=Math.min(
        previous[j]+1,
        current[j-1]+1,
        previous[j-1]+(ref[i-1]===hyp[j-1]?0:1)
      );
    }
    previous=current;
  }
  return previous[hyp.length];
}

const scoreRun=(run,ref)=>{
  str(run?.engine_id,'engine_id');
  const transcript=asrTokens(run.transcript);
  const processing_ms=numeric(run.processing_ms,'processing_ms');
  const qa_minutes=numeric(run.qa_minutes,'qa_minutes');
  const direct_cost_usd=numeric(run.direct_cost_usd,'direct_cost_usd');
  return {
    engine_id:run.engine_id,
    edits:wordEdits(ref,transcript),
    processing_ms,
    qa_minutes,
    direct_cost_usd,
    transcript_digest:hash(transcript.join(' '))
  };
};
const total=(samples,k)=>samples.reduce((n,s)=>n+s[k],0);
const ratioBetter=(candidate,baseline)=>baseline>0&&(baseline-candidate)/baseline>=0.1;
const fixed=n=>Number(n.toFixed(5));

export function compareForensiScopeAsr(input){
  if(input?.schema!=='evercraft.forensiscope.asr-comparison-input.v1') throw Error('asr_comparison_schema_invalid');
  const experimentId=str(input.experiment_id,'experiment_id');
  if(!Array.isArray(input.samples)||input.samples.length<1||input.samples.length>MAX_SAMPLES)throw Error('asr_sample_count_invalid');
  const seen=new Set(),rows=[];
  for(const sample of input.samples){
    const sampleId=str(sample.sample_id,'sample_id');
    if(seen.has(sampleId)) throw Error('asr_duplicate_sample');
    seen.add(sampleId);
    if(sample.rights_attested!==true)throw Error('asr_rights_attestation_required');
    if(typeof sample.declared_source_sha256!=='string'||!SHA.test(sample.declared_source_sha256))throw Error('asr_source_hash_invalid');
    const ref=asrTokens(sample.reference_text);
    const baseline=scoreRun(sample.baseline,ref);
    const candidate=scoreRun(sample.candidate,ref);
    if(baseline.engine_id===candidate.engine_id)throw Error('asr_comparison_requires_distinct_engines');
    rows.push({
      sample_id:sampleId,
      declared_source_sha256:sample.declared_source_sha256,
      reference_digest:hash(ref.join(' ')),
      reference_words:ref.length,
      baseline,candidate
    });
  }
  const words=total(rows,'reference_words');
  const sum=(type,field)=>rows.reduce((n,s)=>n+s[type][field],0);
  const base={
    errors:sum('baseline','edits'), processing_ms:sum('baseline','processing_ms'),
    qa_minutes:sum('baseline','qa_minutes'), direct_cost_usd:sum('baseline','direct_cost_usd')
  };
  const cand={
    errors:sum('candidate','edits'), processing_ms:sum('candidate','processing_ms'),
    qa_minutes:sum('candidate','qa_minutes'), direct_cost_usd:sum('candidate','direct_cost_usd')
  };
  const reasons=[];
  if(cand.errors>base.errors) reasons.push('candidate_word_error_regressed');
  if(cand.errors/words>0.25)reasons.push('candidate_absolute_wer_exceeds_25_percent');
  if(cand.qa_minutes>base.qa_minutes*1.1+1e-9)reasons.push('qa_effort_regressed');
  if(cand.direct_cost_usd>base.direct_cost_usd*1.1+1e-9)reasons.push('direct_cost_regressed');
  if(cand.processing_ms>base.processing_ms*1.1+1e-9)reasons.push('processing_time_regressed');
  const wins=[
    ratioBetter(cand.processing_ms,base.processing_ms)?'processing_time_at_least_10_percent_better':null,
    ratioBetter(cand.qa_minutes,base.qa_minutes)?'qa_effort_at_least_10_percent_better':null,
    ratioBetter(cand.direct_cost_usd,base.direct_cost_usd)?'direct_cost_at_least_10_percent_better':null
  ].filter(Boolean);
  if(!wins.length)reasons.push('no_measured_10_percent_operational_improvement');
  // All source and metric values are caller-provided. A passing comparison
  // remains a candidate, not real-world verification or release permission.
  const record={
    schema:'evercraft.forensiscope.asr-comparison.v1',
    experiment_id:experimentId,
    sample_count:rows.length,
    declared_sample_hashes:rows.map(s=>({sample_id:s.sample_id,declared_source_sha256:s.declared_source_sha256,reference_digest:s.reference_digest,baseline_output_digest:s.baseline.transcript_digest,candidate_output_digest:s.candidate.transcript_digest})),
    metrics:{
      reference_words:words,
      baseline:{word_error_rate:fixed(base.errors/words),processing_ms:base.processing_ms,qa_minutes:fixed(base.qa_minutes),direct_cost_usd:fixed(base.direct_cost_usd)},
      candidate:{word_error_rate:fixed(cand.errors/words),processing_ms:cand.processing_ms,qa_minutes:fixed(cand.qa_minutes),direct_cost_usd:fixed(cand.direct_cost_usd)}
    },
    improvements:wins,
    rejection_reasons:reasons,
    decision:reasons.length?'reject_candidate_in_comparison':'candidate_preferred_for_further_testing',
    evidence_scope:'caller_supplied_metrics_not_independently_verified',
    authority:{production_admission:false,model_release:false,paid_delivery_verified:false,settled_payment_verified:false,automatic_model_selection:false},
    privacy:{transcripts_not_embedded_in_result:true},
  };
  return {...record,comparison_digest:hash(JSON.stringify(record))};
}
