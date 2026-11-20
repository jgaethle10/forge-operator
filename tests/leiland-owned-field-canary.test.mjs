import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {FIELD_CANARY_SCHEMA,runLeilandFieldCanary} from '../scripts/leiland-owned-field-canary.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pinned=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
async function scoped(run){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'leiland-canary-projections-'));
 try{await run(dir)}finally{await fs.rm(dir,{recursive:true,force:true})}
}
test('field canary verifies actual checked-out static bytes and never claims public HTTPS',async()=>{
 await scoped(async publicationRoot=>{
  const receipt=await runLeilandFieldCanary({checkout:root,publicationRoot,expectedSha:pinned});
  assert.equal(receipt.schema,FIELD_CANARY_SCHEMA);
  assert.equal(receipt.status,'local_loopback_verified_only');
  assert.equal(receipt.release_sha,pinned);
  assert.equal(receipt.static_assets_verified,14);
  assert.equal(receipt.public_pulse_state,'not_connected');
  assert.equal(receipt.public_cycle_number,null);
  assert.equal(receipt.public_inference_feed_state,'not_connected');
  assert.equal(receipt.public_route_activated,false);
  assert.equal(receipt.external_https_verified,false);
  assert.equal(receipt.private_runtime_verified,false);
  assert.equal(receipt.operator_release_authorized,false);
 });
});
test('field canary rejects a commit that was not independently pinned',async()=>{
 await scoped(async publicationRoot=>{
  await assert.rejects(()=>runLeilandFieldCanary({checkout:root,publicationRoot,expectedSha:'0'.repeat(40)}),/local_release_commit_not_pinned/);
  await assert.rejects(()=>runLeilandFieldCanary({checkout:root,publicationRoot,expectedSha:'main'}),/operator_pinned_commit_required/);
 });
});
test('field canary blocks altered public bytes even if a local listener answers 200',async()=>{
 await scoped(async publicationRoot=>{
  const unsafe=async(url,options)=>{
   if(new URL(url).pathname==='/leiland/brain.js')return new Response('malicious-byte',{status:200});
   return fetch(url,options);
  };
  await assert.rejects(()=>runLeilandFieldCanary({checkout:root,publicationRoot,expectedSha:pinned,fetchImpl:unsafe}),/local_asset_mismatch/);
 });
});
test('field canary refuses an unapproved public pulse rather than calling a node healthy',async()=>{
 await scoped(async publicationRoot=>{
  await fs.mkdir(path.join(publicationRoot,'kaidance'));
  await fs.writeFile(path.join(publicationRoot,'kaidance','pulse.json'),JSON.stringify({
   schema:'evercraft.kaidance.public-pulse.v1',private_key:'NEVER-PUBLIC'
  }));
  await assert.rejects(()=>runLeilandFieldCanary({checkout:root,publicationRoot,expectedSha:pinned}),/public_pulse_invalid_at_origin/);
 });
});
