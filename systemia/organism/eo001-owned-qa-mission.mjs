#!/usr/bin/env node
/**
 * EO-001 owned internal QA -> Systemia mission bridge.
 *
 * One bounded local worker path, NOT a new agent or authority. Uses the
 * original Forge QA, durable Systemia goal-store, idempotent artifact digest,
 * restart reconciliation, and an unexecutable external-message gate.
 * Never sends, deploys, starts a model, changes node admission or touches Base44.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createGoalState,admitGoalPlan,startGoalWork,recordGoalOutcome,goalSnapshot}
  from './goal-runtime.mjs';
import {createGoalStateFile,readGoalState,mutateGoalState} from './goal-store.mjs';

const MISSION='EO-001';
const GOAL='eo001-gate0-evidence-continuity';
const WORK='forge-private-evidence-qa';
const EXIT='private-external-delivery-reconciliation';
const NO_QWEN='READ_ONLY_QA_NO_MODEL_RUN';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const own=stat=>stat.uid===process.getuid() && (stat.mode&0o077)===0;
const safeKey=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fileMax=262144;

function privateDir(dir,create=false){
  if(create)fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const st=fs.lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink()||!own(st))
    throw Error('owned_private_directory_required');
  return dir;
}
function privateBytes(file,limit=fileMax){
  if(!path.isAbsolute(file))throw Error('private_absolute_path_required');
  const flags=fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK;
  let fd;
  try{
    fd=fs.openSync(file,flags);
    const st=fs.fstatSync(fd);
    if(!st.isFile()||st.nlink!==1||!own(st)||st.size<1||st.size>limit)
      throw Error('owned_private_regular_file_required');
    const chunks=[];let size=0,b;
    do{
      b=Buffer.alloc(Math.min(65536,limit+1-size));
      const n=fs.readSync(fd,b,0,b.length,null);
      if(n===0)break;
      chunks.push(b.subarray(0,n));size+=n;
      if(size>limit)throw Error('private_file_too_large');
    }while(true);
    return Buffer.concat(chunks);
  }finally{if(fd!==undefined)fs.closeSync(fd);}
}
function privateJson(file,limit=65536){
  return JSON.parse(privateBytes(file,limit).toString('utf8'));
}
function selectHandoff(base){
  const candidates=[];
  for(const dirent of fs.readdirSync(base,{withFileTypes:true})){
    if(!dirent.isDirectory()||!/^gate0-[A-Za-z0-9_-]{4,80}$/.test(dirent.name))continue;
    const dir=privateDir(path.join(base,dirent.name));
    const bundle=path.join(dir,'gate0-private-handoff.zip');
    if(fs.existsSync(bundle))candidates.push({dir,bundle,
      receipt:path.join(dir,'sanitized-receipt.json'),
      review:path.join(dir,'independent-review.json')});
  }
  if(candidates.length!==1)throw Error('exactly_one_private_eo001_handoff_required');
  return candidates[0];
}
function qaValid(item,bundleSha){
  return item && item.schema==='evercraft.eo001.forge-evidence-qa.v1' &&
    item.status==='AUTOMATED_QA_PASSED_PRIVATE_HANDOFF_CANDIDATE' &&
    item.mission===MISSION && item.stage==='gate0_evidence_handoff' &&
    item.bundle_sha256===bundleSha && item.lanes &&
    Object.keys(item.lanes).sort().join('|')===
      ['forge_integrity','privacy_allowlist','lab_receipt_consistency',
       'provenance_separation','external_send_authority'].sort().join('|') &&
    ['forge_integrity','privacy_allowlist','lab_receipt_consistency','provenance_separation']
      .every(key=>item.lanes[key]==='PASS') &&
    item.lanes.external_send_authority==='HELD' &&
    item.external_send_authorized===false &&
    item.independent_lab_inspection_complete===false &&
    item.physical_inference_attested===false &&
    item.four_scenario_model_success===false &&
    item.production_authority_granted===false &&
    item.manual_json_inspection_required_for_this_contract===false &&
    /^[a-f0-9]{40}$/.test(item.lab_reviewer_source_pin);
}
function plan(){
  const goal=createGoalState({goalKey:GOAL,missionKey:MISSION,
    objective:'Validate private Gate 0 evidence, reconcile outbound delivery with observed proof, and preserve Lab follow-up',
    successCondition:'Lab independently inspects the privately delivered bundle and records research observations.'});
  return admitGoalPlan({state:goal,plan:[
    {work_key:WORK,work_type:'qa',title:'Run internal independent Forge evidence review',
      dedupe_key:MISSION+':gate0:forge-qa',assigned_agents:[],
      dependency_keys:[]},
    {work_key:EXIT,work_type:'external_message',impact:'external_message',
      title:'Verify recipient-bound private delivery through an approved owned channel',
      dedupe_key:MISSION+':gate0:delivery',dependency_keys:[WORK],
      human_gate_required:true,assigned_agents:[]},
    {work_key:'lab-independent-inspection',work_type:'research',
      title:'Reconcile Chandra Lab inspection and unresolved experimental criteria',
      dependency_keys:[EXIT],assigned_agents:[]}
  ]});
}
function outputSnapshot(state,extra={}){
  const snap=goalSnapshot(state);
  const qa=snap.counts.complete>=1?'PASS':'HELD';
  return {
    schema:'evercraft.systemia.eo001-owned-qa-mission-status.v1',
    mission_key:MISSION,
    goal_key:GOAL,
    state_revision:snap.revision,
    internal_qa:qa,
    mission_status:snap.status,
    external_delivery_state:'NOT_VERIFIED_BY_OWNED_PROVIDER',
    external_message_authorized:false,
    lab_independent_inspection:'PENDING',
    commissioned_agent_execution_verified:false,
    worker_kind:'owned_deterministic_qa_not_commissioned_agent',
    model_execution:NO_QWEN,
    no_base44_contact:true,
    ...extra
  };
}

/**
 * A read-only local QA attempt may safely be resumed, unlike payment/outreach
 * delivery. The stable output name prevents forged "retry until pass" history.
 */
export async function runEo001OwnedQaMission({home=os.homedir(),qaScript=null,
  spawn=spawnSync}={}){
  const base=privateDir(path.join(home,'.local/state/evercraft/eo001-handoff'));
  const stateDir=privateDir(path.join(base,'systemia-missions'),true);
  const file=path.join(stateDir,'eo001-gate0.goal.json');
  if(!fs.existsSync(file)){
    await createGoalStateFile(file,plan());
  }
  let state=await readGoalState(file);
  if(state.goal_key!==GOAL||state.mission_key!==MISSION)
    throw Error('systemia_mission_identity_mismatch');
  const inputs=selectHandoff(base);
  const bundleHash=sha(privateBytes(inputs.bundle));
  const task=state.tasks.find(t=>t.work_key===WORK);
  if(!task)throw Error('forge_mission_task_missing');
  const outputFile=path.join(stateDir,'forge-qa-'+bundleHash+'.json');

  if(task.status==='complete'){
    // A completed QA receipt belongs to the *exact* original bundle digest.
    // Do not look for a new QA filename when the bundle changes.
    const prior=task.evidence_refs.filter(ref=>/^bundle:sha256:[a-f0-9]{64}$/.test(ref));
    if(prior.length!==1||prior[0]!=='bundle:sha256:'+bundleHash)
      throw Error('previous_qa_receipt_or_package_changed');
    const old=privateJson(outputFile);
    if(!qaValid(old,bundleHash)||
        !task.evidence_refs.includes('bundle:sha256:'+bundleHash)||
        !task.receipt_refs.includes('forge-qa:sha256:'+sha(privateBytes(outputFile,65536))))
      throw Error('previous_qa_receipt_or_package_changed');
    return outputSnapshot(state,{recovered_from_existing_goal:true,bundle_sha256:bundleHash});
  }
  if(task.status!=='pending'&&task.status!=='executing')
    return outputSnapshot(state,{blocker:'internal_qa_held_requires_recovery_review'});
  if(task.status==='pending'){
    const updated=await mutateGoalState(file,old=>startGoalWork({state:old,workKey:WORK}));
    state=updated.state;
  }
  const attempt=state.tasks.find(t=>t.work_key===WORK).attempt;
  // Reconcile a completed, existing QA receipt after a crash BEFORE repeating.
  if(!fs.existsSync(outputFile)){
    const script=qaScript||path.resolve(path.dirname(fileURLToPath(import.meta.url)),
      '../../integrations/ai-evaluation-lab/eo001-forge-evidence-qa.py');
    const argv=[script,'--bundle',inputs.bundle,'--receipt',inputs.receipt,
      '--review',inputs.review,'--output',outputFile];
    const response=spawn('python3',argv,{
      encoding:'utf8',timeout:30000,maxBuffer:65536,
      env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:home,LC_ALL:'C'},
      stdio:['ignore','pipe','pipe']
    });
    if(response.error||response.status!==0||!fs.existsSync(outputFile)){
      const updated=await mutateGoalState(file,old=>recordGoalOutcome({
        state:old,workKey:WORK,expectedAttempt:attempt,result:'blocked',
        blocker:'forge_evidence_qa_failed_closed'
      }));
      return outputSnapshot(updated.state,{blocker:'forge_evidence_qa_failed_closed'});
    }
  }
  const qaBytes=privateBytes(outputFile,65536);
  const receipt=JSON.parse(qaBytes.toString('utf8'));
  if(!qaValid(receipt,bundleHash))
    throw Error('forge_qa_receipt_failed_independent_contract');
  const updated=await mutateGoalState(file,old=>recordGoalOutcome({
    state:old,workKey:WORK,expectedAttempt:attempt,result:'complete',
    receiptRef:'forge-qa:sha256:'+sha(qaBytes),
    evidenceRefs:['bundle:sha256:'+bundleHash]
  }));
  return outputSnapshot(updated.state,{newly_reconciled:true,bundle_sha256:bundleHash});
}
if(import.meta.url===pathToFileURL(path.resolve(process.argv[1]||'')).href){
  try{
    const result=await runEo001OwnedQaMission();
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }catch(e){
    process.stderr.write(JSON.stringify({status:'BLOCKED',code:'OWNED_MISSION_QA_UNVERIFIED',
      reason:e?.message?.replace(/\/[A-Za-z0-9_./-]+/g,'[private_path]')||'unknown',
      external_message_authorized:false,model_executed:false})+'\n');
    process.exitCode=2;
  }
}
