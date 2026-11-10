#!/usr/bin/env node
/**
 * Explicit opt-in, local-only synthetic Raven inference canary.
 * Never writes to Systemia, publishes output, starts a service or contacts cloud.
 * Runs ONLY after --execute-local is supplied on an operator-controlled node.
 */
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createLlamaCppInferenceCandidate } from './local-llama-inference.candidate.mjs';

const FIXTURE = 'Raven test only: return a brief acknowledgement that this is a synthetic local check. Do not access tools, files, accounts or the network.';

function parse(args) {
  const out={};
  if(args.length===1 && args[0]==='--help') return {help:true};
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(key==='--execute-local') {
      if(out.execute) throw Error('DUPLICATE_EXECUTION_FLAG');
      out.execute=true;
      continue;
    }
    if(!['--model','--origin'].includes(key) || !args[i+1] || args[i+1].startsWith('--')) {
      throw Error('INVALID_ARGUMENTS');
    }
    if(Object.hasOwn(out,key)) throw Error('DUPLICATE_ARGUMENT');
    out[key]=args[++i];
  }
  if(!out['--model']) throw Error('MODEL_REQUIRED');
  return {
    execute:out.execute===true,
    model:out['--model'],
    origin:out['--origin'] || 'http://127.0.0.1:36095'
  };
}

const summary = (state, extra={}) => ({
  schema:'evercraft.raven.local-inference-canary.v0',
  state,
  real_local_inference_performed:false,
  external_effect_authorized:false,
  systemia_mission_admitted:false,
  ...extra
});

export async function runOwnedLocalInferenceCanary({
  argv=process.argv.slice(2),
  createAdapter=createLlamaCppInferenceCandidate,
  stdout=process.stdout,
  stderr=process.stderr,
  uuid=randomUUID
}={}) {
  let config;
  try { config=parse(argv); }
  catch {
    stderr.write('Usage: node systemia/raven/benchmarks/run-owned-local-inference-canary.mjs --model MODEL_ID [--origin http://127.0.0.1:36095] --execute-local\n');
    return 2;
  }
  if(config.help) {
    stdout.write('Requires explicit --execute-local; local-only synthetic inference, no cloud or external actions.\n');
    return 0;
  }
  if(!config.execute) {
    stdout.write(JSON.stringify(summary('held',{reason:'EXPLICIT_LOCAL_EXECUTION_FLAG_REQUIRED'}),null,2)+'\n');
    return 3;
  }
  let adapter;
  try { adapter=createAdapter({model:config.model,origin:config.origin,allowLocalInference:true,maxTokens:96,timeoutMs:60000}); }
  catch {
    stdout.write(JSON.stringify(summary('held',{reason:'LOCAL_ADAPTER_CONFIGURATION_INVALID'}),null,2)+'\n');
    return 3;
  }

  try {
    const validation=await adapter.validate();
    if(validation.status!=='available' || validation.model!==config.model ||
       validation.inference_performed!==false || validation.prompt_sent!==false ||
       validation.external_effect_authorized!==false) {
      throw Error('VALIDATION_INCOMPLETE');
    }
    const result=await adapter.infer({
      request_id:'local-canary-'+uuid().replaceAll('-',''),
      role:'synthetic-qa',
      input:FIXTURE
    });
    if(result.status!=='completed' || result.model!==config.model ||
       !result.provider_receipt || result.receipt?.external_effect_authorized!==false ||
       result.receipt?.tool_invocation_performed!==false ||
       result.receipt?.provider_receipt_kind!=='local_integrity_hash_not_external_attestation') {
      throw Error('INFERENCE_RECEIPT_INVALID');
    }
    stdout.write(JSON.stringify(summary('observed',{
      real_local_inference_performed:true,
      provider:'llama-cpp',
      model:config.model,
      metadata_receipt:validation.validation_receipt,
      inference_receipt:result.provider_receipt,
      output_sha256:result.receipt.output_sha256,
      response_content_exposed:false,
      confidence:'local_result_observed_not_independently_verified',
      evidence_semantics:'A single local synthetic model call completed; not a real user mission, independent second opinion, or deployed Systemia agent'
    }),null,2)+'\n');
    return 0;
  } catch {
    // A transport timeout may occur after the server received the prompt.
    // Do not claim that inference did not happen after activation.
    stdout.write(JSON.stringify(summary('held',{
      reason:'LOCAL_CANARY_UNVERIFIED',
      inference_outcome:'unknown_after_activation',
      response_content_exposed:false
    }),null,2)+'\n');
    return 4;
  }
}

const direct=process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if(direct) runOwnedLocalInferenceCanary().then(c=>{process.exitCode=c;}).catch(()=>{
  process.stderr.write('Local canary held with an unexpected internal error.\n');
  process.exitCode=5;
});
