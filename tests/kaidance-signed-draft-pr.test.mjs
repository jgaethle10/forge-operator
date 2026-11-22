import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {humanApprovalMessage,verifyGoalHumanApproval} from '../systemia/organism/goal-human-approval.mjs';
import {PRECONDITION,REPLACEMENT,REGRESSION,planMossmereSourceRepair,SOURCE_PATH,TEST_PATH}
 from '../systemia/organism/kaidance-source-patch-recipe.mjs';
import {worldsSabanSourceFingerprint} from '../systemia/organism/kaidance-worlds-saban-review.mjs';
import {signedPrGoal,createPinnedGitHubClient,createExactReviewDraft,runSignedDraftPrPublisher}
 from '../systemia/organism/kaidance-signed-draft-pr.mjs';
import {readGoalState} from '../systemia/organism/goal-store.mjs';

const NOW=new Date('2026-11-22T12:00:00Z');
const sha40=n=>n.repeat(40);
const relative=[SOURCE_PATH,TEST_PATH,'public/worlds/world-bridge.mjs',
 'systemia/world-engine/saban-adapter.mjs','systemia/saban/registered-worker.mjs',
 'systemia/saban/multiplication-registry.json'];
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-draft-pr-'));
function fixture(){
 const root=temp();
 for(const p of relative){
  const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});
  let data=fs.readFileSync(p,'utf8');
  if(p===SOURCE_PATH)data=data.replace(REPLACEMENT,PRECONDITION);
  if(p===TEST_PATH)data=data.replace(REGRESSION,'');
  fs.writeFileSync(f,data,{mode:0o600});
 }
 return root;
}
function plan(root){
 const fp=worldsSabanSourceFingerprint(root);
 const review={schema:'evercraft.kaidance.saban-world-review.v1',
  source_fingerprint:fp,goal_key:'mossmere-engine-review-'+fp.slice(7,31),
  state:'complete',local_readonly_completed:true,
  execution_receipt_verified:true,receipt_refs:['sha256:'+'f'.repeat(64)]};
 const proposal=planMossmereSourceRepair({sourceText:fs.readFileSync(path.join(root,SOURCE_PATH),'utf8'),
  testText:fs.readFileSync(path.join(root,TEST_PATH),'utf8'),
  sourceFingerprint:fp,review});
 assert.equal(proposal.state,'candidate_proposed');
 return {review,proposal};
}
function privateWrite(dir,filename,body){
 const filepath=path.join(dir,filename);
 fs.writeFileSync(filepath,typeof body==='string'?body:JSON.stringify(body),{mode:0o600});
 return filepath;
}
function fakeGithub(proposal,{staleMain=false,branchExists=false}={}){
 const sourceBefore=fs.readFileSync(path.join(process.cwd(),SOURCE_PATH),'utf8').replace(REPLACEMENT,PRECONDITION);
 const testsBefore=fs.readFileSync(path.join(process.cwd(),TEST_PATH),'utf8').replace(REGRESSION,'');
 const base='/repos/jgaethle10/forge-operator';
 const commits=[],calls=[],branch=proposal.deterministic_branch;
 let proposedSource=null,proposedTest=null,opened=false;
 const content=(text,sha)=>({encoding:'base64',content:Buffer.from(text).toString('base64'),sha});
 const respond=async(method,route,body,allow404=false)=>{
  calls.push({method,route,body});
  if(method==='GET'&&route===base+'/git/ref/heads/main')return {object:{sha:sha40('c')}};
  if(method==='GET'&&route===base+'/contents/'+SOURCE_PATH+'?ref=main')
   return content(staleMain?sourceBefore+'//stale':sourceBefore,sha40('a'));
  if(method==='GET'&&route===base+'/contents/'+TEST_PATH+'?ref=main')
   return content(testsBefore,sha40('b'));
  if(method==='GET'&&route===base+'/git/ref/heads/'+encodeURIComponent(branch))
   return branchExists?{ref:'refs/heads/'+branch}:null;
  if(method==='GET'&&route.startsWith(base+'/pulls?state=all&'))return [];
  if(method==='POST'&&route===base+'/git/refs'){
   assert.equal(body.ref,'refs/heads/'+branch);
   assert.equal(body.sha,sha40('c'));
   commits.push('create_branch');return {ref:body.ref};
  }
  if(method==='PUT'&&route===base+'/contents/'+SOURCE_PATH){
   assert.equal(body.branch,branch);assert.equal(body.sha,sha40('a'));
   proposedSource=Buffer.from(body.content,'base64').toString('utf8');
   commits.push('write_source');return {content:{sha:sha40('d')}};
  }
  if(method==='PUT'&&route===base+'/contents/'+TEST_PATH){
   assert.equal(body.branch,branch);assert.equal(body.sha,sha40('b'));
   proposedTest=Buffer.from(body.content,'base64').toString('utf8');
   commits.push('write_test');return {content:{sha:sha40('e')}};
  }
  if(method==='POST'&&route===base+'/pulls'){
   assert.equal(body.base,'main');
   assert.equal(body.head,branch);
   assert.equal(body.draft,true);
   opened=true;commits.push('open_draft');return {number:701};
  }
  if(method==='GET'&&route===base+'/pulls/701'){
   assert.equal(opened,true);
   return {number:701,state:'open',draft:true,base:{ref:'main'},
    head:{ref:branch,repo:{full_name:'jgaethle10/forge-operator'}}};
  }
  if(method==='GET'&&route===base+'/contents/'+SOURCE_PATH+'?ref='+encodeURIComponent(branch))
   return content(proposedSource,sha40('d'));
  if(method==='GET'&&route===base+'/contents/'+TEST_PATH+'?ref='+encodeURIComponent(branch))
   return content(proposedTest,sha40('e'));
  throw Error('unexpected mock GitHub request: '+method+' '+route);
 };
 return {api:respond,calls,commits};
}
test('PR work has a forced signed Systemia human gate and exact digest-bound goal',()=>{
 const root=fixture();
 try{
  const {proposal}=plan(root);
  const goal=signedPrGoal(proposal,NOW);
  assert.equal(goal.mission_key,'evercraft-worlds-source-development');
  assert.equal(goal.tasks.length,1);
  assert.equal(goal.tasks[0].human_gate_required,true);
  assert.equal(goal.tasks[0].human_gate_unresolved,true);
  assert.equal(goal.tasks[0].provider_key,'github');
  assert.equal(goal.tasks[0].status,'pending');
  assert.equal(goal.next_work_keys.length,0);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('only exact two-file, branch-only, draft PR is submitted with independent content readback',async()=>{
 const root=fixture();
 try{
  const {proposal}=plan(root),fake=fakeGithub(proposal);
  let checkpoint=null;
  const result=await createExactReviewDraft({proposal,github:fake.api,
   beforeProviderMutation:intent=>{assert.equal(checkpoint,null);checkpoint=intent;}});
  assert.equal(result.exact_provider_refetch_passed,true);
  assert.equal(result.pr_number,701);
  assert.equal(result.draft,true);
  assert.equal(result.merged,false);
  assert.equal(result.deployments,0);
  assert.equal(result.independent_observer_accepted,false);
  assert.equal(checkpoint.candidate_digest,proposal.candidate_digest);
  assert.equal(checkpoint.automatic_replay_allowed,false);
  assert.deepEqual(fake.commits,['create_branch','write_source','write_test','open_draft']);
  assert.equal(fake.calls.filter(x=>x.method!=='GET').length,4);
  assert.equal(fake.calls.some(x=>x.route.endsWith('/main')&&x.method!=='GET'),false);
  assert.equal(fake.calls.some(x=>x.method==='DELETE'||x.method==='PATCH'),false);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('stale main, existing branch, or failed prewrite checkpoint blocks all mutations',async()=>{
 const root=fixture();
 try{
  const {proposal}=plan(root);
  for(const opts of [{staleMain:true},{branchExists:true},{}]){
   const mock=fakeGithub(proposal,opts);
   await assert.rejects(()=>createExactReviewDraft({proposal,github:mock.api,
    beforeProviderMutation:()=>{if(!opts.staleMain&&!opts.branchExists)throw Error('durable_intent_unavailable')}}),
    /drift|existing_branch|durable_intent_unavailable/);
   assert.equal(mock.calls.some(x=>x.method!=='GET'),false);
  }
  const mock=fakeGithub({...proposal,changed_files:[TEST_PATH]});
  await assert.rejects(()=>createExactReviewDraft({
   proposal:{...proposal,changed_files:[TEST_PATH]},github:mock.api,
   beforeProviderMutation:()=>{}}),/exact_two_file/);
  assert.equal(mock.calls.length,0);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('pinned GitHub client refuses alternate host and never logs authorization values',async()=>{
 let calls=0;
 const client=createPinnedGitHubClient({token:'ghs_'+('a'.repeat(45)),
  fetchFn:async(url,init)=>{
   calls++;assert.equal(url,'https://api.github.com/repos/jgaethle10/forge-operator/git/ref/heads/main');
   assert.equal(init.method,'GET');
   assert.equal(init.redirect,'error');
   assert.match(init.headers.Authorization,/^Bearer ghs_/);
   return {ok:true,status:200,json:async()=>({object:{sha:sha40('c')}})};
  }});
 await assert.rejects(()=>client('POST','https://hostile.example/steal',{}),/api_route_not_allowlisted/);
 await assert.rejects(()=>client('PUT','/repos/another/repo/contents/README.md',{}),/api_route_not_allowlisted/);
 assert.equal(calls,0);
 const result=await client('GET','/repos/jgaethle10/forge-operator/git/ref/heads/main');
 assert.equal(result.object.sha,sha40('c'));
 assert.equal(calls,1);
});
test('owner-private signed candidate creates one durable provider attempt and no automatic replay',async()=>{
 const root=fixture(),out=temp(),secrets=temp();
 try{
  const {review,proposal}=plan(root);
  const proof={tested_candidate_sha256:proposal.candidate_digest,
   prepatch_regression_failed:true,postpatch_regression_passed:true};
  const reviewFile=privateWrite(secrets,'review.json',review);
  const candidateFile=privateWrite(secrets,'candidate.json',{
   state:proposal.state,candidate_digest:proposal.candidate_digest,red_green_proof:proof});
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const signer=privateWrite(secrets,'signer.pub',publicKey.export({format:'pem',type:'spki'}));
  const token=privateWrite(secrets,'github.token','ghs_'+('a'.repeat(45)));
  const goal=signedPrGoal(proposal,NOW);
  const claims={schema:'evercraft.goal.human-approval-claims.v1',
   mission_key:goal.mission_key,goal_key:goal.goal_key,
   work_key:'submit-source-bound-draft-pr',scope:'systemia.goal.authorize',
   approved:true,receipt_ref:proposal.candidate_digest,
   issued_at:new Date(NOW.getTime()-60000).toISOString(),
   expires_at:new Date(NOW.getTime()+3600000).toISOString()};
  const permit={schema:'evercraft.goal.human-approval-envelope.v1',
   key_id:'systemia-human-gate-v1',claims,
   signature_base64:sign(null,humanApprovalMessage(claims),privateKey).toString('base64')};
  const permitFile=privateWrite(secrets,'permit.json',permit);
  verifyGoalHumanApproval({approval:permit,state:goal,workKey:'submit-source-bound-draft-pr',
   trustedPublicKeys:{'systemia-human-gate-v1':publicKey.export({format:'pem',type:'spki'})},now:NOW});
  const fake=fakeGithub(proposal);
  const fetchFn=async(url,init)=>{
   const method=init.method,route=url.replace('https://api.github.com','');
   const body=init.body?JSON.parse(init.body):null;
   const value=await fake.api(method,route,body);
   if(value===null)return {ok:false,status:404,json:async()=>({message:'Not Found'})};
   return {ok:true,status:method==='POST'?201:200,json:async()=>value};
  };
  const result=await runSignedDraftPrPublisher({
   root,privateDir:out,reviewFile,candidateFile,permitFile,trustKeyFile:signer,
   tokenFile:token,now:NOW,fetchFn});
  assert.equal(result.provider_readback_present,true);
  assert.equal(result.needs_independent_provider_reconciliation,true);
  assert.equal(result.state,'blocked');
  const goalState=await readGoalState(path.join(out,'goal-state.json'));
  assert.equal(goalState.tasks[0].attempt,1);
  assert.equal(goalState.tasks[0].status,'blocked');
  assert.equal(goalState.tasks[0].recovery_hold.auto_replay_allowed,false);
  assert.equal(goalState.tasks[0].recovery_hold.effect_state,'unknown');
  assert.deepEqual(fake.commits,['create_branch','write_source','write_test','open_draft']);
  await assert.rejects(()=>runSignedDraftPrPublisher({
   root,privateDir:out,reviewFile,candidateFile,permitFile,trustKeyFile:signer,
   tokenFile:token,now:NOW,fetchFn}),/previous_attempt/);
  assert.equal(fake.commits.length,4);
  assert.equal(fs.statSync(path.join(out,'submission-intent.json')).mode&0o777,0o600);
  assert.equal(fs.statSync(path.join(out,'provider-readback.json')).mode&0o777,0o600);
  assert.equal(JSON.stringify(result).includes('ghs_'),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});
  fs.rmSync(out,{recursive:true,force:true});fs.rmSync(secrets,{recursive:true,force:true})}
});
