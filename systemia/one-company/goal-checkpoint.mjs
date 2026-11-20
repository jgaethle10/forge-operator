// Durable owner-private Systemia goal from a verified Wing Courier Intake
// handoff. Staging is NOT a worker lease, an external action, an authorization,
// or a claim that a human has approved media use, production or payment.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createGoalState,admitGoalPlan} from '../organism/goal-runtime.mjs';
import {ONE_COMPANY_COURIER_SCHEMA} from './courier-handoff.mjs';

export const ONE_COMPANY_GOAL_RECEIPT_SCHEMA='evercraft.systemia.one-company-goal-checkpoint.v1';
const ID=/^[a-f0-9]{32}$/;
const HASH=/^sha256:[a-f0-9]{64}$/i;
const fail=code=>{throw Error('one_company_goal_'+code)};
const hash=value=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function requireHandoff(handoff){
 const p=handoff?.oneCompanyPlan;
 if(handoff?.schema!=='evercraft.wing-courier.intake-handoff.v1'||
    !ID.test(handoff.packageId||'')||
    !HASH.test(handoff.intakeReceiptHash||'')||
    !['candidate_only','duplicate'].includes(handoff.intakeState)||
    typeof handoff.candidateId!=='string'||!handoff.candidateId||
    handoff.admissionGranted!==false||handoff.executionGranted!==false||
    handoff.customerDeliveryGranted!==false||
    p?.schema!==ONE_COMPANY_COURIER_SCHEMA||
    p.packageId!==handoff.packageId||
    p.intakeCandidateId!==handoff.candidateId||
    p.stage!=='AWAITING_SEPARATE_SYSTEMIA_MISSION_ADMISSION'||
    p.productionAuthority!==false||p.workerDispatched!==false||
    p.forensiScopeMediaAutoTransfer!==false||
    p.customerMediaTransmitted!==false||p.previewSent!==false||
    p.paymentInitiated!==false||p.shippingInitiated!==false||
    p.sourceFilenamesIncluded!==false||p.sourceHashesIncluded!==false||
    p.realNodeRuntimeObserved!==false||
    !Number.isInteger(p.mediaAssetCount)||p.mediaAssetCount<1||p.mediaAssetCount>100||
    !Number.isInteger(p.audioVideoAssetCount)||p.audioVideoAssetCount<0||
    p.audioVideoAssetCount>p.mediaAssetCount||
    !Array.isArray(p.departments))
    fail('verified_private_intake_required');
 for(const name of ['systemia','saban','fallen','forensiscope','harbor',
  'evercraft-payments','shipping']){
  const matching=p.departments.filter(row=>row?.department===name);
  if(matching.length!==1||matching[0].executionAuthorized!==false||
     matching[0].customerContactAuthorized!==false||
     matching[0].paymentAuthorized!==false)
    fail('department_boundaries_not_verified');
 }
 return p;
}
function sealedDir(directory){
 if(typeof directory!=='string'||!path.isAbsolute(directory))
  fail('absolute_private_directory_required');
 let cursor=path.parse(directory).root;
 for(const part of directory.slice(cursor.length).split(path.sep).filter(Boolean)){
  cursor=path.join(cursor,part);
  const st=fs.lstatSync(cursor);
  if(!st.isDirectory()||st.isSymbolicLink())fail('symlink_or_non_directory');
 }
 const st=fs.lstatSync(directory);
 if((st.mode&0o077)!==0||
    (typeof process.getuid==='function'&&st.uid!==process.getuid()))
  fail('private_directory_permissions_required');
 return directory;
}
function readSealedGoal(file){
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
    (st.mode&0o077)!==0||st.size>65536||
    (typeof process.getuid==='function'&&st.uid!==process.getuid()))
   fail('existing_goal_untrusted');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}

export function createOneCompanyGoalCandidate({handoff,now=new Date()}={}){
 const p=requireHandoff(handoff);
 const binding=hash({
  packageId:handoff.packageId,candidateId:handoff.candidateId,
  intakeReceiptHash:handoff.intakeReceiptHash,planHash:hash(p)
 });
 const goalKey='wing-'+handoff.packageId;
 const props={
  goalKey,missionKey:'wing-courier:'+handoff.packageId,
  objective:'Coordinate separately authorized Evercraft work from privately verified Courier custody.',
  successCondition:'Source rights, staffed quality review, customer approval, provider payment and shipping each independently receipted.',
  contextRefs:[
   'wing-courier:fallen:'+handoff.packageId,
   'systemia:intake:'+handoff.candidateId,
   'systemia:intake-receipt:'+handoff.intakeReceiptHash,
   'systemia:one-company-binding:'+binding
  ],
  now
 };
 // Every task begins with an unresolved signed human gate. Even the first
 // internal step cannot be dispatched by the read-only intake adapter.
 const plan=[
  {work_key:'source-rights-and-customer-order',title:'Verify source rights and authenticated commercial scope',
   work_type:'trust_change',assigned_agents:['systemia','guardian']},
  {work_key:'saban-capacity-and-runtime',title:'Validate bounded Saban/Yard worker preflight and scope',
   work_type:'trust_change',dependency_keys:['source-rights-and-customer-order'],
   assigned_agents:['systemia','saban']},
 ];
 if(p.audioVideoAssetCount>0)plan.push({
  work_key:'forensiscope-local-authorized-review',
  title:'Separately authorize and independently validate optional local media review',
  work_type:'trust_change',dependency_keys:['saban-capacity-and-runtime'],
  assigned_agents:['forensiscope','guardian']
 });
 const producerPrereq=p.audioVideoAssetCount>0?
  'forensiscope-local-authorized-review':'saban-capacity-and-runtime';
 plan.push(
  {work_key:'fallen-assigned-production',title:'Assign an authenticated Fallen producer and scoped production runtime',
   work_type:'trust_change',dependency_keys:[producerPrereq],assigned_agents:['fallen','saban']},
  {work_key:'fallen-independent-qc',title:'Verify original-source derivative, audio/picture and independent creative QC',
   work_type:'trust_change',dependency_keys:['fallen-assigned-production'],
   assigned_agents:['fallen','guardian']},
  {work_key:'harbor-approved-private-preview',title:'Send exact approved preview only with native provider release guard',
   work_type:'external_message',dependency_keys:['fallen-independent-qc'],assigned_agents:['harbor']},
  {work_key:'customer-approval-readback',title:'Independently confirm actual customer preview approval',
   work_type:'trust_change',dependency_keys:['harbor-approved-private-preview'],
   assigned_agents:['harbor','systemia']},
  {work_key:'evercraft-payments-readback',title:'Verify real provider payment, never infer success from a payment link',
   work_type:'payment',dependency_keys:['customer-approval-readback'],
   assigned_agents:['evercraft-payments']},
  {work_key:'shipping-private-delivery',title:'Deliver approved master and independently reconcile recipient readback',
   work_type:'external_message',dependency_keys:['evercraft-payments-readback'],
   assigned_agents:['shipping','harbor']}
 );
 for(const t of plan)t.human_gate_required=true;
 const goal=admitGoalPlan({state:createGoalState(props),plan,now});
 if(goal.status!=='waiting'||goal.next_work_keys.length!==0||
    goal.tasks.some(t=>!t.human_gate_required||!t.human_gate_unresolved||
      t.status!=='pending'||t.attempt!==0))
  fail('goal_must_be_held_at_creation');
 goal.one_company_source_binding=binding;
 goal.one_company_source_schema=ONE_COMPANY_COURIER_SCHEMA;
 goal.one_company_activation='OWNER_PRIVATE_PLAN_ONLY';
 return goal;
}

export function stageOneCompanyGoalCandidate({handoff,privateGoalDir,now=new Date()}={}){
 const p=requireHandoff(handoff);
 const goal=createOneCompanyGoalCandidate({handoff,now});
 const root=sealedDir(privateGoalDir),file=path.join(root,handoff.packageId+'.goal.json');
 const bytes=JSON.stringify(goal)+'\n';
 let fd;
 try{
  fd=fs.openSync(file,'wx',0o600);
  fs.writeFileSync(fd,bytes,{encoding:'utf8'});
  fs.fsyncSync(fd);
 }catch(e){
  if(e?.code!=='EEXIST')throw e;
  const previous=readSealedGoal(file);
  if(previous?.schema!=='evercraft.goal.state.v1'||
     previous.goal_key!==goal.goal_key||
     previous.mission_key!==goal.mission_key||
     previous.one_company_source_binding!==goal.one_company_source_binding||
     previous.one_company_source_schema!==ONE_COMPANY_COURIER_SCHEMA||
     previous.tasks?.length!==goal.tasks.length||
     goal.tasks.some(task=>!previous.tasks.some(old=>
      old.work_key===task.work_key&&old.dedupe_key===task.dedupe_key)))
    fail('existing_goal_source_conflict');
  return Object.freeze({
   schema:ONE_COMPANY_GOAL_RECEIPT_SCHEMA,packageId:handoff.packageId,
   goalKey:goal.goal_key,sourceBinding:goal.one_company_source_binding,
   sourceMediaAssetCount:p.mediaAssetCount,alreadyStaged:true,
   currentGoalState:previous.status,
   state:'OWNER_PRIVATE_GOAL_ALREADY_EXISTS',
   workStartedByThisCall:false,workerLeaseGranted:false,
   analysisStarted:false,customerSendAuthorized:false,
   paymentAuthorized:false,shippingAuthorized:false
  });
 }finally{if(fd!==undefined)fs.closeSync(fd)}
 return Object.freeze({
  schema:ONE_COMPANY_GOAL_RECEIPT_SCHEMA,packageId:handoff.packageId,
  goalKey:goal.goal_key,sourceBinding:goal.one_company_source_binding,
  sourceMediaAssetCount:p.mediaAssetCount,alreadyStaged:false,
  taskCount:goal.tasks.length,currentGoalState:goal.status,
  state:'OWNER_PRIVATE_GOAL_STAGED_AND_HELD',
  workStartedByThisCall:false,workerLeaseGranted:false,
  analysisStarted:false,customerSendAuthorized:false,
  paymentAuthorized:false,shippingAuthorized:false
 });
}
