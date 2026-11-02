import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inspectYardBrokerDeployments } from './broker-deployment-doctor.mjs';

const sha = v=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
const seal = body=>({...body,receipt_hash:sha(body)});
const origin='https://remote-broker.example.test';
const instanceId='remote_broker_'+'a'.repeat(24);
function setup(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-broker-claim-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  return dir;
}
function save(dir,changes={}){
  const receipt=seal({
    schema:'evercraft.yard.deployment-receipt.v1',
    workload_class:'systemia.remote-capacity-broker.v1',
    capacity_node_id:'public-relay-node',
  });
  const publicRoute=seal({
    schema:'evercraft.yard.public-route-receipt.v1',
    scope:'public_https',
    verified:true,
    origin,
    health_path:'/v1/remote/health',
    verified_at:'2026-10-25T20:30:00Z',
  });
  const row={
    deployment_id:'example-remote-broker',
    state:'ready',
    receipt,
    result:{service_id:'service-proof',instance_id:instanceId,
      secure_envelope_schema:'evercraft.secure-envelope.v1'},
    public_route:publicRoute,
    allocator_token:'PRIVATE_CANARY_TOKEN_NEVER_DISCLOSE',
    extra:{identity_private_key:'PRIVATE_CANARY_KEY_NEVER_DISCLOSE'},
    ...changes,
  };
  fs.writeFileSync(path.join(dir,'example-remote-broker.json'),JSON.stringify(row),{mode:0o600});
  return row;
}
const fakeHealth=()=>({
  ok:true,schema:'evercraft.remote-capacity.broker-health.v1',
  service:'remote-capacity-broker',runtime:'Evercraft Compute',
  instance_id:instanceId,deployment_receipt_bound:true,
  secure_envelope_schema:'evercraft.secure-envelope.v1',
});

test('missing state is a hold and never attempts a network call',async t=>{
  const dir=setup(t);
  let count=0;
  const r=await inspectYardBrokerDeployments({yardState:path.join(dir,'missing'),
    fetchImpl:()=>{count++;throw Error('network not allowed')}});
  assert.equal(r.result,'yard_state_unavailable');
  assert.equal(r.broker_candidate_count,0);
  assert.equal(r.remote_access_enabled,false);
  assert.equal(count,0);
});

test('local Yard record is only a self-reported candidate; never trust it as authenticated',async t=>{
  const dir=setup(t);save(dir);
  let count=0;
  const r=await inspectYardBrokerDeployments({yardState:dir,
    fetchImpl:()=>{count++;throw Error('network not allowed')}});
  assert.equal(r.result,'candidates_found');
  assert.equal(r.broker_candidate_count,1);
  assert.equal(r.candidates[0].locally_recorded_ready,true);
  assert.equal(r.candidates[0].locally_recorded_public_https,true);
  assert.equal(r.candidates[0].live_public_health_consistency,'local_record_claim_only');
  assert.equal(r.independent_yard_authentication_verified,false);
  assert.equal(r.remote_access_enabled,false);
  assert.equal(r.read_only,true);
  assert.equal(count,0);
  assert.doesNotMatch(JSON.stringify(r),/PRIVATE_CANARY|example\\.test|sha256|service-proof/);
});

test('allowlisted live HTTPS health can match record without authorizing remote access',async t=>{
  const dir=setup(t),row=save(dir);let calls=0;
  const r=await inspectYardBrokerDeployments({
    yardState:dir,allowedOrigins:[origin],verifyPublicHealth:true,
    fetchImpl:async (url,opt)=>{
      calls++;
      assert.equal(url,origin+'/v1/remote/health');
      assert.equal(opt.method,'GET');
      assert.equal(opt.redirect,'error');
      return {status:200,json:async()=>({
        ...fakeHealth(),deployment_receipt_ref:row.receipt.receipt_hash,
      })};
    },
  });
  assert.equal(calls,1);
  assert.equal(r.candidates[0].live_public_health_consistency,'health_matches_local_yard_record');
  assert.equal(r.independent_yard_authentication_verified,false);
  assert.equal(r.remote_access_enabled,false);
});

test('wrong approved origin, tampered receipt and broker identity fail closed',async t=>{
  const dir=setup(t);
  const row=save(dir);
  let calls=0;
  const blocked=await inspectYardBrokerDeployments({
    yardState:dir,allowedOrigins:['https://other.example.test'],
    verifyPublicHealth:true,fetchImpl:async()=>{calls++;throw Error('must not fetch')},
  });
  assert.equal(blocked.candidates[0].live_public_health_consistency,'denied_or_invalid');
  assert.equal(calls,0);
  save(dir,{receipt:{...row.receipt,workload_class:'systemia.remote-capacity-broker.v1',
    capacity_node_id:'tampered-node'}});
  const tampered=await inspectYardBrokerDeployments({yardState:dir});
  assert.equal(tampered.candidates[0].locally_recorded_ready,false);
  assert.equal(tampered.candidates[0].locally_recorded_public_https,false);
  assert.equal(tampered.remote_access_enabled,false);
});

test('no symlink discovery and no non-JSON or secret files inspected',async t=>{
  const root=setup(t),other=setup(t);
  save(other);
  const link=path.join(root,'yard-symlink');
  fs.symlinkSync(other,link);
  await assert.rejects(inspectYardBrokerDeployments({yardState:link}),
    /yard_state_directory_invalid/);
  fs.writeFileSync(path.join(root,'.lease-secrets.json'),JSON.stringify({token:'CANARY_SECRET'}));
  fs.writeFileSync(path.join(root,'unrelated.txt'),'DO_NOT_PARSE');
  const r=await inspectYardBrokerDeployments({yardState:root});
  assert.equal(r.broker_candidate_count,0);
  assert.doesNotMatch(JSON.stringify(r),/CANARY_SECRET|DO_NOT_PARSE/);
});
