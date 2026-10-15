import test from 'node:test';
import assert from 'node:assert/strict';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';

async function inspect(options={}){
  let purchaseCalls=0;
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,
    purchaseIntentFetch:async()=>{purchaseCalls++;throw Error('no checkout should be attempted by GET health')},
    ...options,
  });
  try{
    const res=await fetch(runtime.url+'/health');
    assert.equal(res.status,200);
    return {health:await res.json(),purchaseCalls};
  }finally{await runtime.close()}
}
test('default checkout backend honestly discloses temporary Base44 dependency',async()=>{
  const {health,purchaseCalls}=await inspect();
  assert.equal(health.ok,true);
  assert.equal(health.base44_transport_enabled,false);
  assert.equal(health.base44_transport_scope,'mcp_directory_connections_only');
  assert.equal(health.checkout_intent_transport_state,'legacy_provider_hosted');
  assert.equal(health.checkout_intent_legacy_provider_dependency_active,true);
  assert.equal(health.checkout_intent_owned_transport_verified,false);
  assert.equal(purchaseCalls,0);
  assert.equal(JSON.stringify(health).includes('6a7adc9666bfd8c5c2fb4069'),false);
});
test('configured custom HTTPS backend is not automatically treated as owned or verified',async()=>{
  const {health,purchaseCalls}=await inspect({purchaseIntentUrl:'https://payments.example.test/intents'});
  assert.equal(health.checkout_intent_transport_state,'configured_backend_unverified');
  assert.equal(health.checkout_intent_legacy_provider_dependency_active,false);
  assert.equal(health.checkout_intent_owned_transport_verified,false);
  assert.equal(purchaseCalls,0);
});
test('legacy nested subdomain is reported as legacy',async()=>{
 const {health}=await inspect({purchaseIntentUrl:'https://sub.base44.app/intents'});
 assert.equal(health.checkout_intent_legacy_provider_dependency_active,true);
});
