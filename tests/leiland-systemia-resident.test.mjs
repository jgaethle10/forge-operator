import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkResidentSource,startLeilandResident,RUNNER_SCHEMA} from '../systemia/leiland/resident-host-runner.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const canonical=path.join(root,'public');
const getSha=()=>execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();

test('Leiland is Systemia-managed and disabled without explicit field configuration',()=>{
 const c=JSON.parse(fs.readFileSync(path.join(root,'systemia/core/resident-services.json'),'utf8'));
 const row=c.services.find(x=>x.service_key==='leiland-owned-observatory');
 assert.ok(row);
 assert.equal(row.mode,'resident');
 assert.equal(row.optional_when_unconfigured,true);
 assert.equal(row.max_restarts_per_hour,8);
 assert.equal(row.executable,'systemia/leiland/resident-host-runner.mjs');
 assert.deepEqual(row.env_args,{
  '--static-root':'LEILAND_STATIC_PUBLIC_ROOT',
  '--publication-root':'LEILAND_PUBLICATION_ROOT',
  '--release-sha':'LEILAND_RELEASE_SHA'
 });
 const manifest=JSON.parse(fs.readFileSync(path.join(root,row.manifest),'utf8'));
 const compute=JSON.parse(fs.readFileSync(path.join(root,'systemia/core/supervisor.evercraft.compute.json'),'utf8'));
 assert.deepEqual([...compute.supervised_workflows].sort(),c.services.map(x=>x.service_key).sort(),
  'Evercraft Compute and Systemia Core must enumerate identical resident services');

 assert.equal(manifest.schema,'evercraft.systemia.workflow-manifest.v1');
 assert.equal(manifest.runtime,'systemia-core-resident');
 assert.equal(manifest.authority.publish_kaidance_cycles,false);
 assert.equal(manifest.authority.schedule_missions,false);
 assert.equal(manifest.authority.create_public_route,false);
 assert.equal(manifest.authority.observe_private_inference,false);
 assert.equal(manifest.truth_gates.includes('pinned_checkout_sha_equals_actual_repo_head'),true);
});
test('the wrapper rejects mismatched repo SHA, unsafe source and missing publication path before opening a port',async()=>{
 const t=fs.mkdtempSync(path.join(os.tmpdir(),'leiland-resident-test-'));
 try{
  const sha=getSha();
  assert.throws(()=>checkResidentSource({expectedSha:sha,actualSha:'a'.repeat(40),staticRoot:canonical,publicationRoot:t,port:8795}),/release_sha_mismatch/);
  assert.throws(()=>checkResidentSource({expectedSha:sha,actualSha:sha,staticRoot:t,publicationRoot:t,port:8795}),/canonical_source_required/);
  assert.throws(()=>checkResidentSource({expectedSha:sha,actualSha:sha,staticRoot:canonical,publicationRoot:canonical,port:8795}),/publication_root_invalid/);
  await assert.rejects(()=>startLeilandResident({
   argv:['--static-root',canonical,'--publication-root',t,'--release-sha','a'.repeat(40)],
   actualSha:sha,startHost:async()=>{throw Error('should_never_start')}
  }),/release_sha_mismatch/);
 }finally{fs.rmSync(t,{recursive:true,force:true})}
});
test('a configured Systemia Leiland child starts only on loopback and shuts down on supervisor SIGTERM',async()=>{
 const t=fs.mkdtempSync(path.join(os.tmpdir(),'leiland-resident-running-'));
 const sha=getSha();
 const cmd=['systemia/leiland/resident-host-runner.mjs',
  '--static-root',canonical,'--publication-root',t,'--release-sha',sha,'--port','0'];
 const child=spawn(process.execPath,cmd,{cwd:root,stdio:['ignore','pipe','pipe']});
 let out='',err='',exited=false;
 child.stderr.on('data',x=>{err+=x.toString()});
 child.on('exit',()=>{exited=true});
 try{
  const first=await new Promise((resolve,reject)=>{
   const deadline=setTimeout(()=>reject(Error('resident_start_timeout '+err.slice(0,200))),5000);
   child.stdout.on('data',chunk=>{
    out+=chunk.toString();
    const line=out.split('\n').find(s=>s.trim().startsWith('{'));
    if(!line)return;
    try{const value=JSON.parse(line);clearTimeout(deadline);resolve(value)}
    catch{}
   });
   child.once('error',e=>{clearTimeout(deadline);reject(e)});
   child.once('exit',code=>{clearTimeout(deadline);reject(Error('resident_early_exit_'+code+' '+err.slice(0,180)))});
  });
  assert.equal(first.schema,RUNNER_SCHEMA);
  assert.equal(first.state,'local_resident_started');
  assert.equal(first.public_https_verified,false);
  assert.equal(first.live_inference_claim,false);
  assert.match(first.local_origin,/^http:\/\/127\.0\.0\.1:\d+$/);
  const live=await fetch(first.local_origin+'/healthz');
  assert.equal(live.status,200);
  const data=await live.json();
  assert.equal(data.source_commit,sha);
  assert.equal(data.external_https_verified,false);
  const page=await fetch(first.local_origin+'/leiland/');
  assert.equal(page.status,200);
 }finally{
  if(!exited){child.kill('SIGTERM');await Promise.race([
   new Promise(resolve=>child.once('exit',resolve)),
   new Promise(resolve=>setTimeout(resolve,1500))
  ]);}
  if(!exited)child.kill('SIGKILL');
  fs.rmSync(t,{recursive:true,force:true});
 }
});
