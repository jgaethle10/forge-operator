import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {startLeilandObservatory} from '../systemia/leiland/owned-observatory-host.mjs';
import {inspectLeilandField,FIELD_SCHEMA} from '../scripts/leiland-field-preflight.mjs';
import {APPROVAL_SCHEMA} from '../systemia/leiland/owned-pulse-publisher.mjs';

const t0=Date.parse('2026-11-20T03:00:00Z');
const iso=ms=>new Date(ms).toISOString();
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','public');
const sha='a'.repeat(40);

function pulse(){return {
 schema:'evercraft.kaidance.pulse.v1',resident:true,
 state:'healthy',cycle_number:24,last_completed_cycle:iso(t0-60000),
 observed_at:iso(t0-30000),heartbeat_target_seconds:300,
 admitted_count:5,held_count:1,coverage_receipt_valid:true,
 field_attestation:{state:'verified',receipt:'private:receipt:never-public'},
 internal_path:'/private/do-not-leak'
}}
async function fixture(run){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'leiland-signed-readiness-'));
 const published=path.join(tmp,'projections'),privateDir=path.join(tmp,'private');
 fs.mkdirSync(path.join(published,'kaidance'),{recursive:true});
 fs.mkdirSync(privateDir,{recursive:true});
 const approvalFile=path.join(privateDir,'approval.json'),
  signatureFile=path.join(privateDir,'approval.sig'),
  verifyKeyFile=path.join(privateDir,'verify.pem'),
  sourceFile=path.join(privateDir,'safe-pulse.json');
 const key=crypto.generateKeyPairSync('ed25519');
 fs.writeFileSync(verifyKeyFile,key.publicKey.export({format:'pem',type:'spki'}));
 const approval={
  schema:APPROVAL_SCHEMA,scope:'kaidance.public-pulse.publish',
  approval_ref:'approved:synthetic-field-test-001',
  source_path:sourceFile,target_path:path.join(published,'kaidance','pulse.json'),
  not_before:iso(t0-60000),expires_at:iso(t0+3600000)
 };
 const sign=()=>{
  const bytes=Buffer.from(JSON.stringify(approval));
  fs.writeFileSync(approvalFile,bytes,{mode:0o600});
  fs.writeFileSync(signatureFile,crypto.sign(null,bytes,key.privateKey).toString('base64')+'\n');
 };
 fs.writeFileSync(sourceFile,JSON.stringify(pulse()),{mode:0o600});
 sign();
 let server;
 try{
  server=await startLeilandObservatory({publicRoot:root,publicationRoot:published,releaseSha:sha});
  const args={staticRoot:root,publicationRoot:published,
   approvalFile,signatureFile,verifyKeyFile,sourceFile,
   deploymentId:'kaidance-field',expectedSha:sha,actualSha:sha,
   loopbackOrigin:server.origin,loadPulse:async id=>{
    assert.equal(id,'kaidance-field');return pulse()},now:new Date(t0)};
  await run({args,pulse,approval,sign,published,approvalFile,signatureFile,
   verifyKeyFile,sourceFile,tmp,server});
 }finally{if(server)await server.close();fs.rmSync(tmp,{recursive:true,force:true})}
}
test('field preflight validates signed permission, matching private Yard pulse, and local host without publishing',async()=>{
 await fixture(async({args,published})=>{
  const result=await inspectLeilandField(args);
  assert.equal(result.schema,FIELD_SCHEMA);
  assert.equal(result.result,'local_preflight_pass');
  assert.equal(result.source_revision,sha);
  assert.equal(result.cycle_number,24);
  assert.equal(result.signed_publication_approval_verified,true);
  assert.equal(result.publication_performed,false);
  assert.equal(result.external_https_verified,false);
  assert.equal(result.public_launch_authorized,false);
  assert.equal(result.two_external_cycles_verified,false);
  assert.equal(result.existing_public_projection_present,false);
  assert.equal(fs.existsSync(path.join(published,'kaidance','pulse.json')),false);
  assert.equal(JSON.stringify(result).includes('private:receipt'),false);
 });
});
test('an incorrect release SHA or local server identity is rejected',async()=>{
 await fixture(async({args})=>{
  await assert.rejects(()=>inspectLeilandField({...args,actualSha:'b'.repeat(40)}),/release_sha_not_pinned/);
  await assert.rejects(()=>inspectLeilandField({...args,expectedSha:'b'.repeat(40),actualSha:'b'.repeat(40)}),/local_owned_host_identity_mismatch/);
  await assert.rejects(()=>inspectLeilandField({...args,loopbackOrigin:'https://example.com/'}),/loopback_only_required/);
 });
});
test('missing, unhealthy, stale or unattested actual Yard source holds the release',async()=>{
 await fixture(async({args})=>{
  for(const data of [null,{...pulse(),state:'degraded'},
   {...pulse(),field_attestation:{state:'not_verified'}},
   {...pulse(),observed_at:iso(t0-900000)}])
   await assert.rejects(()=>inspectLeilandField({...args,loadPulse:async()=>data}));
  await assert.rejects(()=>inspectLeilandField({...args,loadPulse:async()=>{throw Error('yard_unavailable')}}),/yard_unavailable/);
  await assert.rejects(()=>inspectLeilandField({...args,loadPulse:async()=>({...pulse(),cycle_number:25})}),/signed_source_not_matched_to_live_yard/);
 });
});
test('touched signature, wrong approval scope or publicly readable source is rejected',async()=>{
 await fixture(async({args,approval,sign,approvalFile,sourceFile})=>{
  fs.appendFileSync(approvalFile,' ');
  await assert.rejects(()=>inspectLeilandField(args),/approval_signature_invalid/);
  approval.scope='unapproved.public.publish';
  sign();
  await assert.rejects(()=>inspectLeilandField(args),/approval_scope_invalid/);
  approval.scope='kaidance.public-pulse.publish';
  sign();
  fs.chmodSync(sourceFile,0o644);
  await assert.rejects(()=>inspectLeilandField(args),/source_file_permissions_invalid/);
 });
});
test('unreachable local-owned host cannot be mistaken for a deployed service',async()=>{
 await fixture(async({args})=>{
  await assert.rejects(()=>inspectLeilandField({...args,loopbackOrigin:'http://127.0.0.1:1'}),/local_owned_host_health_unverified/);
 });
});
