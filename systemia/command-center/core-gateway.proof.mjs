#!/usr/bin/env node
import assert from 'node:assert/strict';
import { EvercraftSystemiaCoreGateway, startSystemiaCoreGateway } from './core-gateway.mjs';

const authenticated=async(ctx)=>
  String(ctx?.headers?.authorization||'')==='Bearer proof-session'
    ?{subject_ref:'proof-user',role:'admin'}
    :null;

const unbound=new EvercraftSystemiaCoreGateway({identityResolver:authenticated});
assert.equal(unbound.health().machine_commerce_delegate_bound,false);
assert.equal(unbound.health().source_platform_dependency,false);

const server=await startSystemiaCoreGateway({gateway:unbound});
try{
  let response=await fetch(server.url+'/?view=identity');
  assert.equal(response.status,401);

  response=await fetch(server.url+'/?view=identity',{headers:{authorization:'Bearer proof-session'}});
  assert.equal(response.status,200);
  let body=await response.json();
  assert.equal(body.state,'owned_runtime_candidate');
  assert.equal(body.dependencies.machine_commerce,'owned_delegate_required');
  assert.equal(body.dependencies.upstream_gateway,null);
  assert.equal(body.invariants.discovery_is_not_authorization,true);
  assert.equal(body.invariants.payment_requires_explicit_confirmation,true);
  assert.equal(body.invariants.exact_output_required_before_release_claims,true);

  response=await fetch(server.url+'/?view=catalog',{headers:{authorization:'Bearer proof-session'}});
  assert.equal(response.status,503);
  body=await response.json();
  assert.equal(body.error,'machine_commerce_owned_upstream_not_bound');
  assert.equal(body.payment_created,false);
  assert.equal(body.external_action_taken,false);
}finally{ await server.close(); }

let delegated=0;
const bound=new EvercraftSystemiaCoreGateway({
  identityResolver:authenticated,
  machineCommerceDelegate:async({intent,view})=>{
    delegated+=1;
    return {ok:true,view,intent:intent||null,offer_count:3,payment_created:false};
  }
});
const boundServer=await startSystemiaCoreGateway({gateway:bound});
try{
  let response=await fetch(boundServer.url+'/?intent=help%20me%20find%20software',{
    headers:{authorization:'Bearer proof-session'}
  });
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.state,'owned_upstream');
  assert.equal(body.source,'owned_machine_commerce_delegate');
  assert.equal(body.intent,'help me find software');
  assert.equal(body.offer_count,3);
  assert.equal(body.payment_created,false);
  assert.equal(delegated,1);

  response=await fetch(boundServer.url+'/?view=unknown',{headers:{authorization:'Bearer proof-session'}});
  assert.equal(response.status,400);

  const identity=await fetch(boundServer.url+'/?view=identity',{headers:{authorization:'Bearer proof-session'}}).then(r=>r.json());
  assert.equal(JSON.stringify(identity).includes('base44.app'),false);
}finally{ await boundServer.close(); }

console.log(JSON.stringify({
  schema:'evercraft.systemia-core.gateway-proof.v1',
  status:'pass',
  authentication_required:true,
  identity_view_owned:true,
  machine_commerce_unbound_fails_closed:true,
  owned_machine_commerce_delegate_supported:true,
  authority_invariants_preserved:true,
  source_platform_dependency:false,
  real_payment_created:false,
  traffic_cutover:false
}));
