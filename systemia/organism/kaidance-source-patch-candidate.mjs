// One bounded KAIDANCE code-improvement proposal and red/green source test.
// This never edits the canonical source tree, writes a branch, opens a PR,
// merges, deploys or uses a GitHub credential.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {worldsSabanSourceFingerprint} from './kaidance-worlds-saban-review.mjs';
import {SOURCE_PATH,TEST_PATH,planMossmereSourceRepair} from './kaidance-source-patch-recipe.mjs';
const DEFAULT_ROOT=fileURLToPath(new URL('../../',import.meta.url));
const sha=v=>'sha256:'+createHash('sha256').update(String(v)).digest('hex');
const stageFiles=[
 'public/worlds/world-bridge.mjs','tests/world-bridge.test.mjs',
 'public/worlds/world-core.mjs','tests/world-core.test.mjs'
];
function atomicJson(file,value){
 const dir=path.dirname(file);
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 if(fs.lstatSync(dir).isSymbolicLink()||
    fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())
  throw Error('kaidance_source_candidate_output_symlink');
 const tmp=file+'.'+process.pid+'.'+randomBytes(6).toString('hex')+'.tmp';
 try{fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,file)}
 finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}
}
function readChecked(root,relative){
 if(!stageFiles.includes(relative))throw Error('kaidance_code_path_not_allowlisted');
 const file=path.join(root,relative);
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.size>100000)throw Error('kaidance_code_source_untrusted');
 return fs.readFileSync(file,'utf8');
}
function runNodeTests(cwd){
 const result=spawnSync(process.execPath,['--test','tests/world-core.test.mjs','tests/world-bridge.test.mjs'],{
  cwd,encoding:'utf8',timeout:30000,maxBuffer:200000,
  env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:cwd,TMPDIR:cwd}
 });
 return {exit_code:result.status,passed:result.status===0&&!result.error,
  timeout:result.error?.code==='ETIMEDOUT',stdout_hash:sha(result.stdout||''),
  stderr_hash:sha(result.stderr||'')};
}
function proveRecipe(root,proposal){
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-kaidance-source-proof-'));
 try{
  // The files and test commands are hardcoded. No caller-controlled shell,
  // test path, network URL, arbitrary patch syntax or executable is accepted.
  for(const rel of stageFiles){
   const target=path.join(scratch,rel);
   fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
   fs.writeFileSync(target,readChecked(root,rel),{mode:0o600});
  }
  // Install the proposed regression BEFORE the patch to demonstrate the
  // exact observed vulnerability instead of only a successful test run.
  fs.writeFileSync(path.join(scratch,TEST_PATH),proposal.new_test_text,{mode:0o600});
  const red=runNodeTests(scratch);
  if(red.passed||red.timeout)throw Error('kaidance_source_candidate_red_proof_not_observed');
  fs.writeFileSync(path.join(scratch,SOURCE_PATH),proposal.new_source_text,{mode:0o600});
  const green=runNodeTests(scratch);
  if(!green.passed)throw Error('kaidance_source_candidate_green_proof_failed');
  return {schema:'evercraft.kaidance.source-red-green-proof.v1',
   prepatch_regression_failed:true,postpatch_regression_passed:true,
   test_command:'node --test tests/world-core.test.mjs tests/world-bridge.test.mjs',
   before:red,after:green,tested_candidate_sha256:proposal.candidate_digest,
   private_test_scratch_removed:true,isolated_from_source_checkout:true,
   network_isolation_independently_proven:false};
 }finally{fs.rmSync(scratch,{recursive:true,force:true})}
}
export function runKaidanceSourceRepairCandidate({root=DEFAULT_ROOT,outDir,
 now=new Date(),reviewFile,prover=proveRecipe}={}){
 const repo=path.resolve(root),out=path.resolve(outDir||'');
 if(!outDir||!path.isAbsolute(outDir))throw Error('kaidance_code_absolute_output_required');
 if(out===repo||out.startsWith(repo+path.sep)&&!out.includes(path.sep+'artifacts'+path.sep))
  throw Error('kaidance_code_output_not_allowed');
 const at=new Date(now);
 if(!Number.isFinite(at.getTime()))throw Error('kaidance_code_invalid_clock');
 if(!reviewFile||!path.isAbsolute(reviewFile))throw Error('kaidance_code_review_receipt_required');
 const reviewPath=path.resolve(reviewFile);
 if(fs.lstatSync(reviewPath).isSymbolicLink())throw Error('kaidance_code_review_symlink');
 const review=JSON.parse(fs.readFileSync(reviewPath,'utf8'));
 const fingerprint=worldsSabanSourceFingerprint(repo);
 const sourceText=readChecked(repo,SOURCE_PATH),testText=readChecked(repo,TEST_PATH);
 const proposal=planMossmereSourceRepair({sourceText,testText,
  sourceFingerprint:fingerprint,review});
 const oldStateFile=path.join(out,'state.json');
 const prior=fs.existsSync(oldStateFile)?JSON.parse(fs.readFileSync(oldStateFile,'utf8')):null;
 if(prior&&prior.schema!=='evercraft.kaidance.source-candidate-state.v1')
  throw Error('kaidance_code_state_schema_conflict');
 let proof=null,newlyProven=false;
 if(proposal.state==='candidate_proposed'){
  if(prior?.candidate_digest===proposal.candidate_digest&&
      prior?.proof?.postpatch_regression_passed===true&&
      prior?.review_goal_key===review.goal_key){
   proof=prior.proof;
  }else{
   proof=prover(repo,proposal);
   if(proof?.schema!=='evercraft.kaidance.source-red-green-proof.v1'||
       proof.postpatch_regression_passed!==true||
       proof.prepatch_regression_failed!==true||
       proof.tested_candidate_sha256!==proposal.candidate_digest)
    throw Error('kaidance_code_candidate_evidence_untrusted');
   newlyProven=true;
  }
 }
 const state={schema:'evercraft.kaidance.source-candidate-state.v1',
  source_fingerprint:fingerprint,
  candidate_digest:proposal.candidate_digest||null,review_goal_key:review.goal_key,
  state:proposal.state,proof,first_verified_at:newlyProven?at.toISOString():(prior?.first_verified_at||null),
  last_observed_at:at.toISOString(),github_pr_created:false,changes_to_main:0};
 const publicCandidate={
  ...Object.fromEntries(Object.entries(proposal).filter(([k])=>!['new_source_text','new_test_text'].includes(k))),
  red_green_proof:proof,
  code_changed_in_source_checkout:false,
  reviewed_pull_request_submitted:false,
  git_main_or_other_branch_mutated:false,
  private_owner_pr_writer_not_called:true
 };
 const report={
  schema:'evercraft.kaidance.code-improvement-beat.v1',
  observed_at:at.toISOString(),source_fingerprint:fingerprint,
  current_review_goal:review.goal_key,
  state:proposal.state,
  new_verified_candidate_this_cycle:newlyProven,
  candidate_digest:proposal.candidate_digest||null,
  candidate_source_files:proposal.changed_files,
  red_green_proof:proof?.postpatch_regression_passed===true,
  canonical_source_changes:0,
  remote_prs_created:0,
  worker_model_inference_executed:false,
  authority:'read_only_candidate_proof_only'
 };
 const changed=newlyProven?1:0,held=proposal.state.startsWith('hold_')?1:0;
 const snapshot={schema:'evercraft.kaidance.mission-snapshot.v1',
  snapshot_ref:sha(JSON.stringify({review_goal:review.goal_key,
   fingerprint,proposal_state:proposal.state,
   digest:proposal.candidate_digest||null,newlyProven,held})),
  observed_at:at.toISOString(),
  counts:{scanned:1,changed:changed+held,admitted:0,held},
  evidence_refs:[fingerprint,...(review.receipt_refs||[]),
   ...(proposal.candidate_digest?[proposal.candidate_digest]:[])].slice(0,20)
 };
 atomicJson(path.join(out,'candidate.json'),publicCandidate);
 atomicJson(path.join(out,'latest.json'),report);
 atomicJson(path.join(out,'mission-snapshot.json'),snapshot);
 atomicJson(oldStateFile,state);
 return {report,snapshot,candidate:publicCandidate};
}
