import test from 'node:test';
import assert from 'node:assert/strict';
import {measureGuardedResearchDecision}
  from './eo001-gate1-offline-contract.mjs';

const context={
  request:{operation_id:'synthetic-internal-only-001'},
  observations:[],steps_remaining:2
};
const safe='{"action":"finish","payment_status":"unknown","fulfillment_authorized":false,"receipt_id":null}';

test('full decision runs actual prompt, policy guard and receipt sink before wall clock stops',async()=>{
  const recorded=[];
  const times=[100,190];
  const state=await measureGuardedResearchDecision(context,{
    infer:async({input,signal})=>{
      assert.match(input,/You are a bounded synthetic-payment recovery decision agent/);
      assert.equal(signal.aborted,false);
      return {text:safe,model:'synthetic-test-model'};
    },
    record:recordedEntry=>recorded.push(recordedEntry),
    clock:()=>times.shift()
  });
  assert.equal(state.state,'GUARD_RESULT_RECORDED');
  assert.equal(state.elapsed_wall_ms,90);
  assert.equal(state.private_receipts_recorded,1);
  assert.equal(recorded.length,1);
  assert.equal(recorded[0].schema,'evercraft.eo001.local-model-decision.v2');
  assert.equal(state.guarded_action.fulfillment_authorized,false);
  assert.equal(state.external_effects_authorized,false);
  assert.equal(state.physical_run_authorized,false);
});
test('guarded result completed over 15 seconds is classified timeout and cannot be delivered',async()=>{
  const recorded=[];
  const times=[0,15001];
  const state=await measureGuardedResearchDecision(context,{
    infer:async()=>({text:'{"action":"execute"}'}),
    record:r=>recorded.push(r),
    clock:()=>times.shift()
  });
  assert.equal(state.state,'TIMEOUT_RETAINED');
  assert.equal(state.guarded_action.action,'finish');
  assert.equal(state.guarded_action.payment_status,'unknown');
  assert.equal(state.private_receipts_recorded,1);
  assert.equal(state.replace_failed_attempts,false);
});
test('timeout signal reaches pending synthetic transport and preserves error receipt',async()=>{
  const recorded=[];
  let observedAbort=false;
  const times=[0,15000];
  const state=await measureGuardedResearchDecision(context,{
    infer:async({signal})=>new Promise((resolve,reject)=>{
      signal.addEventListener('abort',()=>{
        observedAbort=true;
        const error=new Error('Synthetic fixture aborted');error.name='AbortError';
        reject(error);
      },{once:true});
    }),
    record:r=>recorded.push(r),
    clock:()=>times.shift(),
    setTimer:fn=>{queueMicrotask(fn);return 1;},clearTimer:()=>{}
  });
  assert.equal(observedAbort,true);
  assert.equal(state.state,'TIMEOUT_RETAINED');
  assert.equal(state.aborted,true);
  assert.equal(state.error_kind,'AbortError');
  assert.equal(recorded[0].type,'local_model_inference_error');
  assert.equal(state.guarded_action.fulfillment_authorized,false);
});
test('transport error remains error, not successful synthetic case',async()=>{
  const recorded=[];
  const times=[0,75];
  const state=await measureGuardedResearchDecision(context,{
    infer:async()=>{const e=new Error('fixture');e.name='GatewayOffline';throw e;},
    record:entry=>recorded.push(entry),
    clock:()=>times.shift()
  });
  assert.equal(state.state,'ERROR_RETAINED');
  assert.equal(state.error_kind,'GatewayOffline');
  assert.equal(recorded.length,1);
  assert.equal(state.guarded_action.action,'finish');
});
test('unapproved increased deadline is refused before inference',async()=>{
  let called=false;
  await assert.rejects(measureGuardedResearchDecision(context,{
    infer:async()=>{called=true;return {text:safe};},
    record:()=>{},timeoutMs:16000
  }),/protocol_budget_drift/);
  assert.equal(called,false);
});
test('a private receipt sink failure cannot establish decision success',async()=>{
  const times=[0,50];
  const state=await measureGuardedResearchDecision(context,{
    infer:async()=>({text:safe}),
    record:()=>{const e=new Error('disk full');e.name='ReceiptIOError';throw e;},
    clock:()=>times.shift()
  });
  assert.equal(state.state,'ERROR_RETAINED');
  assert.equal(state.private_receipts_recorded,0);
  assert.equal(state.error_kind,'ReceiptIOError');
  assert.equal(state.guarded_action.fulfillment_authorized,false);
});
