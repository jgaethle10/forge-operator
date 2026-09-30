import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('systemia/rivet/siteplan');
const py=fs.readdirSync(root).filter((name)=>name.endsWith('.py')).sort();

assert.ok(py.length>=10, 'owned site-plan runtime is unexpectedly incomplete');

execFileSync('python3',['-m','py_compile',...py.map((name)=>path.join(root,name))],{stdio:'inherit'});

const violations=[];
for(const name of py){
  const body=fs.readFileSync(path.join(root,name),'utf8');
  if(body.includes("Path('/app") || body.includes('Path("/app')) violations.push(name+':legacy-/app-path');
  if(/base44\.app/i.test(body)) violations.push(name+':base44-host');
  if(/@base44\/sdk/i.test(body)) violations.push(name+':base44-sdk');
  if(/\/api\/apps\/[A-Za-z0-9_-]+\/functions\//i.test(body)) violations.push(name+':base44-function-route');
}
assert.deepEqual(violations,[]);

const correction=fs.readFileSync(path.join(root,'correct.py'),'utf8');
for(const stage of ['identity','compile','geometry','lineage','render','layout_qa','stall_label_visual_qa','artifact_promotion']){
  assert.match(correction,new RegExp("'"+stage+"'"),'missing correction stage '+stage);
}
assert.match(correction,/budget-seconds/);
assert.match(correction,/external_delivery_authorized':False/);

const store=fs.readFileSync(path.join(root,'artifact_store.py'),'utf8');
assert.match(store,/IMMUTABLE_ARTIFACT_HASH_CONFLICT/);
assert.match(store,/LAYOUT_QA_NOT_PASSED/);
assert.match(store,/STALL_LABEL_QA_NOT_PASSED/);
assert.match(store,/os\.replace\(pointer_tmp,pointer\)/);
assert.match(store,/external_delivery_authorized':False/);

const compiler=fs.readFileSync(path.join(root,'compile.py'),'utf8');
assert.match(compiler,/USGSNAIPImagery/);
assert.match(compiler,/identity_sha256/);
assert.match(compiler,/OFFLINE_AERIAL_CACHE_MISS/);

console.log(JSON.stringify({
  ok:true,
  python_modules:py.length,
  base44_runtime_coupling:0,
  correction_stages:8,
  immutable_artifact_airlock:true
}));
