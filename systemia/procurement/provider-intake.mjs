/**
 * Evercraft first-party Washington government/provider intake preflight v1.
 * Offline admission and field-map contract. Does not browse, save or submit.
 */
import {createHash} from 'node:crypto';

const TARGETS=Object.freeze({
  wa_webs:{
    official_hosts:['pr-webs-vendor.des.wa.gov','des.wa.gov'],
    required_proofs:['business_identity','business_license','authorized_representative'],
    draft_fields:['legal_business_name','registered_trade_names','contact_email','service_categories'],
  },
  wa_pwsbe:{
    official_hosts:['omwbe.diversitycompliance.com'],
    required_proofs:['business_identity','ownership_documents','business_license','tax_document_inventory'],
    draft_fields:['legal_business_name','registered_trade_names','service_categories','business_description'],
  },
  wa_mrsc_vendor:{
    official_hosts:['mrscrosters.org','www.mrscrosters.org'],
    required_proofs:['business_identity','business_license','janitorial_scope','fee_or_waiver_review'],
    draft_fields:['legal_business_name','registered_trade_names','service_categories','service_area'],
  },
  wa_hrsn_remediation:{
    official_hosts:['dshs.wa.gov','www.dshs.wa.gov'],
    required_proofs:['business_identity','business_license','contractor_scope','current_scope_insurance','experience_evidence','staff_background_check_plan','operating_budget','financial_stewardship','owner_authority'],
    draft_fields:['legal_business_name','registered_trade_names','service_area','capability_summary','contact_email'],
  },
});
const SHA256_REF=/^sha256:[a-f0-9]{64}$/;
const EVIDENCE_STATES=new Set(['unverified','pending','verified','not_applicable']);
const OWNER_ONLY=/password|passcode|mfa|otp|captcha|ssn|social.security|date.of.birth|bank|routing|tax.return|net.worth|personal.income|owner.signature|legal.attestation|certify|eligibility.attestation|terms.acceptance|final.submission|payment|checkout|provider.one.id|background.check.number/i;

export function supportedGovernmentTargets(){return Object.keys(TARGETS);}
function targetFrom(value){
  const target=TARGETS[String(value||'')];
  if(!target) throw new Error('unsupported_government_target');
  return target;
}
function originFrom(target,url){
  if(typeof url!=='string'||url.length>2048) throw new Error('invalid_official_url');
  let parsed;
  try{parsed=new URL(url);}catch{throw new Error('invalid_official_url');}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||parsed.hash||!target.official_hosts.includes(parsed.hostname.toLowerCase())){
    throw new Error('unverified_official_origin');
  }
  return parsed.origin;
}
function onlyKeys(input,allowed,error){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.includes(key))) throw new Error(error);
}
function assertMissionId(value){
  if(!/^[a-z0-9][a-z0-9._:-]{7,100}$/i.test(value||'')) throw new Error('invalid_mission_id');
}
function checkEvidence(proof,key){
  onlyKeys(proof,['state','evidence_digest'],'untrusted_evidence_shape');
  if(!EVIDENCE_STATES.has(proof.state)) throw new Error('untrusted_evidence_state');
  if(proof.state==='verified'&&!SHA256_REF.test(proof.evidence_digest||'')) throw new Error('evidence_digest_required:'+key);
  if(proof.evidence_digest&&!SHA256_REF.test(proof.evidence_digest)) throw new Error('untrusted_evidence_digest');
}
/** Hash references are not independent source verification. No applicant values are accepted. */
export function prepareGovernmentProviderIntake(input){
  onlyKeys(input,['target_id','official_url','mission_id','evidence','draft_fields','free_only'],'untrusted_intake_shape');
  const target=targetFrom(input.target_id);
  const portalOrigin=originFrom(target,input.official_url);
  assertMissionId(input.mission_id);
  onlyKeys(input.evidence,target.required_proofs,'unexpected_evidence_key');
  for(const [key,proof] of Object.entries(input.evidence)) checkEvidence(proof,key);
  if(!Array.isArray(input.draft_fields)||input.draft_fields.length>20) throw new Error('untrusted_draft_fields');
  const fields=[],seen=new Set();
  for(const field of input.draft_fields){
    onlyKeys(field,['field','evidence_key'],'untrusted_draft_field_shape');
    if(!target.draft_fields.includes(field.field)||OWNER_ONLY.test(field.field)||seen.has(field.field)) throw new Error('forbidden_or_duplicate_draft_field');
    if(!target.required_proofs.includes(field.evidence_key)||input.evidence[field.evidence_key]?.state!=='verified'){
      throw new Error('unverified_draft_field_source');
    }
    seen.add(field.field);
    fields.push({field:field.field,evidence_key:field.evidence_key});
  }
  if(input.free_only!==true) throw new Error('payment_not_authorized');
  const blocking=target.required_proofs.filter(key=>input.evidence[key]?.state!=='verified');
  return Object.freeze({
    schema:'evercraft.procurement.provider-intake-preflight.v1',
    mission_id:input.mission_id,target_id:input.target_id,portal_origin:portalOrigin,
    evidence_keys_verified:target.required_proofs.filter(key=>input.evidence[key]?.state==='verified'),
    evidence_keys_blocking:blocking,draft_field_refs:fields,
    preflight_state:blocking.length===0?'offline_preflight_ready':'blocked_evidence_incomplete',
    runtime_admission_state:'unverified',portal_session_state:'not_started',
    portal_draft_state:'not_saved',submission_state:'not_attempted',agency_acceptance_state:'unverified',
    payment_authority:false,automated_terms_or_attestation_authority:false,
    automated_final_submission_authority:false,
    allowed_operation:'private_human_authorized_draft_preparation_only',
    disclaimer:'Evidence hashes and field maps are not agency approval or verified portal state.',
  });
}
/** Quarantine candidate receipt evidence without declaring actual submission or acceptance. */
export function quarantinePortalReceipt(input){
  onlyKeys(input,['target_id','mission_id','receipt_sha256','observed_channel'],'untrusted_receipt_shape');
  targetFrom(input.target_id);
  assertMissionId(input.mission_id);
  if(!SHA256_REF.test(input.receipt_sha256||'')) throw new Error('receipt_digest_required');
  if(!['portal_saved_draft','portal_submission','agency_acknowledgement'].includes(input.observed_channel)){
    throw new Error('unsupported_receipt_channel');
  }
  return Object.freeze({
    schema:'evercraft.procurement.unverified-receipt.v1',target_id:input.target_id,
    mission_id:input.mission_id,receipt_digest:input.receipt_sha256,
    observed_channel:input.observed_channel,
    verification_state:'requires_independent_portal_readback',submission_or_approval_proven:false,
  });
}
export function syntheticDigest(value){
  return 'sha256:'+createHash('sha256').update(String(value)).digest('hex');
}
