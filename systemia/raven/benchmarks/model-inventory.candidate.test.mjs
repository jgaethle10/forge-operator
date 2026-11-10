import test from 'node:test';
import assert from 'node:assert/strict';
import { observeRavenInventory } from './model-inventory.candidate.mjs';
import { decideModelRoute } from './model-route-policy.candidate.mjs';

const t = 1762700000000;
const spec = (extra={}) => ({
  provider_id:'ollama', model_id:'fixture-model-a', runtime:'local',
  capabilities:['text'], estimated_cost_usd:0, cost_estimate_kind:'quoted',
  cost_evidence_ref:'fixture:operator-local-api-fee',
  latency_ms:100, latency_evidence_ref:'fixture:local-latency',
  ...extra
});
const reply = (extra={}) => ({
  status:'available', provider:'ollama', model:'fixture-model-a',
  validation_receipt:'sha256:'+'a'.repeat(64),
  inference_performed:false, prompt_sent:false, base44_used:false,
  raw_credential_returned:false, ...extra
});
const stub = (state) => config => {
  state.engine_calls++;
  state.configs.push(config);
  return { validate:async()=>{state.validation_calls++; return reply();} };
};
const state = () => ({ engine_calls:0, validation_calls:0, configs:[] });

test('trusted local metadata observation creates policy-eligible inventory without prompts', async()=>{
  const calls=state();
  const observed=await observeRavenInventory({trustedSpecs:[spec()],now:()=>t,createEngine:stub(calls)});
  assert.equal(calls.engine_calls,1);
  assert.equal(calls.validation_calls,1);
  assert.equal(observed.inventory.length,1);
  assert.equal(observed.inventory[0].health_scope,'metadata_only');
  assert.equal(observed.inference_performed,false);
  assert.equal(observed.external_effect_authorized,false);
  const choice=decideModelRoute({
    request:{task_id:'fictional',evaluation_time_ms:t,capabilities:['text'],data_classification:'confidential',local_only:true,cloud_consent:false,cost_ceiling_usd:0},
    inventory:observed.inventory
  });
  assert.equal(choice.status,'eligible');
  assert.equal(choice.primary.model_id,'fixture-model-a');
  assert.equal(choice.inference_performed,false);
});

test('cloud metadata validation requires explicit authorization before engine creation',async()=>{
  const calls=state();
  const observed=await observeRavenInventory({
    trustedSpecs:[spec({provider_id:'openai',runtime:'cloud',credential_ready:true,retention_policy_verified:true,provider_metadata_consent:true})],
    now:()=>t,createEngine:stub(calls)
  });
  assert.equal(observed.inventory.length,0);
  assert.equal(calls.engine_calls,0);
  assert.equal(observed.holds[0].code,'CLOUD_METADATA_VALIDATION_NOT_AUTHORIZED');
});

test('cloud policy or provider metadata consent missing blocks even if cloud is enabled',async()=>{
  const calls=state();
  const observed=await observeRavenInventory({
    trustedSpecs:[spec({provider_id:'gemini',runtime:'cloud',credential_ready:true,retention_policy_verified:true})],
    allowCloudMetadataValidation:true,
    now:()=>t,createEngine:stub(calls)
  });
  assert.equal(observed.inventory.length,0);
  assert.equal(calls.engine_calls,0);
  assert.equal(observed.holds[0].code,'CLOUD_POLICY_OR_CREDENTIAL_UNVERIFIED');
});

test('unsupported provider and forged locality are rejected before validation',async()=>{
  const calls=state();
  const observed=await observeRavenInventory({
    trustedSpecs:[spec({provider_id:'unauthorized'}),spec({provider_id:'openai',runtime:'local'})],
    now:()=>t,createEngine:stub(calls)
  });
  assert.equal(observed.inventory.length,0);
  assert.equal(calls.engine_calls,0);
});

test('missing quote or latency provenance cannot become an eligible inventory entry',async()=>{
  const calls=state();
  const observed=await observeRavenInventory({
    trustedSpecs:[spec({cost_evidence_ref:''}),spec({model_id:'fixture-b',latency_evidence_ref:''})],
    now:()=>t,createEngine:stub(calls)
  });
  assert.equal(observed.inventory.length,0);
  assert.equal(calls.engine_calls,0);
});

test('validate must return matching model, metadata-only truth and receipt',async()=>{
  for(const bad of [
    {model:'other'}, {prompt_sent:true}, {inference_performed:true},
    {validation_receipt:''}, {raw_credential_returned:true}, {base44_used:true}
  ]) {
    const observed=await observeRavenInventory({
      trustedSpecs:[spec()],now:()=>t,
      createEngine:()=>({validate:async()=>reply(bad)})
    });
    assert.equal(observed.inventory.length,0);
    assert.equal(observed.holds[0].code,'MODEL_METADATA_RECEIPT_UNTRUSTED');
  }
});

test('provider errors never expose the supplied error text or secret to inventory',async()=>{
  const observed=await observeRavenInventory({
    trustedSpecs:[spec()],now:()=>t,
    createEngine:()=>({validate:async()=>{throw Error('TOKEN_DO_NOT_PUBLISH');}})
  });
  assert.equal(observed.inventory.length,0);
  assert.equal(JSON.stringify(observed).includes('TOKEN_DO_NOT_PUBLISH'),false);
});

test('duplicate model identity is refused without duplicate validation',async()=>{
  const calls=state();
  const observed=await observeRavenInventory({trustedSpecs:[spec(),spec()],now:()=>t,createEngine:stub(calls)});
  assert.equal(observed.inventory.length,1);
  assert.equal(calls.validation_calls,1);
  assert.equal(observed.holds[0].code,'DUPLICATE_MODEL');
});

test('untrusted clocks fail before opening an engine',async()=>{
  const calls=state();
  await assert.rejects(observeRavenInventory({trustedSpecs:[spec()],now:()=>NaN,createEngine:stub(calls)}),/trusted_inventory_clock_required/);
  assert.equal(calls.engine_calls,0);
});

test('freshness window rejects five-minute validation elapsed on host clock',async()=>{
  let clock=t;
  const observed=await observeRavenInventory({
    trustedSpecs:[spec()],now:()=>{const v=clock; clock+=301000; return v;},
    createEngine:()=>({validate:async()=>reply()})
  });
  assert.equal(observed.inventory.length,0);
  assert.equal(observed.holds[0].code,'METADATA_CLOCK_INVALID');
});

test('unsafe advertised capabilities cannot be invented by inventory',async()=>{
  const calls=state();
  const observed=await observeRavenInventory({
    trustedSpecs:[spec({capabilities:['text','vision']})],
    now:()=>t,createEngine:stub(calls)
  });
  assert.equal(observed.inventory.length,0);
  assert.equal(calls.engine_calls,0);
});
