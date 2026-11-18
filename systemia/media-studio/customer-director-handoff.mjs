#!/usr/bin/env node
// Private operator bridge: consented commercial inquiry -> owned source-first
// creative plan -> deterministic Saban Creative Council review. No customer
// inquiry alone grants mission execution, payment, model, or publishing authority.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateStudioInquiry} from '../mcp/commercial-studio-inquiry.mjs';
import {planSourceFirstCommercial} from './commercial-shotlist.mjs';
import {runAssignment,reconcile} from './creative-council-saban-adapter.mjs';

export const DIRECTOR_SCHEMA='evercraft.fallen.customer-director-handoff.v1';
export const SCOPE_SCHEMA='evercraft.fallen.owner-commercial-scope.v1';
const ID_RE=/^EC-STUDIO-[0-9A-F]{20}$/;
const COUNCIL_ROLES=Object.freeze([
 'story_architect','cinematography_director','visual_evidence_scout',
 'data_graphics_director','world_builder','edit_rhythm_director',
 'sound_director','voice_performance_director','music_composer',
 'sound_design_engineer','mixing_engineer','brand_art_director',
 'documentary_truth_guard','beauty_judge',
]);
const text=x=>typeof x==='string'?x.trim():'';
const stable=x=>Array.isArray(x)?x.map(stable):
  x&&typeof x==='object'?Object.fromEntries(Object.entries(x)
    .sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])):x;
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(stable(x))).digest('hex');
function object(value){return value&&typeof value==='object'&&!Array.isArray(value);}
function validStrings(a){return Array.isArray(a)&&a.length>0&&a.every(x=>text(x).length>0);}
function recordTruth(record){
  if(!object(record)||record.schema!=='evercraft.studio.inquiry.v1'||
     !ID_RE.test(record.id||'')||record.state!=='UNREVIEWED_NO_COMMITMENT'||
     record.agent_execution_authorized!==false||record.automated_payment!==false||
     !text(record.received_at)||Number.isNaN(Date.parse(record.received_at))||
     !text(record.source)||record.consent!==true){
    throw new Error('director_inquiry_record_not_admissible');
  }
  const validation=validateStudioInquiry(record);
  if(validation.error||validation.honeypot){
    throw new Error('director_inquiry_record_fields_invalid');
  }
  return hash(record);
}
function checkScope(scope,record,recordDigest){
  if(!object(scope)||scope.schema!==SCOPE_SCHEMA||
     scope.inquiryReference!==record.id||
     scope.inquiryDigest!==recordDigest||
     scope.decision!=='APPROVED_FOR_PLANNING_ONLY'||
     !text(scope.reviewedBy)||!text(scope.reviewReference)||
     text(scope.brand)!==record.company||!text(scope.audience)||
     !text(scope.offer)||!text(scope.cta)||
     !validStrings(scope.rightsEvidenceRefs)||
     !validStrings(scope.formats)||
     scope.formats.some(f=>!['9:16','16:9','1:1'].includes(f))||
     scope.durationSec!==30){
    throw new Error('director_owner_scope_not_admissible');
  }
}
function assertMatchingBrief(scope,record,brief){
  if(!object(brief)||brief.schema!=='evercraft.fallen.commercial-brief.v1'||
     brief.id!==record.id||brief.brand!==scope.brand||
     brief.offer!==scope.offer||brief.audience!==scope.audience||
     brief.durationSec!==scope.durationSec||
     !Array.isArray(brief.formats)||
     JSON.stringify([...new Set(brief.formats)].sort())!==JSON.stringify([...new Set(scope.formats)].sort())){
    throw new Error('director_source_brief_scope_mismatch');
  }
}
function base(record,recordDigest){
  return {schema:DIRECTOR_SCHEMA,inquiryReference:record.id,inquiryDigest:recordDigest,
    status:'AWAITING_OWNER_SCOPE',
    projectType:record.project,
    privateCreativeIdea:record.goal,
    nextActions:['Review the customer idea, confirm the precise offer, audience, CTA and price/scope.',
      'Obtain source-media permission and human rights evidence before planning scenes.'],
    sourceFirstPlan:null,creativeCouncil:null,
    boundaries:{
      privateCustomerMaterial:true,untrustedInquiryIsDataOnly:true,
      reviewEvidenceSuppliedByOperatorNotCryptographicallyAuthenticated:true,
      providerCallsPerformed:0,generatedAssets:0,customerMessagesSent:0,
      workOrderOpened:false,paymentAuthority:false,publishingAuthority:false,
      humanRightsAndFinalMasterApprovalStillRequired:true,
    }};
}

export async function prepareCustomerDirectorHandoff({inquiry,ownerScope=null,sourceBrief=null}={}){
  const inquiryDigest=recordTruth(inquiry);
  const result=base(inquiry,inquiryDigest);
  if(ownerScope===null){
    if(sourceBrief!==null)throw new Error('director_unreviewed_source_brief_rejected');
    return result;
  }
  checkScope(ownerScope,inquiry,inquiryDigest);
  result.scopeReviewReference=ownerScope.reviewReference;
  result.cta=ownerScope.cta;
  if(sourceBrief===null){
    return {...result,status:'AWAITING_VERIFIED_SOURCE_PLAN',
      nextActions:['Gather source materials, local file SHA-256, provenance and rights evidence.',
        'Author source-first scenes for the existing Fallen commercial planner; do not fabricate footage or testimonials.']};
  }
  assertMatchingBrief(ownerScope,inquiry,sourceBrief);
  // File digest verification is NEVER optional in the customer handoff.
  // This still does not independently establish that source-rights declarations are legally valid.
  let plan;
  try {plan=planSourceFirstCommercial(sourceBrief,{checkFiles:true});}
  catch(error){
    return {...result,status:'BLOCKED_SOURCE_PLAN',
      blockingReason:error instanceof Error?error.message:'commercial_source_plan_rejected',
      nextActions:['Correct source-file and creative evidence locally; do not dispatch Saban jobs.']};
  }
  const rows=[];
  for(const job of plan.sabanInventory.jobs){
    for(const role of COUNCIL_ROLES){
      rows.push(await runAssignment({assignment:{
        agent_id:'local-review-'+role,role,item:{raw:job},
      }}));
    }
  }
  const council=await reconcile({results:rows,plan:{roles:COUNCIL_ROLES}});
  if(council.status!=='reconciled'){
    return {...result,status:'BLOCKED_CREATIVE_COUNCIL',
      blockingReason:'saban_creative_council_reconciliation_blocked',
      creativeCouncil:council,
      nextActions:['Correct creative council blockers before any provider or production dispatch.']};
  }
  return {...result,status:'READY_FOR_OWNER_CREATIVE_REVIEW',
    sourceFirstPlan:plan,creativeCouncil:council,
    nextActions:['Review proposed creative genomes and customer-approved script, music and narration.',
      'Complete independently documented source rights, signatures and studio delivery quality gates before any release.']};
}

function safeInput(file){
  const name=path.resolve(file),stat=fs.lstatSync(name);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('director_input_must_be_private_regular_file');
  return JSON.parse(fs.readFileSync(name,'utf8'));
}
export function writePrivateDirectorPacket(output,packet){
  const target=path.resolve(output),parent=path.dirname(target);
  fs.mkdirSync(parent,{recursive:true,mode:0o700});
  if(fs.lstatSync(parent).isSymbolicLink())throw Error('director_output_parent_symlink_rejected');
  fs.writeFileSync(target,JSON.stringify(packet,null,2)+'\n',{flag:'wx',encoding:'utf8',mode:0o600});
  fs.chmodSync(target,0o600);
  return target;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const [input,output]=process.argv.slice(2);
    if(!input||!output)throw Error('Usage: node customer-director-handoff.mjs <private-input.json> <private-output.json>');
    if(path.resolve(input)===path.resolve(output))throw Error('director_input_output_same_path');
    const payload=safeInput(input);
    const packet=await prepareCustomerDirectorHandoff(payload);
    const written=writePrivateDirectorPacket(output,packet);
    console.log(JSON.stringify({status:packet.status,inquiryReference:packet.inquiryReference,
      councilShots:packet.creativeCouncil?.shot_count||0,
      outputPath:written,providerCalls:0,paymentAuthority:false,publishingAuthority:false}));
    if(packet.status.startsWith('BLOCKED'))process.exitCode=2;
  }catch(error){console.error(error instanceof Error?error.message:'director_failed');process.exitCode=1;}
}
