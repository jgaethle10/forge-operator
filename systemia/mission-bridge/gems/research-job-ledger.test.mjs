import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {stageGemsResearchJob,readStagedGemsJob} from './research-job-ledger.mjs';
const request=()=>({schema:'evercraft.gems.private-research-request.v1',
  mission_id:'gems-research-20261119-001',workload:'spatial-validation',
  dataset_ref:'gems-data-official-2026',requested_at:'2026-11-19T04:20:00.000Z',
  compute:{runner_class:'isolated-free-ci',max_runtime_seconds:600,max_memory_mb:1024,max_paid_usd:0}});
const verified=()=>({principal_id:'usr_example-2026',tenant_id:'tenant_evercraft-001',
  authenticated_by:'server-verified-identity',passport_scope:'gems:research-preflight',
  grant_verified:true,approved_dataset_refs:['gems-data-official-2026']});
function workspace(run){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-staging-'));
  try{return run(root);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('authorized policy request writes private staged record without dispatch',()=>workspace(root=>{
 const r=stageGemsResearchJob({request:request(),verifiedContext:verified(),rootDir:root});
 assert.equal(r.state,'staged_not_dispatched');
 assert.equal(r.created,true);
 assert.equal(r.dispatch_authorized,false);
 const record=readStagedGemsJob({rootDir:root,missionId:request().mission_id});
 assert.equal(record.workload,'spatial-validation');
 assert.equal(record.passport_lease_issued,false);
 assert.equal(record.requires_authoritative_identity_recheck,true);
 assert.equal(record.requires_durable_passport_lease,true);
 assert.equal(record.state,'staged_not_dispatched');
 assert.equal(fs.statSync(path.join(root,request().mission_id+'.json')).mode&0o777,0o600);
}));
test('exact repeat is idempotent, conflicting same mission id is rejected',()=>workspace(root=>{
 const a=stageGemsResearchJob({request:request(),verifiedContext:verified(),rootDir:root});
 const b=stageGemsResearchJob({request:request(),verifiedContext:verified(),rootDir:root});
 assert.equal(a.created,true);assert.equal(b.created,false);
 assert.equal(b.idempotent_replay,true);
 const c=stageGemsResearchJob({request:{...request(),workload:'geology-evidence-review'},
   verifiedContext:verified(),rootDir:root});
 assert.equal(c.state,'hold');assert.equal(c.reason,'mission_id_conflict');
}));
test('permission and paid compute failures create no files',()=>workspace(root=>{
 const cases=[
 {r:request(),v:{...verified(),grant_verified:false}},
 {r:{...request(),compute:{...request().compute,max_paid_usd:1}},v:verified()},
 {r:{...request(),node:'penguin'},v:verified()},
 {r:{...request(),dataset_ref:'gems-data-no-access-2026'},v:verified()},
 ];
 for(const item of cases){
  const result=stageGemsResearchJob({request:item.r,verifiedContext:item.v,rootDir:root});
  assert.equal(result.state,'hold');
 }
 assert.deepEqual(fs.readdirSync(root),[]);
}));
test('symlink root is denied and unsafe existing record is never overwritten',()=>workspace(root=>{
 const link=root+'-link';fs.symlinkSync(root,link);
 try{
  const result=stageGemsResearchJob({request:request(),verifiedContext:verified(),rootDir:link});
  assert.equal(result.state,'hold');
 }finally{fs.unlinkSync(link)}
 const name=request().mission_id+'.json';
 const file=path.join(root,name);
 fs.symlinkSync('/etc/hosts',file);
 const result=stageGemsResearchJob({request:request(),verifiedContext:verified(),rootDir:root});
 assert.equal(result.state,'hold');
 assert.equal(result.dispatch_authorized,false);
}));
test('missing or malformed read targets fail closed',()=>workspace(root=>{
 assert.equal(readStagedGemsJob({rootDir:root,missionId:'../bad'}).state,'hold');
 assert.equal(readStagedGemsJob({rootDir:root,missionId:request().mission_id}).reason,'mission_not_found');
}));
