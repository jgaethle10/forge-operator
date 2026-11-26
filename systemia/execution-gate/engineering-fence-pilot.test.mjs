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
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'engineering-fence-pilot-'));
  const repo=path.join(root,'repo.git'),seed=path.join(root,'seed');fs.mkdirSync(repo,{mode:0o700});fs.mkdirSync(seed,{mode:0o700});
  git(repo,'init','--bare');git(seed,'init');git(seed,'config','user.name','Pilot');git(seed,'config','user.email','pilot@example.test');
  for(const d of ['r','s','shared']){fs.mkdirSync(path.join(seed,d));fs.writeFileSync(path.join(seed,d,'file.txt'),'base\n');}
  git(seed,'add','.');git(seed,'commit','-m','base');const base=git(seed,'rev-parse','HEAD');git(seed,'push',repo,'HEAD:refs/heads/pilot-integration');
  const passportStateDir=path.join(root,'passport'),passport=new EvercraftPassport({stateDir:passportStateDir});
  const now=Date.now();let clock=now;
  const grant=(id,subject,product,scopes)=>passport.issueGrant({grant_id:id,idempotency_key:id,subject_ref:subject,issuer_ref:'pilot:authority',product,scopes,starts_at:new Date(now-60000).toISOString(),ends_at:new Date(now+3600000).toISOString(),authority_state:'manual_authorized',authority_receipt_ref:'pilot:fixture'});
  grant('adapter','pilot:adapter','evercraft-intake',['intake.write.agent']);
  grant('admission','pilot:admission','evercraft-intake',['intake.admit','intake.read']);
  grant('writer','pilot:writer','engineering-pilot',['ref.write']);
  const intake=new EvercraftIntakeFabric({stateDir:path.join(root,'intake'),passportStateDir});
  const routes=path.join(root,'routes.json');fs.writeFileSync(routes,JSON.stringify({schema:'evercraft.direct-door-readiness.v2',products:[{slug:'engineering-pilot',preferred_route:{registered_dispatcher:'engineering-pilot'}}]}));
  const gate=new EvercraftExecutionGate({stateDir:path.join(root,'gate'),passportStateDir,meterStateDir:path.join(root,'meter'),routeLedgerPath:routes});
  const options={root,intake,passport,gate,adapterActor:'pilot:adapter',admissionActor:'pilot:admission',clock:()=>clock};
  const pilot=new EngineeringFencePilot(options);
  const proposal=(id,p,sha=base)=>({schema:'evercraft.engineering.proposal.v1',mission_key:'engineering-fence-pilot',request_id:id,repo:'synthetic',base_sha:sha,paths:[p],objective:'Synthetic independent engineering task',acceptance_tests:['pilot-tree-check'],dependencies:[],evidence_refs:[],rollback_required:true,priority_request:'P0'});

 return {root,repo,base,passport,gate,options,pilot,proposal,advance:ms=>{clock+=ms}};
}
function makeCandidate(f,name,parent,edit){
 const dir=path.join(f.root,name);git(f.repo,'worktree','add','--detach',dir,parent);
 edit(dir);git(dir,'add','-A');git(dir,'-c','user.name=Pilot','-c','user.email=pilot@example.test','commit','-m',name);
 return git(dir,'rev-parse','HEAD');
}
function inputFor(f,id,file,value,parent=f.base){
 f.pilot.submit(f.proposal(id,file,parent));
 const r=f.pilot.reserve(id,{actor:'pilot:writer'});assert.equal(r.state,'reserved');
 return {id,actor:'pilot:writer',fence:r.fence,expected:parent,candidate:makeCandidate(f,'candidate-'+id,parent,dir=>fs.writeFileSync(path.join(dir,file),value+'\n'))};
}
function revoke(f){
 return f.passport.revokeGrant({grant_id:'writer',idempotency_key:'revoke-writer',actor_ref:'pilot:authority',authority_state:'manual_authorized',authority_receipt_ref:'pilot:fixture',revoked_at:new Date(f.options.clock()).toISOString()});
}
test('isolated Git worker overlap, conflicting reservation hold and actual ref writer fence',async()=>{
 const f=fixture();const {root,repo,base,proposal,options}=f;let {pilot}=f;
 try{
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
   active++;maxActive=Math.max(active,maxActive);
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
  assert.equal(pilot.publish(input).reason,'durable_verification_missing');
  const [va,vc]=await Promise.all([pilot.verifyCandidate(input),pilot.verifyCandidate({id:'c',actor:'pilot:writer',fence:C.fence,expected:base,candidate:cc})]);
  assert.equal(va.state,'verified');assert.equal(vc.state,'verified');assert.equal(va.dispatch.execution_checkpoint_persisted,true);
  const result=pilot.publish(input);assert.equal(result.state,'published_synthetic');assert.equal(git(repo,'rev-parse','refs/heads/pilot-integration'),ca);
  pilot=new EngineeringFencePilot(options);
  assert.equal(pilot.publish(input).reason,'stale_or_expired_fence');
  assert.equal(pilot.publish({id:'c',actor:'pilot:writer',fence:C.fence,expected:base,candidate:cc,testPassed:true}).reason,'stale_target_rebase_retest_required');
  assert.equal(git(repo,'cat-file','-t',cc),'commit');
  // Rebase in a NEW worktree, retest, and serialize actual integration.
  assert.equal(pilot.supersedeStale({id:'c',actor:'pilot:writer',fence:C.fence,candidate:cc}).state,'superseded');
  assert.equal(git(repo,'rev-parse','refs/engineering-pilot/artifacts/c-'+C.fence),cc);
  const c2dir=path.join(root,'work-c-rebased');git(repo,'worktree','add','--detach',c2dir,ca);
  git(c2dir,'-c','user.name=Pilot','-c','user.email=pilot@example.test','cherry-pick',cc);
  const c2=git(c2dir,'rev-parse','HEAD');pilot.submit(proposal('c-rebased','s/file.txt',ca));
  const C2=pilot.reserve('c-rebased',{actor:'pilot:writer'});assert.equal(C2.state,'reserved');assert.ok(C2.fence>C.fence);
  const rebased={id:'c-rebased',actor:'pilot:writer',fence:C2.fence,expected:ca,candidate:c2};
  assert.equal((await pilot.verifyCandidate(rebased)).state,'verified');
  assert.equal(pilot.publish(rebased).state,'published_synthetic');
  assert.equal(git(repo,'show',c2+':r/file.txt'),'A');assert.equal(git(repo,'show',c2+':s/file.txt'),'C');
  const d=proposal('d','r/file.txt',c2);pilot.submit(d);
  const D=pilot.reserve('d',{actor:'pilot:writer',ttlMs:1});assert.equal(D.state,'reserved');f.advance(2);
  assert.equal(pilot.publish({id:'d',actor:'pilot:writer',fence:D.fence,expected:c2,candidate:c2,testPassed:true}).reason,'stale_or_expired_fence');
  assert.equal(git(repo,'rev-parse','refs/heads/pilot-integration'),c2);
  fs.mkdirSync(path.join(root,'fence.lock'),{mode:0o700});
  assert.equal(pilot.reserve('b',{actor:'pilot:writer'}).reason,'reservation_or_writer_reconciliation_required');
  fs.rmdirSync(path.join(root,'fence.lock'));
  console.log(JSON.stringify({synthetic:true,parallel_preparations:maxActive,conflict_holds:1,stale_ref_holds:1,verified_ref_writes:2,production_mutations:0}));
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

test('rename source, deletion, hidden shared path and real failed tree check are rejected',async()=>{
 const f=fixture();
 try{
  const x=inputFor(f,'a','r/file.txt','valid');
  const rename=makeCandidate(f,'renamed',f.base,dir=>fs.renameSync(path.join(dir,'shared/file.txt'),path.join(dir,'r/new.txt')));
  const deletion=makeCandidate(f,'deleted',f.base,dir=>fs.unlinkSync(path.join(dir,'shared/file.txt')));
  const hidden=makeCandidate(f,'hidden',f.base,dir=>{fs.writeFileSync(path.join(dir,'r/file.txt'),'valid');fs.writeFileSync(path.join(dir,'shared/file.txt'),'hidden');});
  for(const candidate of [rename,deletion,hidden])assert.equal(f.pilot.publish({...x,candidate}).reason,'expanded_diff');
  const fail=makeCandidate(f,'failed',f.base,dir=>fs.writeFileSync(path.join(dir,'r/file.txt'),'FAIL'));
  const v=await f.pilot.verifyCandidate({...x,candidate:fail});assert.equal(v.state,'held');
  assert.equal(f.pilot.publish({...x,candidate:fail}).reason,'failed_acceptance');
  assert.equal(git(f.repo,'rev-parse','refs/heads/pilot-integration'),f.base);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('revocation after gate start is rejected at writer; intent stays held after restart',async()=>{
 const f=fixture();
 try{
  const x=inputFor(f,'a','r/file.txt','A');assert.equal((await f.pilot.verifyCandidate(x)).state,'verified');
  const start=f.gate.startExecution.bind(f.gate);
  f.gate.startExecution=input=>{const r=start(input);assert.equal(r.state,'started');revoke(f);return r;};
  assert.equal(f.pilot.publish(x).reason,'write_authority_expired_or_revoked');
  assert.equal(git(f.repo,'rev-parse','refs/heads/pilot-integration'),f.base);
  const restarted=new EngineeringFencePilot(f.options);
  const hold=restarted.inspectUncertain();assert.equal(hold.state,'reconciliation_required');assert.equal(hold.intents[0].observation,'prior_ref_present');assert.equal(hold.intents[0].replay_authorized,false);
  assert.equal(restarted.publish(x).reason,'stale_or_expired_fence');
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('lost completion after CAS preserves changed ref and blocks independent integration after restart',async()=>{
 const f=fixture();
 try{
  const a=inputFor(f,'a','r/file.txt','A'),c=inputFor(f,'c','s/file.txt','C');
  await f.pilot.verifyCandidate(a);await f.pilot.verifyCandidate(c);
  f.gate.completeExecution=()=>{throw Error('simulated_lost_completion');};
  assert.throws(()=>f.pilot.publish(a),/simulated_lost_completion/);
  assert.equal(git(f.repo,'rev-parse','refs/heads/pilot-integration'),a.candidate);
  const restarted=new EngineeringFencePilot(f.options),hold=restarted.inspectUncertain();
  assert.equal(hold.state,'reconciliation_required');assert.equal(hold.intents[0].observation,'candidate_present');assert.equal(hold.intents[0].authoritative_outcome_verified,false);
  assert.equal(restarted.publish(c).reason,'writer_intent_reconciliation_required');
  assert.equal(restarted.publish(a).reason,'stale_or_expired_fence');
  assert.equal(git(f.repo,'rev-parse','refs/heads/pilot-integration'),a.candidate);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('synthetic rollback is a new gated revert commit, not a ref rewind',async()=>{
 const f=fixture();
 try{
  const a=inputFor(f,'a','r/file.txt','A');await f.pilot.verifyCandidate(a);
  assert.equal(f.pilot.publish(a).state,'published_synthetic');
  const revert=inputFor(f,'revert-a','r/file.txt','base',a.candidate);
  await f.pilot.verifyCandidate(revert);assert.equal(f.pilot.publish(revert).state,'published_synthetic');
  assert.equal(git(f.repo,'rev-parse','refs/heads/pilot-integration'),revert.candidate);
  assert.equal(git(f.repo,'rev-parse',revert.candidate+'^'),a.candidate);
  assert.equal(git(f.repo,'rev-parse',revert.candidate+'^{tree}'),git(f.repo,'rev-parse',f.base+'^{tree}'));
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
function childCode(){
  const imports={
   pilot:new URL('./engineering-fence-pilot.mjs',import.meta.url).href,
   passport:new URL('../passport/passport.mjs',import.meta.url).href,
   intake:new URL('../intake-fabric/intake.mjs',import.meta.url).href,
   gate:new URL('./gate.mjs',import.meta.url).href
  };
  const code='import {EngineeringFencePilot} from '+JSON.stringify(imports.pilot)+';'+
   'import {EvercraftPassport} from '+JSON.stringify(imports.passport)+';'+
   'import {EvercraftIntakeFabric} from '+JSON.stringify(imports.intake)+';'+
   'import {EvercraftExecutionGate} from '+JSON.stringify(imports.gate)+';'+
   'import path from "node:path";const [root,raw]=process.argv.slice(1);const passportStateDir=path.join(root,"passport");'+
   'const passport=new EvercraftPassport({stateDir:passportStateDir});const intake=new EvercraftIntakeFabric({stateDir:path.join(root,"intake"),passportStateDir});'+
   'const gate=new EvercraftExecutionGate({stateDir:path.join(root,"gate"),passportStateDir,meterStateDir:path.join(root,"meter"),routeLedgerPath:path.join(root,"routes.json")});'+
   'const mode=process.argv[3];if(mode==="before-cas"){const start=gate.startExecution.bind(gate);gate.startExecution=x=>{const r=start(x);if(r.state==="started")process.kill(process.pid,"SIGKILL");return r;};}if(mode==="after-cas")gate.completeExecution=()=>process.kill(process.pid,"SIGKILL");'+
   'console.log(JSON.stringify(new EngineeringFencePilot({root,passport,intake,gate,adapterActor:"pilot:adapter",admissionActor:"pilot:admission"}).publish(JSON.parse(raw))));';
  return code;
}
test('two separate writer processes cannot both integrate against one target SHA',async()=>{
 const f=fixture();
 try{
  const a=inputFor(f,'a','r/file.txt','A'),c=inputFor(f,'c','s/file.txt','C');
  await Promise.all([f.pilot.verifyCandidate(a),f.pilot.verifyCandidate(c)]);
  const code=childCode();
  const results=await Promise.all([a,c].map(async x=>JSON.parse((await run(process.execPath,['--input-type=module','-e',code,f.root,JSON.stringify(x)],{timeout:15000})).stdout)));
  const winners=results.filter(x=>x.state==='published_synthetic');assert.equal(winners.length,1);
  const loser=results.find(x=>x.state==='held');assert.ok(['reservation_or_writer_reconciliation_required','stale_target_rebase_retest_required'].includes(loser.reason));
  assert.equal(git(f.repo,'rev-parse','refs/heads/pilot-integration'),winners[0].current);
  assert.equal(git(f.repo,'cat-file','-t',a.candidate),'commit');assert.equal(git(f.repo,'cat-file','-t',c.candidate),'commit');
  console.log(JSON.stringify({synthetic:true,concurrent_writer_processes:2,winners:1,losers_held:1,production_mutations:0}));
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});

test('hard-killed actual writer before and after CAS leaves durable orphan and never replays',async()=>{
 for(const mode of ['before-cas','after-cas']){
  const f=fixture();
  try{
   const a=inputFor(f,'a','r/file.txt','A'),c=inputFor(f,'c','s/file.txt','C');
   await Promise.all([f.pilot.verifyCandidate(a),f.pilot.verifyCandidate(c)]);
   await assert.rejects(()=>run(process.execPath,['--input-type=module','-e',childCode(),f.root,JSON.stringify(a),mode],{timeout:15000}),e=>e.signal==='SIGKILL');
   const restarted=new EngineeringFencePilot(f.options),hold=restarted.inspectUncertain();
   assert.equal(hold.locked,true);assert.equal(hold.state,'reconciliation_required');assert.equal(hold.intents.length,1);
   assert.equal(hold.intents[0].observation,mode==='before-cas'?'prior_ref_present':'candidate_present');
   assert.equal(hold.intents[0].replay_authorized,false);
   assert.equal(restarted.publish(a).reason,'reservation_or_writer_reconciliation_required');
   assert.equal(restarted.publish(c).reason,'reservation_or_writer_reconciliation_required');
   assert.equal(git(f.repo,'rev-parse','refs/heads/pilot-integration'),mode==='before-cas'?f.base:a.candidate);
   assert.equal(restarted.observe().uncertain,1);
   console.log(JSON.stringify({synthetic:true,hard_kill:mode,lock_preserved:true,ref_observation:hold.intents[0].observation,replay_authorized:false}));
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
 }
});
test('scoped revocation and mutation share one lock, and metrics are read-only',async()=>{
 const f=fixture();
 try{
  const a=inputFor(f,'a','r/file.txt','A');
  f.pilot.submit(f.proposal('b','shared/file.txt'));
  f.advance(1000);
  const before=f.pilot.observe();
  assert.equal(before.accepted,1);assert.equal(before.reserved,1);assert.equal(before.oldest_waiting_ms,1000);
  assert.equal(before.execution_authorized,false);
  const request={grant_id:'writer',actor_ref:'pilot:authority',authority_receipt_ref:'pilot:fixture',idempotency_key:'scoped-revoke'};
  fs.mkdirSync(path.join(f.root,'fence.lock'),{mode:0o700});
  assert.equal(f.pilot.revokeWriterGrant(request).reason,'reservation_or_writer_reconciliation_required');
  assert.equal(f.passport.getGrantState('writer',{at:new Date(f.options.clock()).toISOString()}).active,true);
  fs.rmdirSync(path.join(f.root,'fence.lock'));
  assert.equal(f.pilot.revokeWriterGrant(request).state,'revoked');
  assert.equal(f.pilot.publish(a).reason,'writer_not_authorized');
  assert.equal(git(f.repo,'rev-parse','refs/heads/pilot-integration'),f.base);
  assert.equal(f.pilot.observe().completed,0);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
