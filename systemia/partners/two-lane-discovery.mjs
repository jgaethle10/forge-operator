// Harbor -> Systemia, dual-lane partner opportunity admission.
// Pure offline planning; reuses existing owned Opportunity Fabric matcher.
// Do NOT treat prospect-supplied evidence or self-declared credentials as verified.
// Never contacts candidates, creates partner relationships, quotes earnings or pays.
import crypto from 'node:crypto';
import {buildPublicListing,matchOpportunities} from '../opportunity-fabric/engine.mjs';

export const PARTNER_PROSPECT_SCHEMA='evercraft.partners.discovery-candidate.v1';
export const PARTNER_TRIAGE_SCHEMA='evercraft.partners.dual-lane-triage.v1';
const CASE=/^[a-f0-9]{24}$/i;
const REGION=/^[a-z]{2,3}(?:-[a-z0-9]{1,8})?$/i;
const URL_MAX=2048;
const TYPES=new Set(['EPS_OPERATING','PRODUCT_DISTRIBUTION']);
const sha=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const fail=code=>{throw Error('partner_discovery_'+code)};
const finiteDate=s=>typeof s==='string'&&s.length<=40&&Number.isFinite(Date.parse(s));
const normTags=(a,max=20)=>Array.isArray(a)?[...new Set(a.filter(x=>typeof x==='string')
 .map(x=>x.trim().toLowerCase()).filter(x=>/^[a-z][a-z0-9 _-]{1,79}$/.test(x)))].slice(0,max):[];

function publicEvidenceUrl(value){
 if(typeof value!=='string'||value.length>URL_MAX)return false;
 try{
  const u=new URL(value);
  const h=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.port||
     !h.includes('.')||/^(?:localhost|0\.0\.0\.0|127\.)/.test(h)||
     /^(?:10|192\.168)\./.test(h)||/^172\.(?:1[6-9]|2\d|3[01])\./.test(h)||
     /(?:\.internal|\.local|\.test|\.invalid)$/.test(h))return false;
  return true;
 }catch{return false}
}
function checkProspect(p){
 if(p?.schema!==PARTNER_PROSPECT_SCHEMA||!CASE.test(p.case_id||'')||
    !Number.isInteger(p.revision)||p.revision<1||p.revision>9999||
    !TYPES.has(p.lane)||!REGION.test(p.country||'')||
    !['research','applicant_interest','invited_conversation'].includes(p.source_mode))
    fail('schema_or_identity_invalid');
 if(p.source_mode!=='research'&&p.permission_state!=='CONSENT_DOCUMENTED')
    fail('permission_state_not_recorded');
 if(p.personal_contact||p.email||p.phone||p.private_notes||p.raw_message)
    fail('private_contact_material_forbidden');
 return p;
}
function compareFit(p){
 const eps=p.lane==='EPS_OPERATING';
 const founder=buildPublicListing({
  owner_id:'evercraft-owned-partner-model',listing_id:eps?'model:eps':'model:distribution',
  title:eps?'EPS software and remote-ops partnership':'Evercraft product distribution network',
  offers:eps?['software systems','remote operations','lead intake','scheduling']:
    ['approved product demos','owned customer fulfillment'],
  needs:eps?['field equipment','operating labor']:
    ['permissioned audience','qualified buyer introductions'],
  categories:eps?['property services']:['product distribution'],
  collaboration_modes:eps?['operations collaboration']:['distribution collaboration'],
  geography:{remote_ok:true}
 });
 const candidate=buildPublicListing({
  owner_id:'prospect:'+p.case_id,listing_id:'prospect:'+p.case_id+':'+p.revision,
  title:'Private partner discovery candidate',summary:'No public identity in source-safe match',
  offers:eps?normTags(p.equipment_categories).length?['field equipment','operating labor']:[]:
    normTags(p.sales_channels).length?['permissioned audience','qualified buyer introductions']:[],
  needs:eps?['software systems','remote operations']:['approved product demos','owned customer fulfillment'],
  categories:eps?['property services']:['product distribution'],
  collaboration_modes:eps?['operations collaboration']:['distribution collaboration'],
  geography:{remote_ok:Boolean(p.remote_collaboration_possible)}
 });
 const match=matchOpportunities([founder,candidate],{minimum_score:0})[0];
 return {matcher:'evercraft.opportunity-fabric.match.v1',fitScore:match?.score||0,
   evidenceCategories:match?.evidence||{},protectedMaterialDisclosed:false,
   // These are preliminary tag overlaps, NOT verified capacity or sales ability.
   verifiedCapabilityFit:false};
}
/**
 * Use trustedReview ONLY when an authorized operator separately looked up
 * original sources, licenses, capacity and permissioned contact route.
 * A Harbor summary, partner email or generated brief cannot confer those flags.
 */
export function assessPartnerProspect(prospect,{trustedReview={},
 approvedFulfillableProductKeys=[]}={}){
 const p=checkProspect(prospect);
 const eps=p.lane==='EPS_OPERATING';
 const evidence=Array.isArray(p.source_evidence)?p.source_evidence:[];
 const valid=evidence.length>0&&evidence.length<=12&&evidence.every(row=>
  publicEvidenceUrl(row?.url)&&finiteDate(row?.observed_at)&&
  ['business_website','professional_profile','registry','public_post','owner_statement']
    .includes(row?.kind));
 const subjectTags=eps?normTags(p.equipment_categories):normTags(p.sales_channels);
 const missing=[];
 if(!valid)missing.push('original_source_evidence_required');
 if(!subjectTags.length)missing.push(eps?'equipment_or_crew_categories_missing':'sales_channels_missing');
 if(!normTags(p.specialties).length)missing.push('industry_specialty_missing');
 if(!trustedReview.originalSourceChecked)missing.push('independent_source_review_missing');
 if(!trustedReview.counterpartyIdentityChecked)missing.push('counterparty_identity_unverified');
 if(!trustedReview.regionEligibilityChecked)missing.push('territory_and_compliance_review_missing');
 if(!trustedReview.consentBasedContactRouteChecked)missing.push('permissioned_contact_route_unverified');
 if(eps){
  if(!trustedReview.equipmentAndOwnershipChecked)missing.push('equipment_and_control_unverified');
  if(!trustedReview.crewAndCapacityChecked)missing.push('crew_and_capacity_unverified');
  if(!trustedReview.licenseInsuranceSafetyChecked)missing.push('licensing_insurance_safety_unverified');
  if(!trustedReview.remoteOpsInterestConfirmed)missing.push('remote_ops_partner_interest_unverified');
 }else{
  if(!trustedReview.audienceAndChannelChecked)missing.push('audience_and_channels_unverified');
  if(!trustedReview.permissionedSalesPracticeChecked)missing.push('permissioned_sales_practice_unverified');
  const keys=normTags(p.product_keys);
  const allowed=new Set(normTags(approvedFulfillableProductKeys,100));
  if(!keys.length)missing.push('product_match_missing');
  if(!keys.some(k=>allowed.has(k)))missing.push('no_independently_verified_fulfillable_offer');
  if(!trustedReview.independentProductFitChecked)missing.push('independent_product_fit_unverified');
 }
 const match=compareFit(p);
 const stage=!valid?'NEEDS_SOURCE_EVIDENCE':missing.length?
   'PRIVATE_QUALIFICATION_PENDING':'READY_FOR_FOUNDER_DISCUSSION';
 const key='partner-discovery:'+p.case_id+':v'+p.revision;
 return Object.freeze({
  schema:PARTNER_TRIAGE_SCHEMA,
  caseRef:key,revision:p.revision,lane:p.lane,stage,
  missing,match,
  nextAction:stage==='NEEDS_SOURCE_EVIDENCE'?'RESEARCH_ORIGINAL_PUBLIC_SOURCE':
    stage==='PRIVATE_QUALIFICATION_PENDING'?'VERIFY_MISSING_FACTS_PRIVATELY':
      'SEEK_OWNER_REVIEW_BEFORE_ANY_CONTACT_OR_AGREEMENT',
  evidenceDigest:valid?'sha256:'+sha(evidence.map(e=>[e.url,e.kind,e.observed_at])):null,
  economics:eps?
   {structure:'FOUNDER_PROPOSED_50_50_OPERATING_PARTNERSHIP',
    contributions:['evercraft_software_and_remote_ops','partner_equipment_and_operating_labor'],
    splitBasis:'UNDEFINED_PENDING_SIGNED_TERMS',
    equityOrGrossRevenueShareGuaranteed:false,partnerAgreementExecuted:false}:
   {structure:'PRODUCT_DISTRIBUTION_PROGRAM',
    commissionRate:'UNSET',eligibleProductsApprovedByContract:false,
    recruitmentPaymentsAllowed:false,partnerAgreementExecuted:false},
  boundaries:{publicPublishingAllowed:false,outboundContactAuthorized:false,
    agentEnrollmentAllowed:false,protectedDataDisclosed:false,automaticCommission:false,
    legalAgreementCreated:false,customerPaymentCreated:false,
    sourceAssertionsAreNotVerification:true,matchIsNonBinding:true}
 });
}
/** Build an idempotent, privacy-minimized *candidate* for existing Intake Fabric.
 * Execution happens only if a separately authorized adapter invokes Intake,
 * which enforces Passport for intake.write.agent. This function never ingests.
 */
export function buildPartnerIntakeCandidate(prospect,{adapterActorRef,receivedAt}={}){
 const p=checkProspect(prospect);
 if(typeof adapterActorRef!=='string'||!/^adapter:[a-z0-9-]{3,72}$/.test(adapterActorRef))
  fail('trusted_adapter_actor_required');
 if(!finiteDate(receivedAt))fail('trusted_received_at_required');
 const triage=assessPartnerProspect(p);
 const key=triage.caseRef;
 const fingerprint='sha256:'+sha({
  case_id:p.case_id,revision:p.revision,lane:p.lane,country:p.country,
  specialties:normTags(p.specialties),categories:p.lane==='EPS_OPERATING'?
   normTags(p.equipment_categories):normTags(p.sales_channels),
  evidence:triage.evidenceDigest,
 });
 return {
  idempotency_key:key,adapter_actor_ref:adapterActorRef,
  source_type:'agent',source_ref:'harbor:partner-opportunity-research',
  external_event_id:key,source_trust_state:'untrusted_external',
  claimed_source_identity_ref:null,verified_source_identity_ref:null,
  content_ref:'private:partner-opportunity:'+p.case_id+':v'+p.revision,
  content_fingerprint:fingerprint,
  intent_excerpt:p.lane==='EPS_OPERATING'?
   'Potential EPS equipment-and-crew operating partner. Verified business, safety, capacity, proposed 50/50 economics and signed agreement pending.':
   'Potential Evercraft product distribution partner. Actual audience, compliant sales practice, fulfillable products and commission agreement pending.',
  requested_capability_hints:p.lane==='EPS_OPERATING'?
    ['evercraft-property-services','opportunity-fabric','remote-ops','partner-screening']:
    ['evercraft-partners','opportunity-fabric','distribution','partner-screening'],
  claimed_priority:'normal',received_at:new Date(receivedAt).toISOString(),
  attachments:[],
  // Intentionally no contract, fee, contact address, sources, customer data or secrets.
 };
}
