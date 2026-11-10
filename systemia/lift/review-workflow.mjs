/**
 * Evercraft Lift: side-effect-free workflow proposal. 
 * WARNING: actor must originate from a separately authenticated, authorized server.
 * This code is NOT a live intake service, secure vault, persistent event store,
 * payment system, legal approval, or identity verification mechanism.
 */
export const LIFT_WORKFLOW_VERSION="evercraft.lift.workflow.v1";
const CATEGORIES=["housing","utilities","food","health","transport","other"];
const KINDS=["bill_payment","service","goods","referral"];
const CHECKS=["identity","need","payee","disbursement_plan"];
const assertSafeId=(s)=>typeof s==="string"&&/^[A-Za-z0-9_-]{3,64}$/.test(s);
const assertVault=(s)=>typeof s==="string"&&/^vault:[A-Za-z0-9_-]{8,64}$/.test(s);
function refuse(why){throw new Error(`Lift workflow blocked: ${why}`);}
function actorGate(actor,record,roles,disallowOwner=false){
  if(!actor||!assertSafeId(actor.id)||!roles.includes(actor.role))refuse("trusted actor role required");
  if(disallowOwner&&actor.id===record.owner_id)refuse("requester cannot review own case");
}
function safePublicText(s,max){return typeof s==="string"&&s.trim().length>0&&s.trim().length<=max&&s.indexOf("<")===-1&&s.indexOf(">")===-1;}
function makeCase(input,actor){
  if(!input||typeof input!=="object"||Array.isArray(input))refuse("case object required");
  const allow=["id","owner_id","category","assistance_kind","goal_cents","region","vault_ref","data_processing_consent"];
  if(Object.keys(input).some(k=>!allow.includes(k)))refuse("private intake allows only approved metadata and opaque vault reference");
  if(!assertSafeId(input.id)||!assertSafeId(input.owner_id)||actor?.id!==input.owner_id||actor?.role!=="requester")refuse("requester identity mismatch");
  if(!CATEGORIES.includes(input.category)||!KINDS.includes(input.assistance_kind))refuse("invalid category or assistance kind");
  if(!Number.isSafeInteger(input.goal_cents)||input.goal_cents<=0||input.goal_cents>1000000000)refuse("invalid amount");
  if(!safePublicText(input.region,80)||!assertVault(input.vault_ref)||input.data_processing_consent!==true)refuse("consent and valid vault reference required");
  return {schema:"evercraft.lift.case-workflow.v1",id:input.id,owner_id:input.owner_id,status:"submitted",category:input.category,assistance_kind:input.assistance_kind,goal_cents:input.goal_cents,region:input.region,vault_ref:input.vault_ref,checks:Object.fromEntries(CHECKS.map(k=>[k,false])),evidence_refs:{},review:{approved_by:null,redacted_by:null,published_by:null},preview_version:0,reviewed_public:null,consent:{data_processing:true,public_listing:false,preview_version:null},events:[{seq:1,action:"submitted",actor_id:actor.id,role:actor.role}]};
}
function transitionCase(record,event,actor){
  if(record?.schema!=="evercraft.lift.case-workflow.v1"||!event?.action)refuse("invalid case or action");
  const c={...record,checks:{...record.checks},evidence_refs:{...record.evidence_refs},review:{...record.review},consent:{...record.consent},events:[...record.events]};
  const reviewer=()=>actorGate(actor,c,["reviewer"],true);
  const owner=()=>actorGate(actor,c,["requester"])|| (actor.id===c.owner_id?null:refuse("case owner required"));
  const status=(s)=>{if(!s.includes(c.status))refuse(`invalid ${event.action} transition from ${c.status}`);};
  switch(event.action){
    case "begin_review":
      reviewer();status(["submitted"]);c.status="screening";break;
    case "verify":
      reviewer();status(["screening"]);
      if(!CHECKS.includes(event.check)||!assertVault(event.evidence_ref))refuse("invalid review check or evidence reference");
      c.checks[event.check]=true;c.evidence_refs[event.check]=event.evidence_ref;break;
    case "approve_private":
      reviewer();status(["screening"]);
      if(CHECKS.some(k=>c.checks[k]!==true))refuse("all four independent checks required");
      c.status="approved_private";c.review.approved_by=actor.id;break;
    case "set_redacted_preview":
      reviewer();status(["approved_private"]);
      if(actor.id===c.review.approved_by)refuse("independent redaction reviewer required");
      if(!safePublicText(event.title,110)||!safePublicText(event.summary,240)||!safePublicText(event.region,80))refuse("safe reviewed preview required");
      c.reviewed_public={title:event.title.trim(),summary:event.summary.trim(),region:event.region.trim()};
      c.preview_version+=1;c.review.redacted_by=actor.id;c.consent.public_listing=false;c.consent.preview_version=null;break;
    case "consent_public":
      owner();status(["approved_private"]);
      if(!c.reviewed_public||event.preview_version!==c.preview_version)refuse("requester must accept exact reviewed preview version");
      c.consent.public_listing=true;c.consent.preview_version=c.preview_version;break;
    case "publish":
      actorGate(actor,c,["publisher"],true);status(["approved_private"]);
      if(!c.reviewed_public||!c.consent.public_listing||c.consent.preview_version!==c.preview_version)refuse("current preview consent required");
      if(!c.review.approved_by||!c.review.redacted_by||[c.review.approved_by,c.review.redacted_by].includes(actor.id))refuse("independent publication authority required");
      c.status="published";c.review.published_by=actor.id;break;
    case "withdraw":
      owner();status(["submitted","screening","approved_private","published","paused","rejected"]);
      c.status="withdrawn";c.consent.public_listing=false;c.consent.preview_version=null;break;
    case "pause":
      actorGate(actor,c,["reviewer","publisher"],true);status(["published"]);
      c.status="paused";c.consent.public_listing=false;c.consent.preview_version=null;break;
    case "reopen":
      reviewer();status(["paused"]);c.status="approved_private";break;
    case "reject":
      reviewer();status(["submitted","screening"]);
      if(!["invalid_evidence","not_eligible","duplicate","unable_to_verify"].includes(event.reason_code))refuse("controlled reason required");
      c.status="rejected";break;
    default:refuse("unrecognized action");
  }
  c.events.push({seq:c.events.length+1,action:event.action,actor_id:actor.id,role:actor.role});
  return c;
}
function casePublicSnapshot(c){
  if(c?.schema!=="evercraft.lift.case-workflow.v1"||c.status!=="published")refuse("case not publicly approved");
  if(!c.consent.public_listing||c.consent.preview_version!==c.preview_version||CHECKS.some(k=>!c.checks[k]))refuse("expired review or consent");
  return Object.freeze({id:c.id,title:c.reviewed_public.title,summary:c.reviewed_public.summary,region:c.reviewed_public.region,category:c.category,goal_cents:c.goal_cents,assistance_kind:c.assistance_kind,verification_label:"reviewed_by_lift",payments_available:false});
}
function makePartner(input,actor){
  if(!input||Object.keys(input).some(k=>!["id","owner_id","public_name","regions","categories","assistance_kinds"].includes(k)))refuse("invalid partner intake fields");
  if(actor?.role!=="partner_applicant"||actor?.id!==input.owner_id||!assertSafeId(input.id)||!assertSafeId(input.owner_id))refuse("partner applicant identity required");
  if(!safePublicText(input.public_name,90)||!Array.isArray(input.regions)||!input.regions.length||input.regions.length>15||input.regions.some(v=>!safePublicText(v,80)))refuse("partner program regions invalid");
  if(!Array.isArray(input.categories)||!input.categories.length||input.categories.some(v=>!CATEGORIES.includes(v)))refuse("partner categories invalid");
  if(!Array.isArray(input.assistance_kinds)||!input.assistance_kinds.length||input.assistance_kinds.some(v=>!KINDS.includes(v)))refuse("partner assistance kinds invalid");
  return {schema:"evercraft.lift.partner-workflow.v1",id:input.id,owner_id:input.owner_id,status:"applied",public_name:input.public_name,regions:[...input.regions],categories:[...input.categories],assistance_kinds:[...input.assistance_kinds],checks:{organization:false,program:false,contract:false},reviewer_id:null,approver_id:null,reference_ids:{},events:[{seq:1,action:"applied",actor_id:actor.id,role:actor.role}]};
}
function transitionPartner(record,event,actor){
  if(record?.schema!=="evercraft.lift.partner-workflow.v1"||!event?.action)refuse("invalid partner or action");
  const p={...record,checks:{...record.checks},reference_ids:{...record.reference_ids},events:[...record.events]};
  const gate=(roles)=>actorGate(actor,p,roles,true);
  const status=(s)=>{if(!s.includes(p.status))refuse(`invalid partner ${event.action} transition`);};
  switch(event.action){
    case "begin_review":gate(["partner_reviewer"]);status(["applied"]);p.status="due_diligence";p.reviewer_id=actor.id;break;
    case "verify":
      gate(["partner_reviewer"]);status(["due_diligence"]);if(actor.id!==p.reviewer_id)refuse("assigned reviewer required");
      if(!["organization","program","contract"].includes(event.check)||!assertVault(event.evidence_ref))refuse("verified evidence reference required");
      p.checks[event.check]=true;p.reference_ids[event.check]=event.evidence_ref;break;
    case "activate":
      gate(["partner_approver"]);status(["due_diligence"]);
      if(actor.id===p.reviewer_id||Object.values(p.checks).some(v=>v!==true))refuse("independent approval and completed due diligence required");
      p.status="active";p.approver_id=actor.id;break;
    case "suspend":
      gate(["partner_reviewer","partner_approver"]);status(["active"]);
      p.status="suspended";break;
    case "reject":
      gate(["partner_reviewer"]);status(["applied","due_diligence"]);p.status="rejected";break;
    default:refuse("unrecognized partner action");
  }
  p.events.push({seq:p.events.length+1,action:event.action,actor_id:actor.id,role:actor.role});
  return p;
}
function partnerDirectorySnapshot(p){
  if(p?.schema!=="evercraft.lift.partner-workflow.v1"||p.status!=="active"||Object.values(p.checks).some(v=>!v))refuse("partner not approved for directory");
  return Object.freeze({id:p.id,public_name:p.public_name,regions:[...p.regions],categories:[...p.categories],assistance_kinds:[...p.assistance_kinds],active:true,eligibility_confirmed:false,capacity_confirmed:false});
}
export {makeCase,transitionCase,casePublicSnapshot,makePartner,transitionPartner,partnerDirectorySnapshot};
