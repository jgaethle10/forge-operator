// Explicit owner-local read-only research work, not a heartbeat or a new scheduler.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {EvercraftIntakeFabric} from '../intake-fabric/intake.mjs';
import {buildRecoveryCandidate} from './intake-bridge.mjs';
import {bindTowiRecoveryRecord} from './towi-bridge.mjs';
import {assessRecovery} from './screen.mjs';
import {createGoalState,admitGoalPlan} from '../organism/goal-runtime.mjs';
import {createGoalStateFile,readGoalState} from '../organism/goal-store.mjs';
import {createCapabilityRegistry} from '../organism/capability-runtime.mjs';
import {executePersistedGoalWork} from '../organism/goal-durable-dispatch.mjs';
const MISSION='circular-recovery-research';
const WORK='screen-bound-recovery-record';
const hash=x=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');
function privateDir(dir){
 if(typeof dir!=='string'||!path.isAbsolute(dir)||fs.realpathSync(dir)!==path.resolve(dir))throw Error('recovery_private_dir_required');
 const s=fs.lstatSync(dir);
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)||
    (typeof process.getuid==='function'&&s.uid!==process.getuid()))throw Error('recovery_private_dir_required');
 return path.resolve(dir);
}
function checkFile(file){
 const s=fs.lstatSync(file,{throwIfNoEntry:false});
 if(s&&(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)||
    (typeof process.getuid==='function'&&s.uid!==process.getuid())))throw Error('recovery_unsafe_goal_file');
 return Boolean(s);
}
// Use the existing owner-provisioned resident and state roots. No caller-provided
// admission packet is accepted. Read authorization is required even on replay.
export async function runAdmittedRecoveryReview({towiResident,dossierId,expectedDossierDigest,record,revision,
 adapterActorRef,readerActorRef,candidateId,intakeStateDir,passportStateDir,outDir}={}){
 const out=privateDir(outDir);
 const intake=new EvercraftIntakeFabric({stateDir:privateDir(intakeStateDir),passportStateDir:privateDir(passportStateDir)});
 const now=new Date();
 const binding=bindTowiRecoveryRecord({towiResident,dossierId,expectedDossierDigest,record});
 const expected=buildRecoveryCandidate({record:binding.record,sourceDigest:binding.sourceDigest,
  dossierKey:binding.dossierKey,revision,adapterActorRef,at:now.toISOString()});
 const packet=intake.buildSystemiaAdmissionPacket(candidateId,{actor_ref:readerActorRef,at:now.toISOString()});
 const {receipt_hash,...body}=packet;
 if(receipt_hash!==hash(body)||packet.schema!=='evercraft.intake.systemia-admission-packet.v1'||
    packet.mission_ref!==MISSION||packet.source_ref!==expected.source_ref||
    packet.content_fingerprint!==expected.content_fingerprint||
    packet.content_ref!==expected.content_ref||packet.execution_authority_granted!==false||
    packet.external_side_effects_authorized!==false)throw Error('recovery_admission_binding_conflict');
 const fingerprint=hash([receipt_hash,expected.content_fingerprint]);
 const goalKey='circular-recovery-'+fingerprint.slice(7);
 const dedupe=MISSION+'|'+fingerprint;
 const file=path.join(out,goalKey+'.json');
 const desired=admitGoalPlan({state:createGoalState({goalKey,missionKey:MISSION,
  objective:'Screen an accepted, source-bound circular recovery record',
  successCondition:'Reproducible desktop screening result bound to accepted intake and TOWI revision',
  contextRefs:[receipt_hash,expected.content_fingerprint,binding.sourceDigest],now}),
  plan:[{work_key:WORK,work_type:'circular_recovery_desktop_screen',dedupe_key:dedupe,
   impact:'read_only_research',human_gate_required:false}],now});
 if(!checkFile(file)){
  try{await createGoalStateFile(file,desired,{now})}
  catch(e){if(!checkFile(file))throw e;}
 }
 checkFile(file);
 const prior=await readGoalState(file);
 if(prior.goal_key!==goalKey||prior.mission_key!==MISSION||prior.tasks.length!==1||
    prior.tasks[0].work_key!==WORK||prior.tasks[0].dedupe_key!==dedupe||
    !prior.context_refs.includes(receipt_hash)||!prior.context_refs.includes(binding.sourceDigest))
   throw Error('recovery_goal_identity_conflict');
 const screen=assessRecovery(record);
 const screenRef=hash({fingerprint,screen});
 let result=null;
 if(prior.next_work_keys.includes(WORK)){
  const registry=createCapabilityRegistry([{capability_key:'evercraft.circular-recovery.desktop-screen',
   authority:'read-only',work_types:['circular_recovery_desktop_screen'],
   execute:async()=>({result:'complete',receipt_ref:screenRef,evidence_refs:[receipt_hash,binding.sourceDigest]})}]);
  result=await executePersistedGoalWork({filePath:file,workKey:WORK,registry,now});
 }
 const saved=await readGoalState(file),task=saved.tasks[0];
 const complete=task.status==='complete';
 if(complete&&!task.receipt_refs.includes(screenRef))throw Error('recovery_goal_result_digest_conflict');
 return {schema:'evercraft.circular-recovery.goal-review.v1',goalKey,candidateId,
  state:task.status,attempt:task.attempt,executedThisCall:result?.executed===true,
  completedDesktopReview:complete,screen:complete?screen:null,screenReceiptRef:complete?screenRef:null,
  intakeAdmissionReceipt:receipt_hash,heartbeatConnected:false,physicalExecution:false,
  environmentalClaimVerified:false,commercialCommitment:false,publicationAuthority:false};
}
