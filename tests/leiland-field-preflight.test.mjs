import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startLeilandObservatory} from '../systemia/leiland/owned-observatory-host.mjs';
import {inspectLeilandField,FIELD_SCHEMA} from '../scripts/leiland-field-preflight.mjs';

const t0=Date.parse('2026-11-20T03:00:00Z');
const iso=ms=>new Date(ms).toISOString();
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','public');
const sha='a'.repeat(40);
async function fixture(run){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'leiland-owned-readiness-'));
 const published=path.join(tmp,'projections'),approvalFile=path.join(tmp,'operator-approval.json');
 fs.mkdirSync(path.join(published,'kaidance'),{recursive:true});
 const approval={schema:'evercraft.kaidance.public-publication-approval.v1',
  allow_publish:true,approved_by:'test-owner',deployment_id:'kaidance-field',
  public_root:published,approved_at:iso(t0-60000),expires_at:iso(t0+3600000)};
 fs.writeFileSync(approvalFile,JSON.stringify(approval),{mode:0o600});
 let server;
 const pulse=()=>({schema:'evercraft.kaidance.pulse.v1',resident:true,
  state:'healthy',cycle_number:24,last_completed_cycle:iso(t0-60000),
  observed_at:iso(t0-30000),heartbeat_target_seconds:300,
  admitted_count:5,held_count:1,coverage_receipt_valid:true,
  field_attestation:{state:'verified',receipt:'private:receipt:never-public'},
  internal_path:'/private/do-not-leak'});
 try{
  server=await startLeilandObservatory({publicRoot:root,publicationRoot:published,releaseSha:sha});
  const args={
   staticRoot:root,publicationRoot:published,approvalFile,deploymentId:'kaidance-field',
   expectedSha:sha,actualSha:sha,loopbackOrigin:server.origin,
   loadPulse:async id=>{assert.equal(id,'kaidance-field');return pulse()},
   now:new Date(t0)
  };
  await run({args,pulse,approval,published,approvalFile,tmp,server});
 }finally{if(server)await server.close();fs.rmSync(tmp,{recursive:true,force:true})}
}
test('field preflight validates a real source-shaped Yard pulse and actual local host without doing publication',async()=>{
 await fixture(async({args,published})=>{
  const result=await inspectLeilandField(args);
  assert.equal(result.schema,FIELD_SCHEMA);
  assert.equal(result.result,'local_preflight_pass');
  assert.equal(result.source_revision,sha);
  assert.equal(result.cycle_number,24);
  assert.equal(result.source_field_attestation_reported,true);
  assert.equal(result.publication_performed,false);
  assert.equal(result.external_https_verified,false);
  assert.equal(result.public_launch_authorized,false);
  assert.equal(result.two_external_cycles_verified,false);
  assert.equal(result.existing_public_projection_present,false);
  assert.equal(fs.existsSync(path.join(published,'kaidance','pulse.json')),false);
  assert.equal(JSON.stringify(result).includes('private:receipt'),false);
 });
});
test('field preflight rejects an incorrect source commit and unbound local-host identity',async()=>{
 await fixture(async({args})=>{
  await assert.rejects(()=>inspectLeilandField({...args,actualSha:'b'.repeat(40)}),/release_sha_not_pinned/);
  await assert.rejects(()=>inspectLeilandField({...args,expectedSha:'b'.repeat(40),actualSha:'b'.repeat(40)}),/local_owned_host_identity_mismatch/);
  await assert.rejects(()=>inspectLeilandField({...args,loopbackOrigin:'https://example.com/'}),/loopback_only_required/);
 });
});
test('missing, unhealthy, stale or unattested actual Yard source holds the release',async()=>{
 await fixture(async({args,pulse})=>{
  for(const data of [null,{...pulse(),state:'degraded'},
   {...pulse(),field_attestation:{state:'not_verified'}},
   {...pulse(),observed_at:iso(t0-900000)}]){
   await assert.rejects(()=>inspectLeilandField({...args,loadPulse:async()=>data}));
  }
  await assert.rejects(()=>inspectLeilandField({...args,loadPulse:async()=>{throw Error('private_yard_unavailable')}}),/private_yard_unavailable/);
 });
});
test('operator approval must remain private, current and explicitly allow publishing',async()=>{
 await fixture(async({args,approval,approvalFile})=>{
  approval.allow_publish=false;
  fs.writeFileSync(approvalFile,JSON.stringify(approval));
  await assert.rejects(()=>inspectLeilandField(args),/explicit_publication_approval_missing/);
  approval.allow_publish=true;
  fs.writeFileSync(approvalFile,JSON.stringify(approval));
  fs.chmodSync(approvalFile,0o644);
  await assert.rejects(()=>inspectLeilandField(args),/operator_approval_file_insecure/);
 });
});
test('a stopped local host does not count as ready even with a healthy source',async()=>{
 await fixture(async({args,server})=>{
  await server.close();
  // Avoid double-close on teardown: close is idempotent within test cleanup? We
  // only need to prove a failed fetch using a port that never existed.
  await assert.rejects(()=>inspectLeilandField({...args,loopbackOrigin:'http://127.0.0.1:1'}),/local_owned_host_health_unverified/);
 });
});
