// Owner-only, exactly scoped GitHub draft-PR submission for one vetted
// KAIDANCE code candidate. NEVER called from the read-only 5-minute CI run.
// Systemia persists an attempt BEFORE any provider write and intentionally
// quarantines the outcome for separate signed provider reconciliation.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {worldsSabanSourceFingerprint} from './kaidance-worlds-saban-review.mjs';
import {planMossmereSourceRepair,SOURCE_PATH,TEST_PATH} from './kaidance-source-patch-recipe.mjs';
import {createGoalState,admitGoalPlan,authorizeGoalWork} from './goal-runtime.mjs';
import {verifyGoalHumanApproval} from './goal-human-approval.mjs';
import {createGoalStateFile,mutateGoalState,readGoalState} from './goal-store.mjs';
import {createCapabilityRegistry} from './capability-runtime.mjs';
import {executePersistedGoalWork} from './goal-durable-dispatch.mjs';

const OWNER='jgaethle10',REPO='forge-operator',REMOTE='https://api.github.com';
const MISSION='evercraft-worlds-source-development';
const WORK='submit-source-bound-draft-pr';
const DIGEST=/^sha256:[a-f0-9]{64}$/;
const SHA40=/^[a-f0-9]{40}$/;
const hash=value=>'sha256:'+createHash('sha256').update(String(value)).digest('hex');
function privateFile(filename,repoRoot,max=65536){
 if(typeof filename!=='string'||!path.isAbsolute(filename))throw Error('kaidance_pr_private_absolute_file_required');
 const f=path.resolve(filename),root=path.resolve(repoRoot);
 if(f===root||f.startsWith(root+path.sep))throw Error('kaidance_pr_secret_in_source_checkout');
 const stat=fs.lstatSync(f);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||
  (stat.mode&0o077)!==0||stat.size<1||stat.size>max||
  typeof process.getuid==='function'&&stat.uid!==process.getuid())
  throw Error('kaidance_pr_private_file_trust_required');
 return fs.readFileSync(f,'utf8').trim();
}
function privateJson(file,root){return JSON.parse(privateFile(file,root,500000));}
function atomicJson(file,value){
 const dir=path.dirname(file);
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 if(fs.lstatSync(dir).isSymbolicLink()||fs.existsSync(file))
  throw Error('kaidance_pr_intent_already_exists_or_symlink');
 const tmp=file+'.'+process.pid+'.'+randomBytes(6).toString('hex')+'.tmp';
 try{fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,file)}
 finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}
}
function textFromContent(payload){
 if(payload?.encoding!=='base64'||typeof payload.content!=='string'||!SHA40.test(payload.sha||''))
  throw Error('kaidance_pr_github_content_identity_invalid');
 return Buffer.from(payload.content.replace(/\s+/g,''),'base64').toString('utf8');
}
export function signedPrGoal(candidate,now=new Date()){
 if(candidate?.state!=='candidate_proposed'||!DIGEST.test(candidate.candidate_digest||''))
  throw Error('kaidance_pr_candidate_digest_required');
 const goalKey='kaidance-draft-pr-'+candidate.candidate_digest.slice(7,31);
 return admitGoalPlan({state:createGoalState({
  missionKey:MISSION,goalKey,
  objective:'Submit precisely one reviewed, deterministic, branch-only Worlds source repair for human review',
  successCondition:'Independent GitHub provider observer reconciles exact draft PR branch and content digests',
  contextRefs:[candidate.candidate_digest,candidate.reviewed_source_fingerprint],
  now}),
  plan:[{work_key:WORK,work_type:'trust_change',impact:'trust_boundary',
   provider_key:'github',human_gate_required:true,
   dedupe_key:MISSION+'|'+candidate.candidate_digest,
   title:'Open exact, review-only GitHub PR (never merge)',
   assigned_agents:['systemia','kaidance:owner-pr-publisher'],
   dependency_keys:[]}],now});
}
export function createPinnedGitHubClient({token,fetchFn=fetch}={}){
 if(!/^(?:ghp_|ghs_|github_pat_)[A-Za-z0-9_]{20,}$/.test(token||''))
  throw Error('kaidance_pr_github_token_missing_or_invalid');
 return async function request(method,route,body=null,allow404=false){
  if(!/^\/repos\/jgaethle10\/forge-operator\/[a-zA-Z0-9._~!$&'()*+,;=:@%\/?=-]+$/.test(route)||
   route.includes('..')||route.includes('\\')||route.includes('#'))
   throw Error('kaidance_pr_api_route_not_allowlisted');
  const response=await fetchFn(REMOTE+route,{
   method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000),
   headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
    ...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  if(response.status===404&&allow404)return null;
  if(!response.ok)throw Error('kaidance_pr_provider_status_'+response.status);
  return response.json();
 };
}
export async function createExactReviewDraft({proposal,github,beforeProviderMutation}={}){
 if(proposal?.state!=='candidate_proposed'||
  proposal.changed_files?.join(',')!==[SOURCE_PATH,TEST_PATH].join(',')||
  !DIGEST.test(proposal.candidate_digest||'')||
  !/^kaidance\/source-repair-[a-f0-9]{24}$/.test(proposal.deterministic_branch||'')||
  typeof github!=='function'||typeof beforeProviderMutation!=='function')
  throw Error('kaidance_pr_exact_two_file_candidate_required');
 const base='/repos/'+OWNER+'/'+REPO;
 const branch=proposal.deterministic_branch;
 const [mainRef,source,testFile]=await Promise.all([
  github('GET',base+'/git/ref/heads/main'),
  github('GET',base+'/contents/'+SOURCE_PATH+'?ref=main'),
  github('GET',base+'/contents/'+TEST_PATH+'?ref=main')
 ]);
 const baseSha=mainRef?.object?.sha;
 if(!SHA40.test(baseSha||'')||
  hash(textFromContent(source))!==proposal.base_source_sha256||
  hash(textFromContent(testFile))!==proposal.base_test_sha256)
  throw Error('kaidance_pr_main_drift_requires_new_review');
 const existing=await github('GET',base+'/git/ref/heads/'+encodeURIComponent(branch),null,true);
 if(existing)throw Error('kaidance_pr_existing_branch_requires_manual_readback');
 const prs=await github('GET',base+'/pulls?state=all&head='+encodeURIComponent(OWNER+':'+branch)+'&base=main&per_page=100');
 if(!Array.isArray(prs)||prs.length)throw Error('kaidance_pr_existing_or_unverifiable_pr_hold');
 const intent={schema:'evercraft.kaidance.github-draft-pr-intent.v1',
  candidate_digest:proposal.candidate_digest,branch,base_sha:baseSha,
  source_sha256:proposal.new_source_sha256,test_sha256:proposal.new_test_sha256,
  repository:OWNER+'/'+REPO,base:'main',
  source_paths:[SOURCE_PATH,TEST_PATH],
  external_effect_state:'unknown_until_independent_reconciliation',
  automatic_replay_allowed:false,created_at:new Date().toISOString()};
 // Persist an immutable intent before *any* provider mutation. A timeout
 // between branch, PUT files, and PR means manual refetch, never replay.
 beforeProviderMutation(intent);
 await github('POST',base+'/git/refs',{ref:'refs/heads/'+branch,sha:baseSha});
 await github('PUT',base+'/contents/'+SOURCE_PATH,{
  message:'fix(worlds): reject invalid inhabitant positions [KAIDANCE review]',
  branch,sha:source.sha,content:Buffer.from(proposal.new_source_text).toString('base64')});
 await github('PUT',base+'/contents/'+TEST_PATH,{
  message:'test(worlds): verify invalid positions fail closed [KAIDANCE review]',
  branch,sha:testFile.sha,content:Buffer.from(proposal.new_test_text).toString('base64')});
 const pr=await github('POST',base+'/pulls',{
  title:'KAIDANCE reviewed repair: reject malformed Mossmere inhabitant positions',
  body:'Deterministic source-repair candidate '+proposal.candidate_digest+
  '\n\nSource review: '+proposal.review_goal_key+
  '\n\nOnly two allowlisted paths were changed. The PR is a draft; independent CI, human review and deployment verification remain mandatory.',
  head:branch,base:'main',draft:true,maintainer_can_modify:true});
 if(!Number.isSafeInteger(pr?.number)||pr.number<=0)
  throw Error('kaidance_pr_provider_response_without_number');
 const [readback,finalSource,finalTest]=await Promise.all([
  github('GET',base+'/pulls/'+pr.number),
  github('GET',base+'/contents/'+SOURCE_PATH+'?ref='+encodeURIComponent(branch)),
  github('GET',base+'/contents/'+TEST_PATH+'?ref='+encodeURIComponent(branch))
 ]);
 if(readback?.number!==pr.number||readback?.state!=='open'||
    readback?.draft!==true||readback?.base?.ref!=='main'||
    readback?.head?.ref!==branch||readback?.head?.repo?.full_name!==OWNER+'/'+REPO||
    hash(textFromContent(finalSource))!==proposal.new_source_sha256||
    hash(textFromContent(finalTest))!==proposal.new_test_sha256)
   throw Error('kaidance_pr_postwrite_refetch_mismatch_requires_owner_check');
 return {schema:'evercraft.kaidance.github-draft-pr-provider-readback.v1',
  repository:OWNER+'/'+REPO,pr_number:pr.number,
  pr_url:'https://github.com/'+OWNER+'/'+REPO+'/pull/'+pr.number,
  draft:true,branch,base:'main',
  source_sha256:proposal.new_source_sha256,test_sha256:proposal.new_test_sha256,
  exact_provider_refetch_passed:true,merged:false,deployments:0,
  source_code_review_approved:false,independent_observer_accepted:false,
  receipt_ref:hash(JSON.stringify({number:pr.number,branch,
   source:proposal.new_source_sha256,test:proposal.new_test_sha256}))};
}
export async function runSignedDraftPrPublisher({
 root,privateDir,reviewFile,candidateFile,permitFile,trustKeyFile,tokenFile,
 now=new Date(),fetchFn=fetch
}={}){
 const repo=path.resolve(root||''),out=path.resolve(privateDir||'');
 if(!root||!privateDir||!path.isAbsolute(out)||out===repo||
    out.startsWith(repo+path.sep))throw Error('kaidance_pr_private_operator_directory_required');
 if(fs.existsSync(out)){
  const st=fs.lstatSync(out);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)
   throw Error('kaidance_pr_private_operator_directory_untrusted');
 }else fs.mkdirSync(out,{recursive:true,mode:0o700});
 if(fs.existsSync(path.join(out,'submission-intent.json'))||
    fs.existsSync(path.join(out,'provider-readback.json')))
  throw Error('kaidance_pr_previous_attempt_requires_manual_reconciliation');
 const review=privateJson(reviewFile,repo),candidate=privateJson(candidateFile,repo);
 const source=fs.readFileSync(path.join(repo,SOURCE_PATH),'utf8');
 const testFile=fs.readFileSync(path.join(repo,TEST_PATH),'utf8');
 const proposal=planMossmereSourceRepair({sourceText:source,testText:testFile,
  sourceFingerprint:worldsSabanSourceFingerprint(repo),review});
 if(proposal.state!=='candidate_proposed'||
    proposal.candidate_digest!==candidate.candidate_digest||
    candidate?.red_green_proof?.tested_candidate_sha256!==proposal.candidate_digest||
    candidate.red_green_proof.prepatch_regression_failed!==true||
    candidate.red_green_proof.postpatch_regression_passed!==true)
  throw Error('kaidance_pr_candidate_and_proof_not_current');
 const desired=signedPrGoal(proposal,now);
 const permit=privateJson(permitFile,repo);
 if(permit?.claims?.receipt_ref!==proposal.candidate_digest)
  throw Error('kaidance_pr_signed_exact_patch_digest_required');
 const publicKey=privateFile(trustKeyFile,repo);
 const trusted={'systemia-human-gate-v1':publicKey};
 // Verify the exact candidate digest and scoped owner signature BEFORE
 // creating durable state or accessing the GitHub credential.
 verifyGoalHumanApproval({approval:permit,state:desired,workKey:WORK,
  trustedPublicKeys:trusted,now});
 const token=privateFile(tokenFile,repo);
 const api=createPinnedGitHubClient({token,fetchFn});
 const goalPath=path.join(out,'goal-state.json');
 await createGoalStateFile(goalPath,desired,{now});
 await mutateGoalState(goalPath,state=>authorizeGoalWork({
  state,workKey:WORK,approval:permit,trustedPublicKeys:trusted,now
 }));
 const registry=createCapabilityRegistry([{
  capability_key:'kaidance.github.review-only-draft',
  work_types:['trust_change'],provider_key:'github',
  human_gate_required:true,authority:'bounded',
  execute:async()=>{
   const readback=await createExactReviewDraft({proposal,github:api,
    beforeProviderMutation:intent=>atomicJson(path.join(out,'submission-intent.json'),intent)});
   atomicJson(path.join(out,'provider-readback.json'),readback);
   return {result:'complete',receipt_ref:readback.receipt_ref,
    evidence_refs:[proposal.candidate_digest]};
  }
 }]);
 // Existing durable dispatcher correctly quarantines ALL stateful producer
 // claims, even a refetched PR, pending separate observer/reconciliation.
 const receipt=await executePersistedGoalWork({
  filePath:goalPath,workKey:WORK,registry,trustedPublicKeys:trusted,now});
 const saved=await readGoalState(goalPath);
 return {schema:'evercraft.kaidance.signed-pr-submission.v1',
  attempt_checkpoint_persisted:true,goal_key:saved.goal_key,
  state:saved.tasks[0].status,
  needs_independent_provider_reconciliation:true,
  provider_mutation_performed:fs.existsSync(path.join(out,'submission-intent.json')),
  provider_readback_present:fs.existsSync(path.join(out,'provider-readback.json')),
  no_main_writes:true,no_merge_authority:true,auto_replay_allowed:false,
  dispatcher_result:receipt.result};
}
