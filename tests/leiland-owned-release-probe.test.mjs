import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {probeLeilandPublicOrigin,validateOwnedOrigin} from '../scripts/probe-leiland-owned-release.mjs';

const NOW=Date.parse('2026-11-20T03:00:00.000Z');
function setup(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'leiland-external-probe-'));
 const assets={
  'leiland/index.html':'<html><meta http-equiv="Content-Security-Policy"><span>CONCEPTUAL ANIMATION</span></html>',
  'leiland/style.css':'.test{color:white}',
  'leiland/brain.js':'console.log("illustration")',
  'leiland/pulse-bridge.mjs':'export const yes=true;',
  'leiland/feed.json':JSON.stringify({schema:'evercraft.leiland.public-feed.v1',status:'not_connected',published_at:null}),
  'kaidance/pulse-source.mjs':'export const PUBLIC_PULSE_SCHEMA="evercraft.kaidance.public-pulse.v1"'
 };
 for(const [file,body] of Object.entries(assets)){
  const dest=path.join(root,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,body);
 }
 const pulse={
  schema:'evercraft.kaidance.public-pulse.v1',state:'healthy',cycle_number:8,
  last_completed_cycle:new Date(NOW-60000).toISOString(),heartbeat_target_seconds:300,
  admitted_count:3,held_count:1,coverage_receipt_valid:true,field_attestation_verified:true,
  observed_at:new Date(NOW-30000).toISOString(),published_at:new Date(NOW-20000).toISOString()
 };
 const responseData={...assets,'kaidance/pulse.json':JSON.stringify(pulse)};
 const fetchImpl=async url=>{
  const key=new URL(url).pathname.slice(1);
  const body=responseData[key];
  if(body===undefined)return new Response('not found',{status:404});
  return new Response(body,{status:200});
 };
 return {root,assets,responseData,pulse,fetchImpl,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
async function withFixture(fn){
 const f=setup();try{return await fn(f)}finally{f.cleanup()}
}
test('readback validates exact deployed bytes and reports observed source attestation without claiming owned runtime',async()=>{
 await withFixture(async f=>{
  const result=await probeLeilandPublicOrigin({origin:'https://ai.evercraft.example/',publicRoot:f.root,fetchImpl:f.fetchImpl,now:NOW});
  assert.equal(result.public_https_asset_parity,'matched');
  assert.equal(result.assets_checked,6);
  assert.equal(result.heartbeat_source_state,'source_attested');
  assert.equal(result.cycle_number,8);
  assert.equal(result.inference_publisher_state,'not_connected');
  assert.equal(result.owned_runtime_identity,'not_established_by_this_probe');
  assert.equal(result.final_public_launch_authorized,false);
 });
});
test('missing public pulse explicitly holds telemetry state even while exact static assets work',async()=>{
 await withFixture(async f=>{
  delete f.responseData['kaidance/pulse.json'];
  const result=await probeLeilandPublicOrigin({origin:'https://ai.evercraft.example/',publicRoot:f.root,fetchImpl:f.fetchImpl,now:NOW});
  assert.equal(result.heartbeat_source_state,'not_connected');
  assert.equal(result.cycle_number,null);
  assert.equal(result.final_public_launch_authorized,false);
 });
});
test('tampered site source is a hard failure',async()=>{
 await withFixture(async f=>{
  f.responseData['leiland/brain.js']='attacker modified the script';
  await assert.rejects(()=>probeLeilandPublicOrigin({origin:'https://ai.evercraft.example/',publicRoot:f.root,fetchImpl:f.fetchImpl,now:NOW}),/public_asset_mismatch/);
 });
});
test('public pulse extra fields cannot leak through the acceptance probe',async()=>{
 await withFixture(async f=>{
  f.pulse.private_secret='DONT_LEAK';
  f.responseData['kaidance/pulse.json']=JSON.stringify(f.pulse);
  await assert.rejects(()=>probeLeilandPublicOrigin({origin:'https://ai.evercraft.example/',publicRoot:f.root,fetchImpl:f.fetchImpl,now:NOW}),/extra_fields/);
 });
});
test('malformed or failing non-404 public pulse is not silently treated as absent',async()=>{
 await withFixture(async f=>{
  f.responseData['kaidance/pulse.json']='{invalid-json';
  await assert.rejects(()=>probeLeilandPublicOrigin({origin:'https://ai.evercraft.example/',publicRoot:f.root,fetchImpl:f.fetchImpl,now:NOW}),/public_pulse_json_invalid/);
 });
});
test('stale or unattested pulse never becomes a verified live heartbeat',async()=>{
 await withFixture(async f=>{
  f.pulse.published_at=new Date(NOW-900000).toISOString();
  f.pulse.observed_at=new Date(NOW-900000).toISOString();
  f.pulse.last_completed_cycle=new Date(NOW-920000).toISOString();
  f.responseData['kaidance/pulse.json']=JSON.stringify(f.pulse);
  const result=await probeLeilandPublicOrigin({origin:'https://ai.evercraft.example/',publicRoot:f.root,fetchImpl:f.fetchImpl,now:NOW});
  assert.equal(result.heartbeat_source_state,'stale');
 });
});
test('rejects non-owned hosting endpoints and dirty public origins',()=>{
 for(const url of ['http://ai.evercraft.example/','https://foo.base44.app/','https://something.github.io/','https://foo.vercel.app/','https://foo.netlify.app/','https://127.0.0.1/','https://foo.example/x','https://user:secret@foo.example/']){
  assert.throws(()=>validateOwnedOrigin(url));
 }
 assert.equal(validateOwnedOrigin('https://ai.evercraft.example/'),'https://ai.evercraft.example');
});
