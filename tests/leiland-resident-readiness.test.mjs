import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectLeilandResident,READINESS_SCHEMA} from '../scripts/leiland-resident-readiness.mjs';
import {startLeilandObservatory} from '../systemia/leiland/owned-observatory-host.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
async function withLocalHost(callback,{releaseSha=sha}={}){
 const pub=await fs.mkdtemp(path.join(os.tmpdir(),'leiland-readiness-test-'));
 let app;
 try{
  app=await startLeilandObservatory({
   publicRoot:path.join(repo,'public'),publicationRoot:pub,releaseSha,port:0
  });
  await callback({app,publicationRoot:pub,port:Number(new URL(app.origin).port)});
 }finally{if(app)await app.close();await fs.rm(pub,{recursive:true,force:true})}
}
test('readiness identifies the real resident locally without claiming public approval',async()=>{
 await withLocalHost(async({port})=>{
  const result=await inspectLeilandResident({checkout:repo,expectedSha:sha,port,env:{}});
  assert.equal(result.schema,READINESS_SCHEMA);
  assert.equal(result.systemia_resident_registered,true);
  assert.equal(result.shell_bindings,'not_visible_in_this_shell');
  assert.equal(result.local_resident,'local_loopback_source_matched');
  assert.equal(result.local_static_assets_checked,1);
  assert.equal(result.public_pulse_state,'public_projection_absent');
  assert.equal(result.public_inference_feed_state,'not_connected');
  assert.equal(result.suggested_next_gate,'verify_private_yard_pulse_and_signed_publication_approval');
  for(const key of ['private_yard_source_verified','signed_publisher_approval_verified',
    'two_real_cycles_independently_verified','owned_edge_tls_verified',
    'public_launch_authorized','private_inference_verified'])assert.equal(result[key],false,key);
  assert.equal(JSON.stringify(result).includes(repo),false,'Never expose local filesystem paths');
 });
});
test('unreachable resident results in a precise hold, not a fabricated active service',async()=>{
 const result=await inspectLeilandResident({
  checkout:repo,expectedSha:sha,env:{},
  fetchImpl:async()=>{throw Error('no-local-server')}
 });
 assert.equal(result.local_resident,'not_listening_or_unreadable');
 assert.equal(result.public_pulse_state,'not_evaluated');
 assert.equal(result.public_inference_feed_state,'not_evaluated');
 assert.equal(result.suggested_next_gate,'verify_existing_systemia_resident_admission_and_bindings');
 assert.equal(result.public_launch_authorized,false);
});
test('mismatched release is denied before network probing',async()=>{
 await assert.rejects(()=>inspectLeilandResident({
  checkout:repo,expectedSha:'0'.repeat(40),
  fetchImpl:async()=>{throw Error('should_never_fetch')}
 }),/release_sha_differs_from_operator_pin/);
 await assert.rejects(()=>inspectLeilandResident({checkout:repo,expectedSha:'not-a-sha'}),/operator_pinned_sha_required/);
});
test('a local listener running another revision cannot be accepted',async()=>{
 await withLocalHost(async({port})=>{
  const result=await inspectLeilandResident({checkout:repo,expectedSha:sha,port,env:{}});
  assert.equal(result.local_resident,'local_release_or_identity_mismatch');
  assert.equal(result.local_static_assets_checked,0);
  assert.equal(result.suggested_next_gate,'reconcile_local_resident_source_and_health');
 },{releaseSha:'a'.repeat(40)});
});
test('only public projected pulse can change the local status; private attestation stays unverified',async()=>{
 await withLocalHost(async({port,publicationRoot})=>{
  const now=new Date();
  await fs.mkdir(path.join(publicationRoot,'kaidance'));
  const target=path.join(publicationRoot,'kaidance','pulse.json');
  const pulse={
   schema:'evercraft.kaidance.public-pulse.v1',state:'healthy',cycle_number:18,
   last_completed_cycle:now.toISOString(),heartbeat_target_seconds:300,
   admitted_count:2,held_count:1,
   coverage_receipt_valid:true,field_attestation_verified:true,
   observed_at:now.toISOString(),published_at:now.toISOString()
  };
  await fs.writeFile(target,JSON.stringify(pulse));
  const result=await inspectLeilandResident({
   checkout:repo,expectedSha:sha,port,env:{},now:now.getTime()
  });
  assert.equal(result.public_pulse_state,'source_reported_attested');
  assert.equal(result.public_cycle_number,18);
  assert.equal(result.signed_publisher_approval_verified,false);
  assert.equal(result.private_yard_source_verified,false);
  assert.equal(result.two_real_cycles_independently_verified,false);
  assert.equal(result.public_launch_authorized,false);
  await fs.writeFile(target,JSON.stringify({...pulse,customer_email:'do-not-expose'}));
  const bad=await inspectLeilandResident({checkout:repo,expectedSha:sha,port,env:{}});
  assert.equal(bad.public_pulse_state,'public_projection_unreadable');
  assert.equal(bad.public_cycle_number,null);
 });
});
test('current terminal missing environment is never confused with supervisor not configured',async()=>{
 await withLocalHost(async({port,publicationRoot})=>{
  const env={
   LEILAND_STATIC_PUBLIC_ROOT:path.join(repo,'public'),
   LEILAND_RELEASE_SHA:sha,
   LEILAND_PUBLICATION_ROOT:publicationRoot
  };
  const good=await inspectLeilandResident({checkout:repo,expectedSha:sha,port,env});
  assert.equal(good.shell_bindings,'all_present_in_this_process');
  assert.equal(good.this_shell_binding_matches_checkout,true);
  assert.equal(good.this_shell_publication_root_observed,true);
  const outside=await inspectLeilandResident({checkout:repo,expectedSha:sha,port,env:{
   ...env,LEILAND_STATIC_PUBLIC_ROOT:'/different/install/public'
  }});
  assert.equal(outside.this_shell_binding_matches_checkout,false);
  assert.equal(JSON.stringify(outside).includes('/different'),false);
 });
});
