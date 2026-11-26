import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {EvercraftPassport} from '../passport/passport.mjs';
import {EvercraftIntakeFabric} from '../intake-fabric/intake.mjs';
import {EvercraftExecutionGate} from './gate.mjs';
import {EngineeringFencePilot} from './engineering-fence-pilot.mjs';
import {LineageStore} from '../lineage/core.mjs';
const run=promisify(execFile);
const git=(p,...a)=>execFileSync('git',['-C',p,...a],{encoding:'utf8'}).trim();
test('isolated Git worker overlap, conflicting reservation hold and actual ref writer fence',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'engineering-fence-pilot-'));
 try{
  const repo=path.join(root,'repo.git'),seed=path.join(root,'seed');fs.mkdirSync(repo,{mode:0o700});fs.mkdirSync(seed,{mode:0o700});
  git(repo,'init','--bare');git(seed,'init');git(seed,'config','user.name','Pilot');git(seed,'config','user.email','pilot@example.test');
  for(const d of ['r','s','shared']){fs.mkdirSync(path.join(seed,d));fs.writeFileSync(path.join(seed,d,'file.txt'),'base\n');}
  git(seed,'add','.');git(seed,'commit','-m','base');const base=git(seed,'rev-parse','HEAD');git(seed,'push',repo,'HEAD:refs/heads/pilot-integration');
  const passportStateDir=path.join(root,'passport'),passport=new EvercraftPassport({stateDir:passportStateDir});
  const now=Date.now(),stamp=new Date(now).toISOString();let clock=now;
  const grant=(id,subject,product,scopes)=>passport.issueGrant({grant_id:id,idempotency_key:id,subject_ref:subject,issuer_ref:'pilot:authority',product,scopes,starts_at:new Date(now-60000).toISOString(),ends_at:new Date(now+3600000).toISOString(),authority_state:'manual_authorized',authority_receipt_ref:'pilot:fixture'});
  grant('adapter','pilot:adapter','evercraft-intake',['intake.write.agent']);
  grant('admission','pilot:admission','evercraft-intake',['intake.admit','intake.read']);
  grant('writer','pilot:writer','engineering-pilot',['ref.write']);
  const intake=new EvercraftIntakeFabric({stateDir:path.join(root,'intake'),passportStateDir});
  const routes=path.join(root,'routes.json');fs.writeFileSync(routes,JSON.stringify({schema:'evercraft.direct-door-readiness.v2',products:[{slug:'engineering-pilot',preferred_route:{registered_dispatcher:'engineering-pilot'}}]}));
  const gate=new EvercraftExecutionGate({stateDir:path.join(root,'gate'),passportStateDir,meterStateDir:path.join(root,'meter'),routeLedgerPath:routes});
  const options={root,intake,passport,gate,adapterActor:'pilot:adapter',admissionActor:'pilot:admission',clock:()=>clock};
  let pilot=new EngineeringFencePilot(options);
  const proposal=(id,p,sha=base)=>({schema:'evercraft.engineering.proposal.v1',mission_key:'engineering-fence-pilot',request_id:id,repo:'synthetic',base_sha:sha,paths:[p],objective:'Synthetic independent engineering task',acceptance_tests:['pilot-tree-check'],dependencies:[],evidence_refs:[],rollback_required:true,priority_request:'P0'});
  const a=proposal('a','r/file.txt'),b=proposal('b','shared/file.txt'),c=proposal('c','s/file.txt');
  assert.equal(pilot.submit(a).state,'accepted_proposal_only');assert.equal(pilot.submit(a).duplicate,true);
  assert.equal(pilot.submit({...a,objective:'different'}).reason,'request_identity_payload_conflict');
  pilot.submit(b);pilot.submit(c);
  assert.equal(pilot.reserve('a',{actor:'unknown'}).reason,'writer_not_authorized');
  const A=pilot.reserve('a',{actor:'pilot:writer'});assert.equal(A.state,'reserved');
  assert.equal(pilot.reserve('b',{actor:'pilot:writer'}).reason,'resource_conflict_or_uncertain_effect');
  // First serial admission, then independent preparation leases overlap.
  const C=pilot.reserve('c',{actor:'pilot:writer'});assert.equal(C.state,'reserved');assert.ok(C.fence>A.fence);
  let active=0,maxActive=0;
  async function prepare(name,file,value){
   const dir=path.join(root,name);git(repo,'worktree','add','--detach',dir,base);
   active++;maxActive=Math.max(active,maxActive===undefined?0:maxActive);
   try{await fs.promises.writeFile(path.join(dir,file),value+'\n');
    await run('git',['-C',dir,'-c','user.name=Pilot','-c','user.email=pilot@example.test','commit','-am',name]);
    return git(dir,'rev-parse','HEAD');
   }finally{active--;}
  }
  const [ca,cc]=await Promise.all([prepare('work-a','r/file.txt','A'),prepare('work-c','s/file.txt','C')]);assert.equal(maxActive,2);
  const input={id:'a',actor:'pilot:writer',fence:A.fence,expected:base,candidate:ca,testPassed:true};
  assert.equal(pilot.publish({...input,fence:A.fence+10}).reason,'stale_or_expired_fence');
  assert.equal(pilot.publish({...input,testPassed:false}).reason,'failed_acceptance');
  // Candidate C cannot use A's resource permit, including a hidden shared path.
  assert.equal(pilot.publish({...input,candidate:cc}).reason,'expanded_diff');
  const result=pilot.publish(input);assert.equal(result.state,'published_synthetic');assert.equal(git(repo,'rev-parse','refs/heads/pilot-integration'),ca);
  pilot=new EngineeringFencePilot(options);
  assert.equal(pilot.publish(input).reason,'stale_or_expired_fence');
  assert.equal(pilot.publish({id:'c',actor:'pilot:writer',fence:C.fence,expected:base,candidate:cc,testPassed:true}).reason,'stale_target_rebase_retest_required');
  assert.equal(git(repo,'cat-file','-t',cc),'commit');
  // The old C artifact is preserved; fresh base and separate intake required.
  const d=proposal('d','r/file.txt',ca);pilot.submit(d);
  const D=pilot.reserve('d',{actor:'pilot:writer',ttlMs:1});assert.equal(D.state,'reserved');clock+=2;
  assert.equal(pilot.publish({id:'d',actor:'pilot:writer',fence:D.fence,expected:ca,candidate:ca,testPassed:true}).reason,'stale_or_expired_fence');
  assert.equal(git(repo,'rev-parse','refs/heads/pilot-integration'),ca);
  fs.mkdirSync(path.join(root,'fence.lock'),{mode:0o700});
  assert.equal(pilot.reserve('b',{actor:'pilot:writer'}).reason,'reservation_or_writer_reconciliation_required');
  fs.rmdirSync(path.join(root,'fence.lock'));
  console.log(JSON.stringify({synthetic:true,parallel_preparations:maxActive,conflict_holds:1,stale_ref_holds:1,verified_ref_writes:1,production_mutations:0}));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('existing Lineage CAS preserves losing candidate object',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lineage-pilot-'));
 try{
  const store=new LineageStore(root);await store.init();fs.writeFileSync(path.join(root,'r.txt'),'base');
  const first=await store.commit({message:'base'});fs.writeFileSync(path.join(root,'r.txt'),'new');const next=await store.commit({message:'next'});
  await assert.rejects(()=>store.compareAndSwapRef('main',first.commit_id,first.commit_id),e=>e.code==='LINEAGE_STALE_REF');
  assert.equal(await store.resolveRef('main'),next.commit_id);assert.equal((await store.readObject(first.commit_id)).type,'commit');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
