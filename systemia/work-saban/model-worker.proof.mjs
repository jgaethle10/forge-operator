import assert from 'node:assert/strict';
import { executeApprovedModelWorker } from './model-worker.mjs';

const approval={
  model_inference_approved:true,external_network_approved:true,
  outbound_actions_approved:false,source_access_approved:false
};
const adapter={provider:'test_provider',async execute(input){
  assert.equal(input.tool_access,false);
  assert.equal(input.source_access,false);
  assert.equal(input.outbound_actions,false);
  return {provider:'test_provider',model_inference_performed:true,
    model_id:'fixture-model',provider_request_id:'fixture-request',
    output_text:'Fixture output. No real provider was called.',external_actions:[]};
}};
await assert.rejects(executeApprovedModelWorker({task:'Write a summary',adapter}),
  /model_execution_consent_required/);
await assert.rejects(executeApprovedModelWorker({task:'Write a summary',approval}),
  /verified_model_adapter_required/);
await assert.rejects(executeApprovedModelWorker({task:'Write a summary',approval:{
  ...approval,outbound_actions_approved:true
},adapter}),/model_execution_consent_required/);
const receipt=await executeApprovedModelWorker({task:'Write a summary',approval,adapter});
assert.equal(receipt.evidence_state,'adapter_reported_model_execution_unattested');
assert.equal(receipt.independent_provider_attestation,false);
assert.equal(receipt.verified_customer_delivery,false);
assert.match(receipt.input_sha256,/^sha256:[a-f0-9]{64}$/);
await assert.rejects(executeApprovedModelWorker({task:'Write a summary',approval,
  adapter:{provider:'test_provider',async execute(){return {
    provider:'test_provider',model_inference_performed:true,
    model_id:'fixture-model',provider_request_id:'fixture-request',
    output_text:'Unsafe',external_actions:[{kind:'email_send'}]
  };}}}),/model_worker_unverified_output/);
await assert.rejects(executeApprovedModelWorker({task:'Write a summary',approval,
  adapter:{provider:'test_provider',async execute(){return {
    provider:'test_provider',model_inference_performed:false,
    model_id:'fixture-model',provider_request_id:'fixture-request',
    output_text:'No model',external_actions:[]
  };}}}),/model_worker_unverified_output/);
console.log('Work Saban model adapter boundary fixture proof: PASS (no live model invoked)');
