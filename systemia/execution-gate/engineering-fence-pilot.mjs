// Isolated engineering pilot adapter. Not a resident, remote API, or production writer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {requestFingerprint} from './gate.mjs';
import {createGoalState,admitGoalPlan} from '../organism/goal-runtime.mjs';
import {createGoalStateFile,readGoalState} from '../organism/goal-store.mjs';
import {createCapabilityRegistry} from '../organism/capability-runtime.mjs';
import {executePersistedGoalWork} from '../organism/goal-durable-dispatch.mjs';

const sha=x=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ref='refs/heads/pilot-integration';
const ID=/^[a-z][a-z0-9-]{0,39}$/;
const SHA=/^[a-f0-9]{40}$/;
const fields=['schema','mission_key','request_id','repo','base_sha','paths','objective','acceptance_tests','dependencies','evidence_refs','rollback_required','priority_request'];
const sorted=a=>[...new Set(a)].sort();
const flags={production_authorized:false,release_authorized:false};
const receipt=x=>({...x,receipt_hash:sha(x)});
const deny=reason=>({state:'held',reason,...flags});
function git(repo,args){return execFileSync('git',['-C',repo,'-c','core.hooksPath=/dev/null',...args],{encoding:'utf8',timeout:10000,maxBuffer:1048576,env:{PATH:process.env.PATH,HOME:os.tmpdir(),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_REPLACE_OBJECTS:'1'}}).trim();}
function persist(file,value){
 const tmp=file+'.'+randomUUID()+'.tmp';
 const fd=fs.openSync(tmp,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.renameSync(tmp,file);
 const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}
}
function privateDirectory(dir){
 const s=fs.lstatSync(dir);
 if(!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o077)||fs.realpathSync(dir)!==dir)throw Error('private_pilot_directory_required');
}
export class EngineeringFencePilot{
 constructor({root,intake,passport,gate,adapterActor,admissionActor,clock=()=>Date.now()}){
  // Deliberately only a private temporary fixture, with a bare repository and
  // fixed target; never a production checkout or remote.
  this.root=path.resolve(root);privateDirectory(this.root);
  if(!this.root.startsWith(fs.realpathSync(os.tmpdir())+path.sep)||!path.basename(this.root).startsWith('engineering-fence-pilot-'))throw Error('synthetic_pilot_only');
  this.repo=path.join(this.root,'repo.git');privateDirectory(this.repo);
  if(git(this.repo,['rev-parse','--is-bare-repository'])!=='true'||git(this.repo,['remote'])!=='')throw Error('isolated_bare_repo_required');
  this.file=path.join(this.root,'fence.json');this.lock=path.join(this.root,'fence.lock');
  this.intake=intake;this.passport=passport;this.gate=gate;this.adapterActor=adapterActor;this.admissionActor=admissionActor;this.clock=clock;
 }
 #tx(fn){
  // No age-based lock stealing. Crash or uncertain writer => explicit hold.
  try{fs.mkdirSync(this.lock,{mode:0o700});}catch(e){if(e.code==='EEXIST')return deny('reservation_or_writer_reconciliation_required');throw e;}
  try{
   const s=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{sequence:0,jobs:{}};
   const save=()=>persist(this.file,s);
   return fn(s,save);
  }finally{fs.rmdirSync(this.lock);}
 }
 #time(){return new Date(this.clock()).toISOString();}
 // Observational metrics only; not an admission, dispatch or release grant.
 observe(){
  const state=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{sequence:0,jobs:{}};
  const jobs=Object.values(state.jobs),now=this.clock();
  if(!Number.isSafeInteger(state.sequence)||state.sequence<0||jobs.some(j=>!['accepted','reserved','intent','complete','superseded'].includes(j.status)||!Number.isFinite(Date.parse(j.admitted_at))))throw Error('pilot_state_invalid');
  const age=j=>Math.max(0,now-Date.parse(j.admitted_at));
  const waiting=jobs.filter(j=>j.status==='accepted');
  return receipt({schema:'evercraft.engineering.pilot-observation.v1',observed_at:this.#time(),
   state_digest:sha(state),synthetic:true,sequence:state.sequence,accepted:waiting.length,reserved:jobs.filter(j=>j.status==='reserved').length,
   uncertain:jobs.filter(j=>j.status==='intent').length,completed:jobs.filter(j=>j.status==='complete').length,
   superseded:jobs.filter(j=>j.status==='superseded').length,oldest_waiting_ms:waiting.length?Math.max(...waiting.map(age)):null,
   writer_lock_present:fs.existsSync(this.lock),execution_authorized:false,...flags});
 }
 #authority(actor){return this.passport.authorize({subject_ref:actor,product:'engineering-pilot',scope:'ref.write',resource_ref:'synthetic',at:this.#time()}).decision==='allow';}
 // Read-only reconciliation, not permission to clear orphan locks or retry.
 inspectUncertain(){
  const state=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{jobs:{}};
  const locked=fs.existsSync(this.lock);
  const current=git(this.repo,['rev-parse',ref]);
  const intents=Object.entries(state.jobs).filter(([,j])=>j.status==='intent').map(([id,j])=>{
   const intent=j.intent;
   const actual=intent?.target_ref&&intent.target_ref!==ref
    ? (()=>{try{return git(this.repo,['rev-parse','--verify',intent.target_ref]);}catch{return null;}})()
    :current;
   return {request_id:id,fence:j.fence,target_ref:intent?.target_ref||ref,current:actual,
    observation:actual===intent?.candidate?'candidate_present':actual===(intent?.expected||null)?'prior_ref_present':'ref_diverged',
    authoritative_outcome_verified:false,replay_authorized:false};
  });
  return receipt({state:locked||intents.length?'reconciliation_required':'no_uncertain_intent_observed',locked,intents,current,replay_authorized:false,...flags});
 }
 // Serialize the scoped pilot revocation route with the same writer lock.
 // Existing Passport verifies the issuer/self authority. This is only a
 // trusted local fixture boundary; direct Passport callers can bypass it.
 revokeWriterGrant({grant_id,actor_ref,authority_receipt_ref,idempotency_key}){
  return this.#tx(()=>{
   const at=this.#time(),grant=this.passport.getGrantState(grant_id,{at});
   if(grant.product!=='engineering-pilot'||!grant.scopes.includes('ref.write'))return deny('outside_pilot_grant_scope');
   const r=this.passport.revokeGrant({grant_id,actor_ref,authority_receipt_ref,idempotency_key,authority_state:'manual_authorized',revoked_at:at});
   return receipt({state:r.state,grant_id,passport_receipt:r.receipt.receipt_hash,...flags});
  });
 }
 #startWriter({j,id,actor,fence,request,save}){
  const leaseId='engineering-pilot-'+id+'-'+fence+'-'+request.operation;
  j.status='intent';j.intent=request;save();
  const prepared=this.gate.prepareExecution({lease_id:leaseId,idempotency_key:leaseId+':prepare',actor_ref:actor,passport_product:'engineering-pilot',scope:'ref.write',resource_ref:'synthetic',specialist_slug:'engineering-pilot',route_mode:'registered_internal',request,prepared_at:this.#time()});
  if(prepared.state!=='prepared')return deny('execution_gate_prepare_held');
  const started=this.gate.startExecution({lease_id:leaseId,idempotency_key:leaseId+':start',start_evidence_ref:sha(request),started_at:this.#time()});
  if(!started.dispatch_allowed||started.duplicate)return deny('execution_gate_start_held');
  if(this.clock()>=j.expires||!this.#authority(actor))return deny('write_authority_expired_or_revoked');
  return {state:'writer_started',leaseId,started};
 }
 #finishWriter({leaseId,done,j,save,status}){
  const completed=this.gate.completeExecution({lease_id:leaseId,idempotency_key:leaseId+':complete',outcome_evidence_ref:done.receipt_hash,completed_at:this.#time()});
  if(completed.state!=='completed')throw Error('writer_completion_unverified');
  j.status=status;j.result=done;j.completed_at=this.#time();save();return done;
 }
 #closure(paths){
  // Server-owned semantic map; different files can share a resource.
  const resources=[];
  for(const p of paths){
   if(!/^(r|s|shared)\/[a-z0-9][a-z0-9._-]{0,63}$/.test(p))throw Error('unmapped_path');
   resources.push(p.startsWith('s/')?'S':'R');
   if(p.startsWith('shared/'))resources.push('S');
  }
  return sorted(resources);
 }
 submit(input){
  if(!input||Object.keys(input).some(k=>!fields.includes(k))||input.schema!=='evercraft.engineering.proposal.v1'||input.mission_key!=='engineering-fence-pilot'||input.repo!=='synthetic'||!ID.test(input.request_id||'')||!SHA.test(input.base_sha||'')||input.rollback_required!==true||typeof input.objective!=='string'||input.objective.length>300||!input.objective.trim()||!Array.isArray(input.paths)||!input.paths.length||input.paths.length>8||!Array.isArray(input.acceptance_tests)||JSON.stringify(input.acceptance_tests)!=='["pilot-tree-check"]'||!Array.isArray(input.dependencies)||input.dependencies.length||!Array.isArray(input.evidence_refs)||input.evidence_refs.length>8||input.evidence_refs.some(x=>typeof x!=='string'||!/^sha256:[a-f0-9]{64}$/.test(x))||!['P0','P1','P2'].includes(input.priority_request))throw Error('invalid_pilot_proposal');
  const proposal=Object.fromEntries(fields.map(k=>[k,k==='paths'?sorted(input.paths):input[k]]));
  const resources=this.#closure(proposal.paths),digest=requestFingerprint({request:proposal}),id=proposal.request_id;
  return this.#tx((s,save)=>{
   const at=this.#time();
   if(this.passport.authorize({subject_ref:this.adapterActor,product:'evercraft-intake',scope:'intake.write.agent',at}).decision!=='allow')return deny('adapter_not_authorized');
   const previous=Object.hasOwn(s.jobs,id)?s.jobs[id]:null;
   if(previous)return previous.digest===digest?{...previous.admission,duplicate:true}:deny('request_identity_payload_conflict');
   if(git(this.repo,['rev-parse',ref])!==proposal.base_sha)return deny('stale_proposal_base');
   const candidate=this.intake.ingest({idempotency_key:'engineering-pilot:'+id,candidate_id:'engineering-pilot-'+id,adapter_actor_ref:this.adapterActor,source_type:'agent',source_ref:'engineering-pilot:authenticated-adapter',external_event_id:id,source_trust_state:'trusted_internal',content_ref:'engineering-pilot:'+id,content_fingerprint:digest,intent_excerpt:proposal.objective,requested_capability_hints:['engineering-pilot'],claimed_priority:proposal.priority_request,received_at:at});
   if(candidate.candidate.content_fingerprint!==digest)return deny('intake_payload_conflict');
   const accepted=this.intake.decideAdmission({idempotency_key:'engineering-pilot:admit:'+id,candidate_id:candidate.candidate.candidate_id,decision:'accept',actor_ref:this.admissionActor,mission_ref:'engineering-fence-pilot',admitted_priority:'P1',reason:'isolated synthetic proof only',evidence_ref:digest,decided_at:at});
   const packet=this.intake.buildSystemiaAdmissionPacket(candidate.candidate.candidate_id,{actor_ref:this.admissionActor,at});
   if(accepted.decision.decision!=='accept'||packet.content_fingerprint!==digest||packet.execution_authority_granted!==false)throw Error('intake_binding_invalid');
   const admission=receipt({state:'accepted_proposal_only',request_id:id,digest,resources,admission_ref:packet.receipt_hash,execution_authorized:false,...flags});
   s.jobs[id]={proposal,digest,resources,admission,status:'accepted',admitted_at:at};save();return admission;
  });
 }
 reserve(id,{actor,ttlMs=60000}={}){
  if(!ID.test(id)||!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>300000)throw Error('invalid_reservation');
  return this.#tx((s,save)=>{
   const j=Object.hasOwn(s.jobs,id)?s.jobs[id]:null,at=this.#time();
   if(!j||j.status!=='accepted')return deny('not_available');
   if(this.passport.authorize({subject_ref:actor,product:'engineering-pilot',scope:'ref.write',resource_ref:'synthetic',at}).decision!=='allow')return deny('writer_not_authorized');
   for(const other of Object.values(s.jobs)){
    if(['reserved','intent'].includes(other.status)&&other.resources.some(r=>j.resources.includes(r)))return deny('resource_conflict_or_uncertain_effect');
   }
   if(Object.values(s.jobs).some(other=>other.status==='intent'))return deny('writer_intent_reconciliation_required');
   if(git(this.repo,['rev-parse',ref])!==j.proposal.base_sha)return deny('stale_proposal_base');
   j.fence=++s.sequence;j.actor=actor;j.expires=this.clock()+ttlMs;j.status='reserved';j.reserved_at=at;save();
   return receipt({state:'reserved',request_id:id,fence:j.fence,resources:j.resources,...flags});
  });
 }
 #testTree(expected,candidate){
  // Fixed read-only synthetic acceptance, not arbitrary caller commands.
  try{
   git(this.repo,['diff','--check',expected,candidate]);
   const lines=git(this.repo,['ls-tree','-r',candidate]).split('\n');
   return lines.length>0&&lines.every(l=>/^100644 blob [a-f0-9]{40}\t(?:r|s|shared)\/[a-z0-9][a-z0-9._-]{0,63}$/.test(l))&&
     lines.every(l=>{const value=git(this.repo,['cat-file','blob',l.split(' ')[2].split('\t')[0]]);return value.length>0&&value.length<=512&&!value.includes('FAIL');});
  }catch{return false;}
 }
 #goalBinding({id,fence,expected,candidate}){
  if(!ID.test(id)||!Number.isSafeInteger(fence)||fence<1||!SHA.test(expected)||!SHA.test(candidate))throw Error('invalid_goal_binding');
  const key='engineering-pilot-'+id+'-'+fence+'-'+candidate;
  const evidence=sha({id,fence,expected,candidate,test:'pilot-tree-check'});
  return {key,evidence,file:path.join(this.root,key+'.goal.json')};
 }
 async verifyCandidate({id,actor,fence,expected,candidate}){
  const g=this.#goalBinding({id,fence,expected,candidate});
  const admitted=this.#tx((s)=>{
   const j=Object.hasOwn(s.jobs,id)?s.jobs[id]:null;
   return j?.status==='reserved'&&j.actor===actor&&j.fence===fence&&j.proposal.base_sha===expected&&this.clock()<j.expires&&this.#authority(actor);
  });
  if(admitted!==true)return deny('verification_reservation_held');
  if(fs.existsSync(g.file)){
   const old=await readGoalState(g.file);
   return {state:old.status==='complete'?'verified':'held',duplicate:true,evidence_ref:g.evidence};
  }
  const now=new Date(this.clock());
  const state=admitGoalPlan({state:createGoalState({goalKey:g.key,missionKey:'engineering-fence-pilot',objective:'Verify exact synthetic candidate tree',contextRefs:[g.evidence],now}),plan:[{work_key:'verify-tree',work_type:'research'}],now});
  await createGoalStateFile(g.file,state);
  const dispatch=await executePersistedGoalWork({filePath:g.file,workKey:'verify-tree',now,registry:createCapabilityRegistry([{capability_key:'engineering-pilot-tree-verifier',work_types:['research'],authority:'read-only',execute:async()=>this.#testTree(expected,candidate)?{result:'complete',receipt_ref:g.evidence}:{result:'blocked'}}])});
  return {state:dispatch.ok?'verified':'held',evidence_ref:g.evidence,dispatch};
 }
 supersedeStale({id,actor,fence,candidate}){
  if(!ID.test(id)||!SHA.test(candidate))throw Error('invalid_supersession');
  return this.#tx((s,save)=>{
   const j=Object.hasOwn(s.jobs,id)?s.jobs[id]:null;
   if(!j||j.status!=='reserved'||j.actor!==actor||j.fence!==fence||this.clock()>=j.expires)return deny('stale_or_expired_fence');
   if(this.passport.authorize({subject_ref:actor,product:'engineering-pilot',scope:'ref.write',resource_ref:'synthetic',at:this.#time()}).decision!=='allow')return deny('writer_not_authorized');
   if(git(this.repo,['rev-parse',ref])===j.proposal.base_sha||git(this.repo,['rev-list','--parents','-n','1',candidate])!==candidate+' '+j.proposal.base_sha)return deny('stale_candidate_not_proven');
   if(Object.values(s.jobs).some(other=>other.status==='intent'))return deny('writer_intent_reconciliation_required');
   const changed=git(this.repo,['diff','--no-renames','--name-only','-z',j.proposal.base_sha,candidate]).split('\0').filter(Boolean);
   if(!changed.length||changed.some(p=>!j.proposal.paths.includes(p)))return deny('expanded_diff');
   const target_ref='refs/engineering-pilot/artifacts/'+id+'-'+fence;
   const request={operation:'preserve',target_ref,id,fence,expected:null,candidate,proposal_digest:j.digest,changed:sorted(changed)};
   const start=this.#startWriter({j,id,actor,fence,request,save});
   if(start.state!=='writer_started')return start;
   git(this.repo,['update-ref',target_ref,candidate,'0'.repeat(40)]);
   if(git(this.repo,['rev-parse',target_ref])!==candidate)throw Error('artifact_readback_mismatch');
   j.preserved_candidate=candidate;
   const done=receipt({state:'superseded',request_id:id,fence,preserved_candidate:candidate,gate_receipt:start.started.lease.receipt_hash,...flags});
   return this.#finishWriter({leaseId:start.leaseId,done,j,save,status:'superseded'});
  });
 }
 publish({id,actor,fence,expected,candidate,testPassed}){
  if(!ID.test(id)||!SHA.test(expected)||!SHA.test(candidate))throw Error('invalid_publish');
  return this.#tx((s,save)=>{
   const j=Object.hasOwn(s.jobs,id)?s.jobs[id]:null;
   if(!j||j.status!=='reserved'||j.actor!==actor||j.fence!==fence||this.clock()>=j.expires)return deny('stale_or_expired_fence');
   if(this.passport.authorize({subject_ref:actor,product:'engineering-pilot',scope:'ref.write',resource_ref:'synthetic',at:this.#time()}).decision!=='allow')return deny('writer_not_authorized');
   if(Object.values(s.jobs).some(other=>other.status==='intent'))return deny('writer_intent_reconciliation_required');
   if(expected!==j.proposal.base_sha||git(this.repo,['rev-parse',ref])!==expected)return deny('stale_target_rebase_retest_required');
   if(testPassed===false||!this.#testTree(expected,candidate))return deny('failed_acceptance');
   if(git(this.repo,['rev-list','--parents','-n','1',candidate])!==candidate+' '+expected)return deny('candidate_parent_mismatch');
   // --no-renames enumerates BOTH old/deleted and new/added paths.
   const changed=git(this.repo,['diff','--no-renames','--name-only','-z',expected,candidate]).split('\0').filter(Boolean);
   if(!changed.length||changed.some(p=>!j.proposal.paths.includes(p)))return deny('expanded_diff');
   if(this.#closure(changed).some(r=>!j.resources.includes(r)))return deny('expanded_resource_closure');
   const entries=git(this.repo,['ls-tree','-r',candidate]).split('\n');
   if(entries.some(l=>!/^100644 blob [a-f0-9]{40}\t(?:r|s|shared)\/[a-z0-9][a-z0-9._-]{0,63}$/.test(l)))return deny('unsupported_tree_entry');
   const binding=this.#goalBinding({id,fence,expected,candidate});
   if(!fs.existsSync(binding.file))return deny('durable_verification_missing');
   const goal=JSON.parse(fs.readFileSync(binding.file,'utf8'));
   const task=goal.tasks?.[0];
   if(goal.schema!=='evercraft.goal.state.v1'||goal.goal_key!==binding.key||goal.mission_key!=='engineering-fence-pilot'||goal.status!=='complete'||goal.context_refs?.[0]!==binding.evidence||goal.tasks?.length!==1||task?.work_key!=='verify-tree'||task.status!=='complete'||!task.receipt_refs?.includes(binding.evidence))return deny('durable_verification_unbound');
   const request={operation:'integrate',target_ref:ref,id,fence,expected,candidate,changed:sorted(changed),proposal_digest:j.digest,verification_ref:binding.evidence};
   const start=this.#startWriter({j,id,actor,fence,request,save});
   if(start.state!=='writer_started')return start;
   // Actual CAS under the non-stealable writer lock.
   git(this.repo,['update-ref',ref,candidate,expected]);
   if(git(this.repo,['rev-parse',ref])!==candidate)throw Error('ref_readback_mismatch');
   const done=receipt({state:'published_synthetic',request_id:id,fence,previous:expected,current:candidate,gate_receipt:start.started.lease.receipt_hash,...flags});
   return this.#finishWriter({leaseId:start.leaseId,done,j,save,status:'complete'});
  });
 }
}
