import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {buildServiceContinuityRelease} from '../scripts/build-eps-havenly-portable-release.mjs';
import {probeServiceContinuity} from '../scripts/probe-eps-havenly-owned-service.mjs';
test('portable EPS/Havenly bundle includes source files and honest SHA receipts',()=>{
 const output=path.join(process.cwd(),'artifacts','.test-eps-havenly-'+process.pid);
 try{
  const receipt=buildServiceContinuityRelease({output,release:'proof-only'});
  assert.equal(receipt.deployment_state,'not_deployed');
  assert.equal(receipt.production_record_exported,false);
  assert.equal(receipt.server_side_intake_enabled,false);
  assert.equal(receipt.production_booking_enabled,false);
  assert.equal(receipt.files.length,5);
  for(const f of receipt.files){
   assert.match(f.sha256,/^sha256:[a-f0-9]{64}$/);
   assert.ok(fs.existsSync(path.join(output,'site',f.path)));
  }
  assert.match(fs.readFileSync(path.join(output,'site/eps/index.html'),'utf8'),/eps-continuity-20261017/);
  assert.match(fs.readFileSync(path.join(output,'site/havenly/index.html'),'utf8'),/havenly-continuity-20261017/);
  assert.match(fs.readFileSync(path.join(output,'site/sunshine-spotless/index.html'),'utf8'),/sunshine-spotless-continuity-20261018/);
 }finally{fs.rmSync(output,{recursive:true,force:true})}
});
test('external proof distinguishes tested routes from undeployed sites',async()=>{
 const none=await probeServiceContinuity({ownedOrigin:'',fetchImpl:async()=>{throw new Error('unexpected request')}});
 assert.equal(none.verified,false);
 assert.ok(none.checks.some(c=>c.state==='blocked_owned_origin_unconfigured'));
 const mock=async url=>{
  let text='';
  const p=new URL(url);
  if(p.pathname.includes('eps-estimator'))text='EPS Precise Estimator';
  else if(p.hostname==='havenlycleaning.com'||p.pathname.includes('havenly'))text='havenly-continuity-20261017';
  else text='eps-continuity-20261017';
  return new Response(text,{status:200,headers:{'content-type':'text/html'}});
 };
 const good=await probeServiceContinuity({ownedOrigin:'https://evercraft.example',fetchImpl:mock});
 assert.equal(good.verified,true);
 assert.equal(good.checks.length,5);
 assert.equal(good.backend_intake_verified,false);
 const blocked=await probeServiceContinuity({ownedOrigin:'https://evercraft.example',fetchImpl:async()=>new Response('Payment Required',{status:402})});
 assert.equal(blocked.verified,false);
 assert.ok(blocked.checks.every(c=>c.state==='blocked_http_status'));
});
test('Base44 domains and mixed transport are not valid owned origins',async()=>{
 const r=await probeServiceContinuity({ownedOrigin:'https://old.base44.app',fetchImpl:async()=>{throw new Error('no network')}});
 assert.equal(r.owned_origin_configured,false);
 assert.match(r.owned_origin_configuration_error,/invalid_owned_origin/);
});
