import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {publishApprovedKaidancePulse} from '../systemia/collider/public-publisher.mjs';
import {startLeilandObservatory} from '../systemia/leiland/owned-observatory-host.mjs';
import {probeLeilandPublicOrigin} from '../scripts/probe-leiland-owned-release.mjs';
import {verifyPublicKaidanceReadback} from '../systemia/collider/public-readback.mjs';

const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','public');
const t0=Date.parse('2026-11-20T03:00:00Z');
const iso=ms=>new Date(ms).toISOString();

function authenticShape(cycle,now){
 return {
  schema:'evercraft.kaidance.pulse.v1',
  resident:true,state:'healthy',cycle_number:cycle,
  last_completed_cycle:iso(now-50000),observed_at:iso(now-20000),
  heartbeat_target_seconds:300,coverage_receipt_valid:true,
  admitted_count:4,held_count:1,
  field_attestation:{
   state:'verified',receipt:'private:field:receipt-not-for-public',verified_at:iso(now-15000)
  },last_cycle_key:'private:cycle-key',compute_node_id:'private:node-id',
  deployment_receipt:'private:deployment-receipt'
 };
}
async function fixture(fn){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'leiland-kaidance-pipeline-'));
 const output=path.join(base,'approved-public');
 fs.mkdirSync(path.join(output,'kaidance'),{recursive:true,mode:0o700});
 const approvalFile=path.join(base,'private-operator-approval.json');
 fs.writeFileSync(approvalFile,JSON.stringify({
  schema:'evercraft.kaidance.public-publication-approval.v1',
  allow_publish:true,approved_by:'isolated-test-only',
  deployment_id:'test-resident',public_root:output,
  approved_at:iso(t0-60000),expires_at:iso(t0+24*3600000)
 }),{mode:0o600});
 let server;
 try{
  server=await startLeilandObservatory({publicRoot:sourceRoot,publicationRoot:output,port:0});
  const readbackFetch=async(url,options={})=>{
   const target=new URL(url);
   return fetch(server.origin+target.pathname+target.search,options);
  };
  await fn({output,approvalFile,url:server.origin,readbackFetch});
 }finally{
  if(server)await server.close();
  fs.rmSync(base,{recursive:true,force:true});
 }
}

test('existing approved KAIDANCE publisher drives Leiland without another mission or heartbeat engine',async()=>{
 await fixture(async({output,approvalFile,url,readbackFetch})=>{
  let privateReads=0;
  const publish=async(cycle,when)=>{
   const receipt=await publishApprovedKaidancePulse({
    publicRoot:output,approvalFile,deploymentId:'test-resident',
    now:new Date(when),
    getPulse:async id=>{
     assert.equal(id,'test-resident');
     privateReads++;
     return authenticShape(cycle,when);
    }
   });
   assert.equal(receipt.status,'published');
   assert.equal(receipt.target,'kaidance/pulse.json');
   return receipt;
  };
  const read=async(when)=>{
   const response=await fetch(url+'/kaidance/pulse.json',{cache:'no-store'});
   assert.equal(response.status,200);
   assert.match(response.headers.get('cache-control'),/no-store/);
   const publicPulse=await response.json();
   const ownedHttps=await probeLeilandPublicOrigin({
    origin:'https://field-proof.evercraft.example/',publicRoot:sourceRoot,fetchImpl:readbackFetch,now:when
   });
   assert.equal(ownedHttps.public_https_asset_parity,'matched');
   assert.equal(ownedHttps.heartbeat_source_state,'source_attested');
   assert.equal(ownedHttps.inference_publisher_state,'not_connected');
   assert.equal(ownedHttps.final_public_launch_authorized,false);
   const independent=await verifyPublicKaidanceReadback({
    url:'https://field-proof.evercraft.example/kaidance/pulse.json',
    fetchImpl:readbackFetch,now:when
   });
   assert.equal(independent.status,'verified');
   return {publicPulse,ownedHttps,independent};
  };

  const firstReceipt=await publish(21,t0);
  const first=await read(t0);
  assert.equal(first.publicPulse.cycle_number,21);
  assert.equal(first.independent.cycle_number,21);
  assert.equal(first.ownedHttps.cycle_number,21);

  const next=t0+300000;
  const secondReceipt=await publish(22,next);
  const second=await read(next);
  assert.equal(second.publicPulse.cycle_number,22);
  assert.ok(Date.parse(second.publicPulse.observed_at)>Date.parse(first.publicPulse.observed_at));
  assert.notEqual(secondReceipt.projection_sha256,firstReceipt.projection_sha256);
  assert.equal(privateReads,2,'private source is read only for two authorized publications');
  const serialized=JSON.stringify(second.publicPulse);
  for(const secret of ['private:node-id','private:field:receipt-not-for-public',
   'private:deployment-receipt','private:cycle-key'])
   assert.equal(serialized.includes(secret),false,'private runtime leaked '+secret);
 });
});

test('withdrawn approval and source failure never create a new externally verifiable pulse',async()=>{
 await fixture(async({output,approvalFile,url,readbackFetch})=>{
  const pulseAt=async now=>publishApprovedKaidancePulse({
   publicRoot:output,approvalFile,deploymentId:'test-resident',now:new Date(now),
   getPulse:async()=>authenticShape(5,now)
  });
  await pulseAt(t0);
  const approval=JSON.parse(fs.readFileSync(approvalFile,'utf8'));
  approval.allow_publish=false;
  fs.writeFileSync(approvalFile,JSON.stringify(approval),{mode:0o600});
  await assert.rejects(()=>pulseAt(t0+300000),/explicit_publication_approval_missing/);
  const old=await (await fetch(url+'/kaidance/pulse.json')).json();
  assert.equal(old.cycle_number,5);
  const probed=await probeLeilandPublicOrigin({
   origin:'https://field-proof.evercraft.example/',publicRoot:sourceRoot,
   fetchImpl:readbackFetch,now:t0+900000
  });
  assert.equal(probed.heartbeat_source_state,'stale');
  assert.equal(probed.final_public_launch_authorized,false);
  fs.unlinkSync(path.join(output,'kaidance','pulse.json'));
  const absent=await fetch(url+'/kaidance/pulse.json');
  assert.equal(absent.status,404);
  const held=await probeLeilandPublicOrigin({
   origin:'https://field-proof.evercraft.example/',publicRoot:sourceRoot,
   fetchImpl:readbackFetch,now:t0+900000
  });
  assert.equal(held.heartbeat_source_state,'not_connected');
  // Staging a public feed is never an inference or payment source.
  assert.equal(held.inference_publisher_state,'not_connected');
 });
});
