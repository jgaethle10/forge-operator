// Kaidance's existing 300s company heartbeat owns this read-only creative lane.
// Source proof and registered Saban art direction are work, NOT generated assets.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {loadMultiplicationRegistry,resolveMultiplicationContract} from '../saban/multiplier.mjs';
import {admitMultiplicationRequest} from '../saban/admission.mjs';
import {runRegisteredAssignment} from '../saban/registered-worker.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const SHA=s=>'sha256:'+createHash('sha256').update(s).digest('hex');
const STATE='evercraft.kaidance.creative-development-state.v1';
const KEYS=['evercraft-graphics','leiland-observatory','saban-operations-graphics','work-saban-proof'];
const PREFIX={'leiland-observatory':['public/leiland/'],
 'evercraft-graphics':['public/kaidance/','systemia/media-studio/','systemia/graphics-command/'],
 'work-saban-proof':['public/work-saban/demo/'],
 'saban-operations-graphics':['systemia/saban/','systemia/graphics-command/']};
const RELEASE_GATES=Object.freeze({
 'work-saban-proof':Object.freeze({
   pr_number:1868,required_source:'public/work-saban/demo/visual-replay.mjs',source:'github_draft_pr'
 }),
 'saban-operations-graphics':Object.freeze({
   pr_number:1914,required_source:'systemia/graphics-command/saban-transition-view.mjs',source:'github_draft_pr'
 })
});
function releaseGate(root,projectKey){
 const gate=RELEASE_GATES[projectKey];
 if(!gate)return null;
 const target=path.resolve(root,gate.required_source);
 const exists=fs.existsSync(target);
 if(exists)source(root,gate.required_source); // enforce realpath and symlink guard
 return {pr_number:gate.pr_number,source_ref:'github:jgaethle10/forge-operator:pull:'+gate.pr_number,
   phase:exists?'source_present_acceptance_required':'candidate_not_in_checked_out_source',
   authority:'systemia_review_required',code_write_authorized:false,
   merge_authorized:false,deploy_authorized:false,publication_authorized:false,
   runtime_receipts_verified:false,visual_acceptance_verified:false,
   release_readiness_verified:false};
}
const ROLES=new Set(['beauty_judge','world_builder','documentary_truth_guard','brand_art_director','data_graphics_director']);
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
export function validateCreativeRegistry(m){
 if(m?.schema!=='evercraft.kaidance.creative-development-registry.v1'||
  m.heartbeat_seconds!==300||m.source_only!==true||
  m.automatic_code_write!==false||m.automatic_publication!==false||
  m.registered_saban_software!=='fallen-creative-council'||
  m.authority?.github_code_write!==false||m.authority?.auto_deploy!==false||
  m.authority?.auto_publish!==false||m.authority?.provider_calls!==false||
  !Array.isArray(m.projects)||m.projects.length!==4||
  m.projects.map(p=>p.project_key).sort().join(',')!==KEYS.join(','))
   throw Error('creative_registry_untrusted');
 for(const p of m.projects){
  if(!Array.isArray(p.source_files)||p.source_files.length<3||p.source_files.length>10||
   (RELEASE_GATES[p.project_key]?
     JSON.stringify(p.review_gate)!==JSON.stringify(RELEASE_GATES[p.project_key]):
     p.review_gate!==undefined)||
   new Set(p.source_files).size!==p.source_files.length||
   p.source_files.some(f=>typeof f!=='string'||!PREFIX[p.project_key].some(prefix=>f.startsWith(prefix))||
    !/^[a-z0-9./-]+$/.test(f)||f.includes('..')||f.includes('//'))||
   !/^tests\/[a-z0-9-]+\.test\.mjs$/.test(p.proof_test||'')||
   !Array.isArray(p.review_roles)||p.review_roles.length!==3||
   new Set(p.review_roles).size!==3||p.review_roles.some(r=>!ROLES.has(r))||
   typeof p.design_goal!=='string'||p.design_goal.length>320)
   throw Error('creative_project_unbounded');
 }
 return m;
}
function source(root,relative){
 if(typeof relative!=='string'||! /^(?:public|systemia|tests)\/[a-z0-9./-]+$/.test(relative)||
  relative.includes('..')||relative.includes('//'))throw Error('creative_source_path_invalid');
 const file=path.resolve(root,relative),real=fs.realpathSync(file),base=fs.realpathSync(root);
 const stat=fs.lstatSync(file);
 if(!file.startsWith(path.resolve(root)+path.sep)||!real.startsWith(base+path.sep)||
  stat.isSymbolicLink()||!stat.isFile()||stat.size>2*1024*1024)
  throw Error('creative_source_untrusted');
 return file;
}
export function creativeFingerprint(root,p){
 const h=createHash('sha256');
 for(const rel of [...p.source_files,p.proof_test].sort()){
  h.update(rel+'\0');h.update(fs.readFileSync(source(root,rel)));h.update('\0');
 }
 return 'sha256:'+h.digest('hex');
}
function atomic(f,value){
 fs.mkdirSync(path.dirname(f),{recursive:true,mode:0o700});
 if(fs.lstatSync(path.dirname(f)).isSymbolicLink()||
  fs.existsSync(f)&&fs.lstatSync(f).isSymbolicLink())throw Error('creative_output_symlink');
 const tmp=f+'.'+process.pid+'.'+randomBytes(5).toString('hex')+'.tmp';
 try{fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  fs.renameSync(tmp,f);fs.chmodSync(f,0o600)}
 finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}
}
function privateOutput(repo,outDir){
 if(!outDir||!path.isAbsolute(outDir))throw Error('creative_absolute_out_required');
 const out=path.resolve(outDir);
 if(out===repo||out.startsWith(repo+path.sep)&&!out.startsWith(path.join(repo,'artifacts')+path.sep))
  throw Error('creative_source_tree_write_refused');
 fs.mkdirSync(out,{recursive:true,mode:0o700});
 if(fs.lstatSync(out).isSymbolicLink()||(fs.statSync(out).mode&0o022)!==0)
  throw Error('creative_output_untrusted');
 return out;
}
export async function runKaidanceCreativeDevelopment({root=ROOT,outDir,now=new Date(),
 registeredAssignment=runRegisteredAssignment,spawn=spawnSync}={}){
 const at=new Date(now),repo=path.resolve(root);
 if(!Number.isFinite(+at))throw Error('creative_bad_clock');
 const out=privateOutput(repo,outDir);
 const m=validateCreativeRegistry(read(path.join(repo,'registry/kaidance-creative-development.v1.json')));
 const tick=Math.floor(+at/300000),stateFile=path.join(out,'state.json');
 const previous=fs.existsSync(stateFile)?read(stateFile):null;
 if(previous&&(previous.schema!==STATE||!Number.isInteger(previous.tick)))throw Error('creative_state_untrusted');
 if(previous?.tick>tick)throw Error('creative_clock_rollback');
 if(previous?.tick===tick)return {duplicate:true,tick,executed:false};
 const state=previous||{schema:STATE,tick:-1,projects:{}};
 const reg=loadMultiplicationRegistry(path.join(repo,'systemia/saban/multiplication-registry.json'));
 const contract=resolveMultiplicationContract('fallen-creative-council',reg);
 if(contract.side_effects?.default!=='deny'||contract.side_effects?.external_network!==false||
  contract.side_effects?.production_provider_calls!==false||
  contract.side_effects?.automatic_publication!==false||
  contract.side_effects?.canon_mutation!==false||
  contract.side_effects?.source_media_write!==false)throw Error('creative_worker_not_readonly');
 const admission=admitMultiplicationRequest({contract,
  requestedLogicalAgents:1,requestedPhysicalWorkers:1,requestedWorkItems:1,
  requestedAttempts:1,budget:{max_logical_agents:1,max_physical_workers:1,
   max_work_items:1,max_attempts_per_job:1}});
 if(!admission.admitted||admission.grant.logical_agents!==1)throw Error('creative_capacity_denied');
 let changed=0,held=0;
 const projects=[];
 for(const p of m.projects){
  const fingerprint=creativeFingerprint(repo,p);
  let prior=state.projects[p.project_key]||{},status='unchanged_source',ran=false;
  if(prior.pending){status='held_unreconciled_checkpoint';held++}
  else if(prior.reviewed_fingerprint!==fingerprint){
   const pending={fingerprint,checkpoint_at:at.toISOString(),
    dedupe_key:m.mission_key+'|'+p.project_key+'|'+fingerprint};
   prior={...prior,pending};
   state.projects[p.project_key]=prior;atomic(stateFile,state);
   try{
    const proof=spawn(process.execPath,['--test',source(repo,p.proof_test)],{
     cwd:repo,encoding:'utf8',timeout:30000,maxBuffer:65536,
     env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:process.env.HOME||os.homedir()}});
    if(proof?.status!==0||proof.error)throw Error('creative_source_proof_failed');
    const notes=[];
    for(const role of p.review_roles){
     const assignment={agent_id:'kaidance-'+p.project_key+'-'+role,
      idempotency_key:pending.dedupe_key+'|'+role,
      role,work:{kind:'visual_source_review',key:p.project_key},
      item:{raw:{shot:{id:p.project_key,storyPrompt:p.design_goal,
       intent:p.design_goal+' Conceptual data visualization and source states.',
       durationSec:18,aspectRatio:'9:16',beat:'proof',
       sourceType:'conceptual_visualization',coverage:[]}}}};
     const receipt=await registeredAssignment({software:'fallen-creative-council',
      assignment,rootDir:repo,executionContext:{}});
     const note=receipt?.result;
     if(receipt?.software_id!=='fallen-creative-council'||
      note?.schema!=='evercraft.fallen.creative-council-note.v1'||
      note.status!=='completed'||note.role!==role||note.shot_id!==p.project_key||
      !Array.isArray(note.findings)||note.findings.length||
      note.boundaries?.no_provider_call_implied!==true||
      note.boundaries?.no_generated_asset_implied!==true||
      note.boundaries?.no_publication_authority!==true||
      note.boundaries?.no_documentary_claim_from_synthetic_media!==true||
      !Array.isArray(note.proposal?.directives)||note.proposal.directives.length>6)
      throw Error('creative_registered_review_invalid');
     notes.push({role,category:note.proposal.category,
      directives:note.proposal.directives.slice(0,4).map(s=>String(s).slice(0,240)),
      reject_if:(note.proposal.reject_if||[]).slice(0,8)});
    }
    const receiptRef=SHA(JSON.stringify({fingerprint,project_key:p.project_key,notes}));
    prior={reviewed_fingerprint:fingerprint,reviewed_at:at.toISOString(),review_receipt_ref:receiptRef,notes};
    state.projects[p.project_key]=prior;atomic(stateFile,state);
    status='source_review_completed';ran=true;changed++;
   }catch{
    // Uncertain Saban outcome remains a durable hold. Never auto-replay it.
    state.projects[p.project_key]=prior;atomic(stateFile,state);
    status='held_proof_or_review';held++;
   }
  }
  projects.push({project_key:p.project_key,title:p.title,source_fingerprint:fingerprint,
   status,release_gate:releaseGate(repo,p.project_key),review_run_this_tick:ran,
   review_receipt_ref:state.projects[p.project_key]?.review_receipt_ref||null,
   last_reviewed_at:state.projects[p.project_key]?.reviewed_at||null,
   verified_source_tests_this_tick:ran,
   actual_code_changes:0,generated_graphics:0});
 }
 const queue={schema:'evercraft.kaidance.creative-development-queue.v1',
  observed_at:at.toISOString(),mission_key:m.mission_key,execution_authorized:false,
  candidates:projects.map(p=>{
   const stateRow=state.projects[p.project_key]||{};
   return {work_key:p.project_key+':reviewable-visual-patch',project_key:p.project_key,
    source_fingerprint:p.source_fingerprint,status:p.status,
    evidence_ref:stateRow.review_receipt_ref||null,
    art_direction:(stateRow.notes||[]).map(n=>({role:n.role,
     directives:n.directives,reject_if:n.reject_if})),
    release_gate:p.release_gate,
    next_action:stateRow.pending?'systemia_reconcile_unfinished_readonly_review':
     p.release_gate?.phase==='candidate_not_in_checked_out_source'?
       'review_existing_graphics_pr_and_merge_only_after_owner_acceptance':
     p.release_gate?.phase==='source_present_acceptance_required'?
       'verify_source_visual_tests_and_authorized_node_receipts_before_release':
       'develop_tested_isolated_graphics_patch_for_review',
    requires_systemia_approval:true,code_write_authorized:false,
    auto_publish_authorized:false};
  })};
 const report={schema:'evercraft.kaidance.creative-development.v1',
  observed_at:at.toISOString(),tick,heartbeat_seconds:300,
  scheduler:'existing_company_heartbeat',projects,
  source_review_completed_this_tick:changed,held_projects:held,
  code_changes:0,visual_assets_generated:0,autonomous_code_generation:false,
  real_browser_render_executed:false,publication_authorized:false,
  limitations:['GitHub cron is best effort','source proof is not visual acceptance',
   'creative review is not code generation','no private inference or live model activity inferred']};
 const snapshot={schema:'evercraft.kaidance.mission-snapshot.v1',
  snapshot_ref:SHA(JSON.stringify({tick,projects:projects.map(x=>x.source_fingerprint),changed,held})),
  observed_at:at.toISOString(),counts:{scanned:m.projects.length,changed,admitted:0,held},
  evidence_refs:projects.flatMap(p=>[p.source_fingerprint,...(p.review_run_this_tick?[p.review_receipt_ref]:[])]).slice(0,12)};
 atomic(path.join(out,'latest.json'),report);atomic(path.join(out,'queue.json'),queue);
 atomic(path.join(out,'mission-snapshot.json'),snapshot);
 state.tick=tick;atomic(stateFile,state);
 return {duplicate:false,tick,executed:true,report,queue,snapshot};
}
