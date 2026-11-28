// Review-only crosswalk for #2637. No scheduler, I/O, dispatch or admission.
import {reconcileResearchExport} from './kaidance-rd-continuity.mjs';

export const PROGRAMS=Object.freeze([
  Object.freeze({key:'first-contact',sourceIssue:1832,next:'reconcile existing UAP source and sensor/materials evidence'}),
  Object.freeze({key:'medical-discovery',sourceIssue:1891,next:'reconcile v9 protocol review and historical trial evidence'}),
  Object.freeze({key:'oncology',sourceIssue:null,next:'recover original cancer research artifacts and canonical work identity'}),
  Object.freeze({key:'final-hours',sourceIssue:null,next:'recover September study charter and canonical work identity'})
]);
const empty=()=>PROGRAMS.map(p=>({program:p.key,status:'identity_recovery_required'}));
const validId=x=>typeof x==='string'&&x.trim()===x&&x.length>0&&x.length<=240;
const base=()=>({lane:'science-research',heartbeat_seconds:300,execution_authorized:false,
 publication_authorized:false,verified_research_artifacts:0,coverage_verified:false});
// bindings are supplied by the authorized owner, never inferred from public source references.
// This validates an existing all_rd snapshot, not a replacement export.
// No identifiers or source-private contents are returned.
export function assessFourProgramContinuity({missionExport,bindings,now=new Date(),readGoal=null}={}){
 const report=reconcileResearchExport(missionExport,now,readGoal);
 if(!report.missions)return {...base(),status:'held_export',programs:empty()};
 if(!bindings||typeof bindings!=='object'||Array.isArray(bindings)||
   Object.keys(bindings).some(k=>!PROGRAMS.some(p=>p.key===k))||
   Object.values(bindings).some(v=>!validId(v))||
   new Set(Object.values(bindings)).size!==Object.values(bindings).length)
   return {...base(),status:'held_crosswalk',programs:empty()};
 const programs=PROGRAMS.map(p=>{
   const id=Object.hasOwn(bindings,p.key)?bindings[p.key]:null;
   if(!id)return {program:p.key,status:'identity_recovery_required'};
   const mission=missionExport.missions.find(m=>m.mission_id===id);
   if(!mission||mission.admission_state!=='admitted')
      return {program:p.key,status:'admission_unverified'};
   if(!missionExport.priority_mission_ids.includes(id))
      return {program:p.key,status:'priority_binding_review_required'};
   if(['paused','terminal'].includes(mission.disposition))
      return {program:p.key,status:'reported_disposition_review'};
   return {program:p.key,status:'reported_admission_requires_private_receipt_review'};
 });
 return {...base(),status:'review_required',programs};
}
