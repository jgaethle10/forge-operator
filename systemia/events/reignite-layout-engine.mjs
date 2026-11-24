import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

export const SCHEMA = 'evercraft.reignite.layout.v1';
export const MAPS = ['interior','campus'];
export const CATEGORIES = ['performance','visual_art','heritage','quiet','participation','food','circulation','operations','protected'];
export const STATES = ['idea','needs_site_survey','blocked','reviewed_for_planning'];
const MAX_ZONES = 80;
const clean = (v,max=180)=>typeof v==='string'?v.trim().slice(0,max):'';
const has = (o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const num=(n)=>typeof n==='number'&&Number.isFinite(n);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const validId=(s)=>/^[a-z][a-z0-9-]{2,63}$/.test(s);
export function digest(v){return createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');}
export function secureCompare(a,b){
  if(typeof a!=='string'||typeof b!=='string') return false;
  const left=Buffer.from(a);const right=Buffer.from(b);
  return left.length===right.length && timingSafeEqual(left,right);
}
export const historicalEnvelope = Object.freeze({
  length_ft:1072,width_ft:296,precision:'published_historic_dimensions_only',
  source_ref:'https://www.tillamookair.com/hangar-b/',
  note:'Historic hangar envelope, NOT a current surveyed plan. Its position in the campus tab is schematic.',
});
export const missingSurveyLayers = Object.freeze([
  'current aircraft and permanent exhibits','roof repairs/shoring and exclusion zones',
  'authorized indoor/public access areas','doors and actual accessible exits',
  'emergency egress and fire protection','floor/slab load and vibration survey',
  'site boundary and aviation security perimeter','vehicle gates, roads, parking and loading',
  'electric, water, sanitation and drainage','noise-sensitive neighbors and permitted sound footprint'
]);
const seedZone = (id,name,map,category,x,y,w,h,note)=>({
  id,name,map,category,x,y,w,h,
  stage:'idea',owner:'',capacity:null,
  source_ref:'',notes:note,
});
export function createSeedPlan(){
  return {
    schema:SCHEMA,site_id:'hangar-b-reignite',revision:0,
    basis:'conceptual_not_as_built',envelope:{...historicalEnvelope},
    survey_missing:[...missingSurveyLayers],
    zones:[
      seedZone('ind-acoustic-dome','Acoustic visual dome','interior','performance',.22,.22,.20,.42,'Proposed; location and enclosure unknown. No structural hang points.'),
      seedZone('ind-heritage','Heritage and aircraft exhibits','interior','heritage',.48,.14,.24,.58,'Proposed exhibit concept; actual collection positions unknown.'),
      seedZone('ind-quiet-wing','Quiet Wing','interior','quiet',.73,.18,.14,.25,'Proposed sensory break area; protect exits and aircraft.'),
      seedZone('ind-gallery','Art and photography','interior','visual_art',.07,.19,.12,.56,'Proposed freestanding display area only.'),
      seedZone('ind-guest-decks','Take the Decks','interior','participation',.73,.57,.14,.24,'Proposed headset-only guest DJ experience; crowd and sound review pending.'),
      seedZone('ext-stage','Outdoor main stage','campus','performance',.12,.20,.24,.22,'Illustrative location only; site boundary and airfield access unknown.'),
      seedZone('ext-food','Food village and cook-off','campus','food',.66,.18,.23,.23,'Illustrative; food licensing, utilities, waste and access unverified.'),
      seedZone('ext-karaoke','Karaoke stage','campus','participation',.64,.69,.22,.17,'Illustrative; sound spill and venue permission required.'),
      seedZone('ext-entry','Guest reception concept','campus','circulation',.12,.68,.20,.14,'Illustrative; NO current entrances or egress are mapped.'),
    ]
  };
}
function validateZone(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('zone_object_required');
 const {id,name,map,category,x,y,w,h,stage,owner,capacity,source_ref,notes}=raw;
 if(!validId(id))throw Error('zone_id_invalid');
 if(clean(name,100)!==name||name.length<3)throw Error('zone_name_invalid');
 if(!MAPS.includes(map)||!CATEGORIES.includes(category))throw Error('zone_category_invalid');
 if(![x,y,w,h].every(num)||w<.03||h<.04||x<0||y<0||x+w>1.0000001||y+h>1.0000001)throw Error('zone_geometry_invalid');
 if(!STATES.includes(stage))throw Error('zone_stage_invalid');
 if(typeof owner!=='string'||owner.length>100)throw Error('zone_owner_invalid');
 if(capacity!==null&&(!Number.isInteger(capacity)||capacity<0||capacity>100000))throw Error('zone_capacity_invalid');
 if(typeof source_ref!=='string'||source_ref.length>420)throw Error('zone_source_invalid');
 if(typeof notes!=='string'||notes.length>1600)throw Error('zone_notes_invalid');
 if(['reviewed_for_planning'].includes(stage)&&!source_ref)throw Error('planning_review_needs_source_ref');
 return {id,name,map,category,x,y,w,h,stage,owner,capacity,source_ref,notes};
}
export function normalizeCandidate(current,candidate){
 if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))throw Error('candidate_required');
 if(candidate.schema!==SCHEMA||candidate.site_id!==current.site_id)throw Error('candidate_schema_mismatch');
 if(!Array.isArray(candidate.zones)||candidate.zones.length>MAX_ZONES)throw Error('zones_invalid');
 if(!same(candidate.envelope,current.envelope)||!same(candidate.survey_missing,current.survey_missing)||candidate.basis!==current.basis)throw Error('immutable_site_basis');
 const zones=candidate.zones.map(validateZone);
 if(new Set(zones.map(z=>z.id)).size!==zones.length)throw Error('duplicate_zone_id');
 // The interface never creates an authoritative site or safety approval.
 if(candidate.approved===true||candidate.event_approved===true||candidate.venue_authorized===true)throw Error('authority_escalation_denied');
 return {...current,zones};
}
export function calculateDiff(current,proposed){
 const before=new Map(current.zones.map(z=>[z.id,z]));
 const after=new Map(proposed.zones.map(z=>[z.id,z]));
 const changes=[];
 for(const zone of proposed.zones){
   const orig=before.get(zone.id);
   if(!orig) changes.push({zone_id:zone.id,kind:'added',name:zone.name});
   else if(!same(orig,zone))changes.push({zone_id:zone.id,kind:'edited',name:zone.name,fields:Object.keys(zone).filter(k=>!same(orig[k],zone[k]))});
 }
 for(const zone of current.zones)if(!after.has(zone.id))changes.push({zone_id:zone.id,kind:'removed',name:zone.name});
 return changes;
}
export function makeProposal(current,candidate,{actor_ref,reason,base_revision}={}){
 if(!Number.isInteger(base_revision)||base_revision!==current.revision)throw Error('revision_conflict');
 const actor=clean(actor_ref,80),why=clean(reason,900);
 if(actor.length<3||why.length<12)throw Error('proposal_identity_and_reason_required');
 const norm=normalizeCandidate(current,candidate);
 const changes=calculateDiff(current,norm);
 if(changes.length===0)throw Error('proposal_has_no_changes');
 return {
  schema:'evercraft.reignite.layout-proposal.v1',id:'p-'+randomUUID(),
  site_id:current.site_id,base_revision:current.revision,
  actor_ref:actor,reason:why,changes,
  candidate:norm,status:'pending',submitted_at:new Date().toISOString(),
  reviewed_at:null,review_note:null,reviewer_ref:null
 };
}
export function decideProposal(plan,proposal,{decision,reviewer_ref,review_note}={}){
 if(!proposal||proposal.status!=='pending')throw Error('proposal_not_pending');
 if(!['approve_for_planning','reject'].includes(decision))throw Error('decision_invalid');
 const reviewer=clean(reviewer_ref,80),note=clean(review_note,900);
 if(reviewer.length<3||note.length<6)throw Error('review_identity_and_note_required');
 if(decision==='approve_for_planning'&&plan.revision!==proposal.base_revision)throw Error('revision_conflict_requires_resubmission');
 const next=decision==='approve_for_planning' ? {...normalizeCandidate(plan,proposal.candidate),revision:plan.revision+1} : plan;
 const updated={...proposal,status:decision==='approve_for_planning'?'merged_for_planning':'rejected',
   reviewed_at:new Date().toISOString(),reviewer_ref:reviewer,review_note:note};
 return {plan:next,proposal:updated,receipt:{
   schema:'evercraft.reignite.layout-review-receipt.v1',proposal_id:proposal.id,
   action:decision,from_revision:plan.revision,to_revision:next.revision,
   plan_hash:digest(next),reviewed_at:updated.reviewed_at,
   event_approved:false,venue_authorized:false,source_only_planning:true,
 }};
}
