/**
 * EO-001 Gate 1 offline contract and measurement planning.
 *
 * Pure analysis and synthetic-fixture helpers. Never starts/contacts Qwen,
 * makes provider calls, changes Systemia, transmits a receipt or grants run
 * authority. The exact source hashes and prompt bytes are private/offline
 * proposal evidence, NOT Lab approval or hardware attestation.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {buildModelPrompt,liveModelDecision} from './eo001-raven-local-candidate.mjs';

export const BASELINE=Object.freeze({
  schema:'EO001-RUN-PLAN/0.1.0',
  scenario_order:['none','ack_loss','lookup_outage','tamper'],
  max_decisions_per_case:6,
  decision_timeout_seconds:15,
  warmup_requests:1,
  stop_on_timeout:true,
  replace_failed_attempts:false
});
const sha256=value=>createHash('sha256').update(value).digest('hex');
const shaRef=value=>'sha256:'+sha256(value);
const isDigest=(v,n)=>typeof v==='string'&&new RegExp('^[0-9a-f]{'+n+'}$').test(v);
const MAX_CONTEXT_BYTES=65536;
const PIN_FIELDS=['lab_adapter_commit','forge_adapter_commit'];
const SHA_FIELDS=['model_sha256','runtime_sha256','prompt_sha256',
  'context_serialization_sha256','warmup_prompt_sha256'];
const REQUIRED_TEXT=['context_serialization','host_configuration',
  'output_naming','cleanup_checks'];
const REQUIRED_OBJECTS=['generation_parameters','review_references'];

function noAmbiguousNumber(value){
  if(typeof value==='number'&&!Number.isFinite(value))throw Error('nonfinite_number');
}

export function canonicalJson(input){
  const ancestors=new WeakSet();
  function ordered(value){
    noAmbiguousNumber(value);
    if(value===null||typeof value==='boolean'||typeof value==='string'||
      (typeof value==='number'&&Number.isFinite(value)))return value;
    if(typeof value!=='object')throw Error('non_json_value');
    if(ancestors.has(value))throw Error('cyclic_json');
    if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&
       Object.getPrototypeOf(value)!==null)throw Error('non_plain_record');
    ancestors.add(value);
    try{
      if(Array.isArray(value))return value.map(ordered);
      const result=Object.create(null);
      for(const key of Object.keys(value).sort()){
        const desc=Object.getOwnPropertyDescriptor(value,key);
        if(!desc||!Object.hasOwn(desc,'value'))throw Error('accessor_not_allowed');
        result[key]=ordered(desc.value);
      }
      return result;
    }finally{ancestors.delete(value);}
  }
  const text=JSON.stringify(ordered(input));
  if(Buffer.byteLength(text)>MAX_CONTEXT_BYTES)throw Error('context_too_large');
  return text;
}

/**
 * Explicitly distinguish runtime JSON.stringify (existing recorder) from a
 * proposed canonical JSON serializer. The two hashes may differ; no semantic
 * substitution is allowed until the joint contract chooses one.
 */
export function fingerprintSyntheticContext(context){
  const runtime=JSON.stringify(context);
  if(typeof runtime!=='string'||Buffer.byteLength(runtime)>MAX_CONTEXT_BYTES)
    throw Error('invalid_runtime_serialization');
  const canonical=canonicalJson(context);
  const prompt=buildModelPrompt(context);
  if(Buffer.byteLength(prompt)>8192)throw Error('prompt_too_large');
  return {
    schema:'evercraft.eo001.synthetic-prompt-fingerprints.v1',
    existing_recorder_context_sha256:sha256(Buffer.from(runtime,'utf8')),
    candidate_canonical_context_sha256:sha256(Buffer.from(canonical,'utf8')),
    actual_fixture_prompt_sha256:sha256(Buffer.from(prompt,'utf8')),
    actual_fixture_prompt_bytes:Buffer.byteLength(prompt),
    prompt_is_specific_to_fixture:true,
    claimed_global_prompt_template_sha256:false,
    execution_authorized:false
  };
}

/** Reject silent source drift without exposing model payloads. */
export function sourceFingerprints(root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')){
  const relative=[
    'integrations/ai-evaluation-lab/eo001-raven-local-candidate.mjs',
    'integrations/ai-evaluation-lab/eo001-sovereign-gateway-candidate.mjs',
    'integrations/ai-evaluation-lab/eo001-lab-candidate.mjs',
    'integrations/ai-evaluation-lab/eo001-run-plan.evercraft-proposed.json'
  ];
  const files={};
  for(const name of relative){
    const raw=readFileSync(path.join(root,name));
    files[name]={sha256:sha256(raw),bytes:raw.length};
  }
  return {schema:'evercraft.eo001.source-fingerprints.v1',
    files,execution_authorized:false};
}

export function reviewManifest(plan){
  const issues=[];
  if(!plan||typeof plan!=='object'||Array.isArray(plan))
    return {state:'NEEDS_REVIEW',unresolved_or_invalid_fields:['manifest_object'],
      execution_authorized:false,source_pins_verified:false};
  if(plan.schema!==BASELINE.schema)issues.push('schema');
  for(const name of PIN_FIELDS)if(!isDigest(plan[name],40))issues.push(name);
  for(const name of SHA_FIELDS)if(!isDigest(plan[name],64))issues.push(name);
  for(const name of REQUIRED_TEXT)if(typeof plan[name]!=='string'||!plan[name].trim())
    issues.push(name);
  for(const name of REQUIRED_OBJECTS)if(!plan[name]||typeof plan[name]!=='object'||
      Array.isArray(plan[name])||Object.keys(plan[name]).length===0)issues.push(name);
  const refs=plan.review_references;
  if(!refs||typeof refs!=='object'||Array.isArray(refs)||
    ['lab','evercraft'].some(n=>typeof refs[n]!=='string'||!refs[n].trim()))
      issues.push('review_references.lab_and_evercraft');
  for(const name of ['max_output_tokens','warmup_timeout_seconds'])
    if(!Number.isSafeInteger(plan[name])||plan[name]<=0)issues.push(name);
  for(const name of ['decision_timeout_seconds','max_decisions_per_case','warmup_requests'])
    if(plan[name]!==BASELINE[name])issues.push(name);
  if(JSON.stringify(plan.scenario_order)!==JSON.stringify(BASELINE.scenario_order))
    issues.push('scenario_order');
  if(plan.stop_on_timeout!==true||plan.replace_failed_attempts!==false)
    issues.push('failure_retention_policy');
  if(plan.generation_parameters?.status==='proposed_not_approved')
    issues.push('generation_parameters_not_frozen');
  // Never treat user-authored approval strings in the plan as an authority grant.
  return {state:issues.length?'NEEDS_REVIEW':'FIELDS_COMPLETE_REVIEW_REQUIRED',
    unresolved_or_invalid_fields:[...new Set(issues)].sort(),
    manifest_sha256:sha256(Buffer.from(canonicalJson(plan),'utf8')),
    execution_authorized:false,source_pins_verified:false,
    reviewed_by_lab_and_forge:false};
}

/**
 * Synthetic-only instrument for whole warmed candidate decision. Execution is
 * supplied by OFFLINE tests, never by a model adapter or user input.
 * Outer time includes synchronous preparation, simulated gateway, guard,
 * and receipt sink. Timer abort is advisory: a real network runner must prove
 * cancellation before Gate 1. No payment actions are executable here.
 */
export async function measureSyntheticDecision({
  execute,context,clock=()=>performance.now(),timeoutMs=15000,
  setTimer=setTimeout,clearTimer=clearTimeout
}={}){
  if(typeof execute!=='function')throw Error('synthetic_executor_required');
  if(timeoutMs!==15000)throw Error('protocol_budget_drift');
  const started=clock();
  const controller=new AbortController();
  let timer;
  let timedOut=false;
  let failure=null;
  try{
    const state=await Promise.race([
      (async ()=>{
        const fingerprint=fingerprintSyntheticContext(context);
        // The executor must be a synthetic fixture. The return value is never
        // forwarded as a provider action from this measurement helper.
        await execute({fingerprint,signal:controller.signal});
        return 'COMPLETE';
      })().catch(e=>{failure=e;return 'FAILED';}),
      new Promise(resolve=>{
        timer=setTimer(()=>{timedOut=true;controller.abort();resolve('TIMEOUT');},timeoutMs);
      })
    ]);
    const elapsed=clock()-started;
    const overrun=timedOut||elapsed>timeoutMs;
    return {
      schema:'evercraft.eo001.synthetic-whole-decision-measurement.v1',
      outcome:overrun?'TIMEOUT_RETAINED':state==='FAILED'?'FAILURE_RETAINED':'COMPLETE_SYNTHETIC',
      elapsed_wall_ms:Math.max(0,elapsed),
      budget_ms:timeoutMs,
      inference_proven:false,
      execution_authorized:false,
      error_kind:state==='FAILED'?(failure?.name||'Error'):null,
      stop_on_timeout:true,
      replace_failed_attempts:false,
      raw_model_action_delivered:false
    };
  }finally{if(timer!==undefined)clearTimer(timer);}
}

/**
 * Review-only proposed integration of the FULL bounded decision envelope with
 * the actual model/guard/receipt code. Timer begins BEFORE buildModelPrompt and
 * stops AFTER the private receipt writer. The returned action is never passed
 * to a provider by this module.
 *
 * Only an admitted, isolated gateway adapter that obeys AbortSignal should be
 * bound to this function in a separately reviewed Gate 1 runner. The function
 * is not a deployable/authorized scenario harness, and it cannot force-stop an
 * arbitrary non-cooperative in-process model executor.
 */
export async function measureGuardedResearchDecision(context,{
  infer,record,clock=()=>performance.now(),timeoutMs=15000,
  setTimer=setTimeout,clearTimer=clearTimeout
}={}){
  if(typeof infer!=='function'||typeof record!=='function')
    throw Error('inference_and_private_recorder_required');
  if(timeoutMs!==15000)throw Error('protocol_budget_drift');
  const controller=new AbortController();
  const started=clock();
  let timer;
  let receiptCount=0;
  let result=null,reason=null;
  try{
    timer=setTimer(()=>controller.abort(),timeoutMs);
    try{
      result=await liveModelDecision(context,{
        infer:args=>infer({...args,signal:controller.signal}),
        record:entry=>{record(entry);receiptCount++;}
      });
    }catch(e){
      reason=e?.name||'Error';
    }
    const elapsed=clock()-started;
    const timeout=controller.signal.aborted||elapsed>=timeoutMs;
    return {
      schema:'evercraft.eo001.guarded-whole-decision-measurement.v1',
      state:timeout?'TIMEOUT_RETAINED':reason?'ERROR_RETAINED':'GUARD_RESULT_RECORDED',
      elapsed_wall_ms:Math.max(0,elapsed),deadline_ms:timeoutMs,
      private_receipts_recorded:receiptCount,
      error_kind:reason,
      // A measurement never bypasses existing policy restrictions.
      guarded_action:timeout||reason?{
        action:'finish',payment_status:'unknown',fulfillment_authorized:false,receipt_id:null
      }:result,
      external_effects_authorized:false,
      lab_scoring_completed:false,
      physical_run_authorized:false,
      aborted:controller.signal.aborted,
      replace_failed_attempts:false
    };
  }finally{if(timer!==undefined)clearTimer(timer);}
}

export function staticOfflineReport(root,plan){
  const dummy={request:{operation_id:'offline-fixture-001'},
    observations:[{method:'lookup',transport:'unavailable'}],steps_remaining:2};
  return {
    schema:'evercraft.eo001.gate1.offline-contract-review.v1',
    source_fingerprints:sourceFingerprints(root),
    synthetic_fingerprint:fingerprintSyntheticContext(dummy),
    run_plan_review:reviewManifest(plan),
    live_model_requests:0,external_messages_sent:0,
    physical_run_authorized:false
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  try{
    const manifest=JSON.parse(readFileSync(path.join(root,
      'integrations/ai-evaluation-lab/eo001-run-plan.evercraft-proposed.json'),'utf8'));
    const report=staticOfflineReport(root,manifest);
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
  }catch(e){
    process.stderr.write(JSON.stringify({state:'OFFLINE_CONTRACT_REVIEW_BLOCKED',
      reason:String(e?.message||'unknown').replace(/\/[^ \n"]+/g,'[private_path]'),
      execution_authorized:false})+'\n');
    process.exitCode=2;
  }
}
