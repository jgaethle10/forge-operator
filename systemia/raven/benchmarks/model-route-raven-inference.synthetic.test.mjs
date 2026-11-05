import test from 'node:test';
import assert from 'node:assert/strict';
import { createInferenceEngine } from '../inference-gateway.mjs';
import { decideModelRoute } from './model-route-policy.candidate.mjs';

// All provider outputs below are deterministic STUBS. No external inference, no cloud calls,
// no credential vault use. This does not constitute a production Saban or Systemia run.
const NOW = 1762300000000;
const routeRequest = overrides => ({
  task_id:'SYNTHETIC-RAVEN-001',
  evaluation_time_ms:NOW,
  capabilities:['text'],
  data_classification:'confidential',
  local_only:true,
  cloud_consent:false,
  cost_ceiling_usd:0,
  ...overrides
});
const installedLocal = (model_id='fixture-a') => ({
  provider_id:'ollama',
  model_id,
  runtime:'local',
  configured:true,
  healthy:true,
  metadata_checked:true,
  validated_at_ms:NOW,
  capabilities:['text'],
  cost_estimate_kind:'quoted',
  estimated_cost_usd:0,
  latency_ms:10
});

test('policy selects only a metadata-checked local route before synthetic Raven engine invocation', async () => {
  const decision=decideModelRoute({request:routeRequest(),inventory:[installedLocal()]});
  assert.equal(decision.status,'eligible');
  assert.equal(decision.primary.provider_id,'ollama');
  assert.equal(decision.inference_performed,false);
  assert.equal(decision.external_effect_authorized,false);
  let intercepted=0;
  const engine=createInferenceEngine({
    provider:decision.primary.provider_id,
    model:decision.primary.model_id,
    now:()=>new Date(NOW),
    fetchImpl:async (url, init) => {
      intercepted++;
      assert.equal(url,'http://127.0.0.1:11434/api/generate');
      assert.equal(init.method,'POST');
      assert.equal(JSON.parse(init.body).model,'fixture-a');
      return {
        ok:true,
        status:200,
        json:async()=>({response:'SYNTHETIC OUTPUT ONLY',model:'fixture-a'})
      };
    }
  });
  assert.equal(intercepted,0);
  const response=await engine.infer({request_id:'dry-run-001',role:'analysis',input:'fictional test task'});
  assert.equal(intercepted,1);
  assert.equal(response.status,'completed');
  assert.equal(response.text,'SYNTHETIC OUTPUT ONLY');
  assert.equal(response.provider,'ollama');
  assert.equal(response.model,'fixture-a');
  assert.equal(response.receipt.request_id,'dry-run-001');
  assert.equal(response.receipt.external_side_effects_authorized,false);
  assert.match(response.provider_receipt,/^sha256:[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(response).includes('api_secret'),false);
});

test('held route does not instantiate the engine or contact a provider', () => {
  const decision=decideModelRoute({
    request:routeRequest({data_classification:'confidential',local_only:true,cloud_consent:true}),
    inventory:[{...installedLocal(),provider_id:'openai',runtime:'cloud',credential_ready:true,retention_policy_verified:true}]
  });
  assert.equal(decision.status,'held');
  assert.equal(decision.primary,null);
  assert.equal(decision.inference_performed,false);
});

test('two eligible distinct local models are routes only until separate calls obtain receipts', async () => {
  const decision=decideModelRoute({request:routeRequest({second_opinion_requested:true}),inventory:[installedLocal('fixture-b'),installedLocal('fixture-a')]});
  assert.equal(decision.status,'eligible');
  assert.equal(decision.primary.model_id,'fixture-a');
  assert.equal(decision.secondary.model_id,'fixture-b');
  assert.equal(decision.inference_performed,false);
  const receipts=[];
  for (const [i,route] of [decision.primary,decision.secondary].entries()) {
    const engine=createInferenceEngine({
      provider:route.provider_id,model:route.model_id,now:()=>new Date(NOW+i*1000),
      fetchImpl:async (_url,init)=>({
        ok:true,status:200,
        json:async()=>({response:'SYNTHETIC RESPONSE '+i,model:JSON.parse(init.body).model})
      })
    });
    const result=await engine.infer({request_id:'synthetic-opinion-'+i,role:'test',input:'fictional test task'});
    receipts.push(result.receipt);
  }
  assert.notEqual(receipts[0].request_id,receipts[1].request_id);
  assert.notEqual(receipts[0].model,receipts[1].model);
  assert.equal(receipts.every(x=>x.external_side_effects_authorized===false),true);
});
