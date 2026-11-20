import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyPrivatePulseForPublication} from '../systemia/collider/public-publisher.mjs';
import {publishOwnedKaidancePulse,APPROVAL_SCHEMA} from '../systemia/leiland/owned-pulse-publisher.mjs';
import {startLeilandObservatory} from '../systemia/leiland/owned-observatory-host.mjs';
import {probeLeilandPublicOrigin} from '../scripts/probe-leiland-owned-release.mjs';
import {verifyPublicKaidanceReadback} from '../systemia/collider/public-readback.mjs';

const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','public');
const t0=Date.parse('2026-11-20T03:00:00Z');
const iso=ms=>new Date(ms).toISOString();

function sourcePulse(cycle,now){
 return {
  schema:'evercraft.kaidance.pulse.v1',resident:true,
  state:'healthy',cycle_number:cycle,
  last_completed_cycle:iso(now-50000),observed_at:iso(now-20000),
  heartbeat_target_seconds:300,coverage_receipt_valid:true,
  admitted_count:4,held_count:1,
  field_attestation:{state:'verified',receipt:'private:field:receipt-not-for-public',
   verified_at:iso(now-15000)},
  last_cycle_key:'private:cycle-key',compute_node_id:'private:node-id',
  deployment_receipt:'private:deployment-receipt'
 };
}
async function fixture(fn){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'leiland-signed-field-pipeline-'));
 const publicRoot=path.join(base,'approved-public'),privateRoot=path.join(base,'operator-only');
 const receiptDir=path.join(privateRoot,'receipts');
 fs.mkdirSync(path.join(publicRoot,'kaidance'),{recursive:true});
 fs.mkdirSync(receiptDir,{recursive:true,mode:0o700});
 const sourceFile=path.join(privateRoot,'approved-safe-pulse.json'),
  approvalFile=path.join(privateRoot,'approval.json'),
  signatureFile=path.join(privateRoot,'approval.sig'),
  verifyKeyFile=path.join(privateRoot,'operator.pub.pem');
 const key=crypto.generateKeyPairSync('ed25519');
 fs.writeFileSync(verifyKeyFile,key.publicKey.export({type:'spki',format:'pem'}));
 const approval={
  schema:APPROVAL_SCHEMA,scope:'kaidance.public-pulse.publish',
  approval_ref:'approved:synthetic-test-only',
  source_path:sourceFile,target_path:path.join(publicRoot,'kaidance','pulse.json'),
  not_before:iso(t0-60000),expires_at:iso(t0+3600000)
 };
 const sign=()=>{
  const bytes=Buffer.from(JSON.stringify(approval));
  fs.writeFileSync(approvalFile,bytes,{mode:0o600});
  fs.writeFileSync(signatureFile,crypto.sign(null,bytes,key.privateKey).toString('base64')+'\n');
 };
 sign();
 let host;
 try{
  host=await startLeilandObservatory({publicRoot:sourceRoot,publicationRoot:publicRoot,port:0});
  const externalFetch=async(url,options={})=>{
   const target=new URL(url);
   return fetch(host.origin+target.pathname+target.search,options);
  };
  await fn({publicRoot,privateRoot,receiptDir,sourceFile,approvalFile,signatureFile,
   verifyKeyFile,approval,sign,host,externalFetch});
 }finally{
  if(host)await host.close();
  fs.rmSync(base,{recursive:true,force:true});
 }
}
test('signed, field-gated KAIDANCE projection reaches Leiland and both public readbacks for consecutive cycles',async()=>{
 await fixture(async f=>{
  const publish=(cycle,now)=>{
   const pulse=sourcePulse(cycle,now);
   // The signed file adapter never establishes field truth by itself.
   // Require the separate private source verification before writing its input.
   assert.equal(verifyPrivatePulseForPublication(pulse,{now:new Date(now)}).cycle_number,cycle);
   fs.writeFileSync(f.sourceFile,JSON.stringify(pulse),{mode:0o600});
   return publishOwnedKaidancePulse({
    sourceFile:f.sourceFile,ownedPublicRoot:f.publicRoot,
    approvalFile:f.approvalFile,signatureFile:f.signatureFile,
    verifyKeyFile:f.verifyKeyFile,receiptDir:f.receiptDir,now:new Date(now)
   });
  };
  const check=async(now)=>{
   const res=await fetch(f.host.origin+'/kaidance/pulse.json');
   assert.equal(res.status,200);
   const projected=await res.json();
   const leiland=await probeLeilandPublicOrigin({
    origin:'https://isolated.example/',publicRoot:sourceRoot,
    fetchImpl:f.externalFetch,now
   });
   assert.equal(leiland.public_https_asset_parity,'matched');
   assert.equal(leiland.heartbeat_source_state,'source_attested');
   assert.equal(leiland.inference_publisher_state,'not_connected');
   assert.equal(leiland.final_public_launch_authorized,false);
   const readback=await verifyPublicKaidanceReadback({
    url:'https://isolated.example/kaidance/pulse.json',
    fetchImpl:f.externalFetch,now
   });
   assert.equal(readback.status,'verified');
   return {projected,leiland,readback};
  };
  const firstReceipt=publish(31,t0);
  const first=await check(t0);
  assert.equal(first.projected.cycle_number,31);
  assert.equal(first.readback.cycle_number,31);
  const next=t0+300000;
  const secondReceipt=publish(32,next);
  const second=await check(next);
  assert.equal(second.projected.cycle_number,32);
  assert.notEqual(firstReceipt.public_sha256,secondReceipt.public_sha256);
  assert.equal(firstReceipt.source_attested,true);
  assert.equal(firstReceipt.external_https_verified,false);
  assert.equal(fs.readdirSync(f.receiptDir).length,2);
  const raw=JSON.stringify(second.projected);
  for(const privateValue of ['private:node-id','private:cycle-key',
   'private:field:receipt-not-for-public','private:deployment-receipt'])
   assert.equal(raw.includes(privateValue),false);
 });
});
test('revoked signed approval, stale cycle and removed public file all fail closed',async()=>{
 await fixture(async f=>{
  const first=sourcePulse(5,t0);
  fs.writeFileSync(f.sourceFile,JSON.stringify(first),{mode:0o600});
  const options={sourceFile:f.sourceFile,ownedPublicRoot:f.publicRoot,
   approvalFile:f.approvalFile,signatureFile:f.signatureFile,
   verifyKeyFile:f.verifyKeyFile,receiptDir:f.receiptDir,now:new Date(t0)};
  publishOwnedKaidancePulse(options);
  const original=fs.readFileSync(f.approvalFile);
  fs.writeFileSync(f.approvalFile,Buffer.concat([original,Buffer.from(' ')]));
  assert.throws(()=>publishOwnedKaidancePulse({
   ...options,now:new Date(t0+300000)
  }),/approval_signature_invalid/);
  assert.equal(JSON.parse(fs.readFileSync(f.approvalFile,'utf8')).scope,
   'kaidance.public-pulse.publish');
  const stale=await probeLeilandPublicOrigin({
   origin:'https://isolated.example/',publicRoot:sourceRoot,
   fetchImpl:f.externalFetch,now:t0+900000
  });
  assert.equal(stale.heartbeat_source_state,'stale');
  fs.unlinkSync(path.join(f.publicRoot,'kaidance','pulse.json'));
  assert.equal((await fetch(f.host.origin+'/kaidance/pulse.json')).status,404);
  const absent=await probeLeilandPublicOrigin({
   origin:'https://isolated.example/',publicRoot:sourceRoot,
   fetchImpl:f.externalFetch,now:t0+900000
  });
  assert.equal(absent.heartbeat_source_state,'not_connected');
  assert.equal(absent.final_public_launch_authorized,false);
 });
});
