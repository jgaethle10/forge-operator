import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolveLeilandCoreBindings,LEILAND_CORE_ADMISSION_SCHEMA} from '../systemia/leiland/core-admission.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const admission=(root,options={})=>({
 enabled:true,release_sha:sha,publication_root:path.join(root,'approved-projections'),...options
});
function fixture(run){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'leiland-admission-test-'));
 fs.chmodSync(root,0o700);
 const directory=path.join(root,'approved-projections');
 fs.mkdirSync(directory,{mode:0o700});
 try{return run({root,directory})}finally{fs.rmSync(root,{recursive:true,force:true})}
}
const bind=(input,root,extra={})=>resolveLeilandCoreBindings({
 admission:input,releaseRef:sha,repoRoot:repo,workspaceRoot:root,...extra
});
test('missing admission keeps optional resident disabled without interpreting shell environment',()=>{
 assert.equal(LEILAND_CORE_ADMISSION_SCHEMA,'evercraft.leiland.core-binding.v1');
 assert.deepEqual(resolveLeilandCoreBindings({admission:null}),{});
 assert.deepEqual(resolveLeilandCoreBindings({admission:undefined}),{});
});
test('an exact admitted configuration binds only three public read-only resident settings',()=>{
 fixture(({root,directory})=>{
  const r=bind(admission(root),root);
  assert.deepEqual(Object.keys(r).sort(),[
   'LEILAND_PUBLICATION_ROOT','LEILAND_RELEASE_SHA','LEILAND_STATIC_PUBLIC_ROOT'
  ]);
  assert.equal(r.LEILAND_RELEASE_SHA,sha);
  assert.equal(r.LEILAND_PUBLICATION_ROOT,directory);
  assert.equal(r.LEILAND_STATIC_PUBLIC_ROOT,path.join(repo,'public'));
  assert.equal(r.LEILAND_PORT,undefined);
  assert.equal(Object.isFrozen(r),true);
 });
});
test('missing, non-opt-in or expanded requests never turn on Leiland',()=>{
 fixture(({root})=>{
  for(const bad of [{},{enabled:false},'true',[],{
   ...admission(root),authorization_token:'SHOULD_NOT_PASS'
  },{...admission(root),port:443}]){
   assert.throws(()=>bind(bad,root),/leiland_admission_invalid/);
  }
 });
});
test('release must be the admitted lease SHA and the actual repo revision',()=>{
 fixture(({root})=>{
  assert.throws(()=>bind(admission(root,{release_sha:'a'.repeat(40)}),root),/leiland_release_pin_invalid/);
  assert.throws(()=>bind(admission(root),root,{releaseRef:'b'.repeat(40)}),/leiland_release_pin_invalid/);
  assert.throws(()=>bind(admission(root),root,{checkoutSha:'b'.repeat(40)}),/leiland_deployed_release_mismatch/);
 });
});
test('publication root must be an existing canonical owner-controlled directory inside the admitted workspace',()=>{
 fixture(({root,directory})=>{
  assert.throws(()=>bind(admission(root,{publication_root:root}),root),/leiland_publication_outside_admitted_workspace/);
  assert.throws(()=>bind(admission(root,{publication_root:'/tmp'}),root),/leiland_publication_outside_admitted_workspace/);
  assert.throws(()=>bind(admission(root,{publication_root:path.join(root,'missing')}),root),/leiland_publication_root_invalid/);
  const link=path.join(root,'fake-projections');
  fs.symlinkSync(directory,link);
  assert.throws(()=>bind(admission(root,{publication_root:link}),root),/leiland_publication_root_invalid/);
  const outside=fs.mkdtempSync(path.join(os.tmpdir(),'unapproved-public-root-'));
  try{
   fs.chmodSync(outside,0o700);
   assert.throws(()=>bind(admission(root,{publication_root:outside}),root),/leiland_publication_outside_admitted_workspace/);
  }finally{fs.rmSync(outside,{recursive:true,force:true})}
  fs.chmodSync(directory,0o777);
  assert.throws(()=>bind(admission(root),root),/leiland_publication_directory_insecure/);
 });
});
test('runtime admission is explicit, scoped to Core and forwarded from the actual local organism',()=>{
 const runtime=fs.readFileSync(path.join(repo,'systemia/compute/runtime-node.mjs'),'utf8');
 const launcher=fs.readFileSync(path.join(repo,'systemia/compute/local-organism.mjs'),'utf8');
 const registry=JSON.parse(fs.readFileSync(path.join(repo,'systemia/core/resident-services.json'),'utf8'));
 const row=registry.services.find(x=>x.service_key==='leiland-owned-observatory');
 assert.equal(row.optional_when_unconfigured,true);
 assert.equal(row.mode,'resident');
 assert.ok(runtime.includes("admission: body.input?.leiland_observatory"));
 assert.ok(runtime.includes("...leilandEnv"));
 assert.ok(runtime.includes("return send(res, 422"));
 assert.ok(launcher.includes("LEILAND_SUPERVISED_ADMISSION === 'true'"));
 assert.ok(launcher.includes("leiland_observatory:leilandObservatory"));
 assert.ok(launcher.includes("release_sha: process.env.LEILAND_RELEASE_SHA || ''"));
 assert.ok(launcher.includes("publication_root: process.env.LEILAND_PUBLICATION_ROOT || ''"));
});
