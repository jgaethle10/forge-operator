import crypto from 'node:crypto';

export const INFLUENCE_SCHEMA='evercraft.influence-lab.brief.v1';
export const MEASUREMENT_SCHEMA='evercraft.influence-lab.measurement.v1';
const TREATMENTS=Object.freeze([
  {key:'designer',angle:'craft_and_identity',creativeDirection:'An ownable aesthetic language of light, material, motion, and sonic rhythm. Show real product evidence; mark any synthetic representation as conceptual.',openingQuestion:'Why should this experience matter to someone?',proofRequirement:'Evidence-backed product footage or explicitly labeled concept art'},
  {key:'human',angle:'firsthand_credibility',creativeDirection:'Let a real operator or user show the work in their own words. Maintain imperfections where they are truthful, useful, and respectful.',openingQuestion:'Who actually uses this, and what changed for them?',proofRequirement:'Consent, identity/role context and verifiable firsthand observations'},
  {key:'proof',angle:'problem_to_outcome',creativeDirection:'Start with one observable problem, show the real working path, acknowledge limits and present an exact next action.',openingQuestion:'What can a skeptical buyer verify for themselves?',proofRequirement:'Source-linked demonstration, scoped deliverable and verified handoff'},
]);
const STAGES=['publication','visit','qualified_intent','checkout','settlement','fulfilled'];
const clean=value=>String(value??'').trim();
const unique=values=>[...new Set(values.map(clean).filter(Boolean))];
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function required(value,key){const out=clean(value);if(!out)throw new Error('influence_'+key+'_missing');return out;}
function refs(value,key){if(!Array.isArray(value)||value.length===0)throw new Error('influence_'+key+'_missing');return unique(value.map(v=>required(v,key)));}
function https(value,key){const raw=required(value,key);let parsed;try{parsed=new URL(raw)}catch{throw new Error('influence_'+key+'_invalid')}if(parsed.protocol!=='https:'||!parsed.hostname)throw new Error('influence_'+key+'_invalid');return parsed.toString();}

/** Source-only creative input. Not a Systemia admission, Boardroom quorum, Clip approval, or deployment. */
export function compileInfluenceBrief(input){
  if(input?.schema!==INFLUENCE_SCHEMA)throw new Error('influence_schema_invalid');
  const campaignId=required(input.campaignId,'campaign_id');
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,95}$/.test(campaignId))throw new Error('influence_campaign_id_invalid');
  const evidenceRefs=refs(input.evidenceRefs,'evidence_refs');
  const product=required(input.product,'product');
  const offerKey=required(input.offerKey,'offer_key');
  const buyerProblem=required(input.buyerProblem,'buyer_problem');
  const targetCommunity=required(input.targetCommunity,'target_community');
  const offerUrl=https(input.offerUrl,'offer_url');
  if(input.audienceSensitiveAttributes?.length)throw new Error('influence_sensitive_targeting_denied');
  if(input.manufacturedScarcity===true||input.fakeSocialProof===true)throw new Error('influence_manipulation_denied');
  const claims=(input.claims||[]).map((claim,index)=>({
    statement:required(claim.statement,'claim_'+index),
    evidenceRefs:refs(claim.evidenceRefs,'claim_'+index+'_sources'),
    observed:claim.observed===true,
  }));
  const output={schema:INFLUENCE_SCHEMA,campaignId,product,offerKey,offerUrl,
    buyerProblem,targetCommunity,evidenceRefs,claims,
    treatments:TREATMENTS.map(t=>({...t,campaignId:campaignId+'-'+t.key,sourceRefs:evidenceRefs,
      formatTargets:['hero_16_9','feed_4_5','story_9_16','square_1_1'],
      clipPublicationAuthority:false})),
    boundaries:{systemiaAdmitted:false,boardroomExecuted:false,partnerOutreachAuthorized:false,
      paymentsVerified:false,publicationAuthorized:false,syntheticMetricsForbidden:true,
      materialRelationshipDisclosureRequired:true},
    releaseState:'review_only',
  };
  return {...output,digest:digest(output)};
}

/** Creator review produces a HOLD or reviewable candidate, never outreach approval. */
export function reviewCreatorCandidate(input){
  const creatorRef=required(input?.creatorRef,'creator_ref');
  const fitRefs=refs(input?.fitEvidenceRefs,'creator_fit_sources');
  const userExperienceRefs=Array.isArray(input.experienceEvidenceRefs)?unique(input.experienceEvidenceRefs):[];
  const relationship=clean(input.materialRelationship||'none').toLowerCase();
  if(!['none','paid','gifted','affiliate','employee','other'].includes(relationship))throw new Error('influence_relationship_invalid');
  const reasons=[];
  if(input.optedIn!==true)reasons.push('creator_consent_not_proven');
  if(input.usageLicenseApproved!==true)reasons.push('usage_rights_not_proven');
  if(relationship!=='none'&&!clean(input.disclosureText))reasons.push('material_relationship_disclosure_missing');
  if(input.actualUseClaimed===true&&!userExperienceRefs.length)reasons.push('firsthand_usage_proof_missing');
  return {schema:'evercraft.influence-lab.creator-review.v1',creatorRef,fitEvidenceRefs:fitRefs,
    experienceEvidenceRefs:userExperienceRefs,materialRelationship:relationship,
    reviewState:reasons.length?'hold':'ready_for_human_review',reasons,
    externalContactAuthorized:false,publicationAuthorized:false};
}

/** Observations are not authenticated provider settlement; no revenue recognized here. */
export function summarizeInfluenceObservations({campaignId,events=[]}={}){
  required(campaignId,'campaign_id');
  if(!Array.isArray(events))throw new Error('influence_events_invalid');
  const seen=new Map(),checks=[];
  for(const event of events){
    if(event?.campaignId!==campaignId)throw new Error('influence_event_campaign_mismatch');
    const eventId=required(event.eventId,'event_id');
    if(!STAGES.includes(event.stage))throw new Error('influence_event_stage_invalid');
    const sourceRef=required(event.sourceRef,'event_source_ref');
    const evidenceState=clean(event.evidenceState||'unverified');
    if(!['unverified','observed','provider_reported'].includes(evidenceState))throw new Error('influence_event_evidence_state_invalid');
    if(event.stage==='settlement'&&(!Number.isSafeInteger(event.amountCents)||event.amountCents<0))throw new Error('influence_settlement_amount_invalid');
    const normalized={eventId,stage:event.stage,sourceRef,evidenceState,
      amountCents:event.stage==='settlement'?event.amountCents:null};
    if(seen.has(eventId)){
      if(JSON.stringify(seen.get(eventId))!==JSON.stringify(normalized))throw new Error('influence_event_replay_conflict');
      checks.push('duplicate_observation_ignored');continue;
    }
    seen.set(eventId,normalized);
  }
  const observed=[...seen.values()];
  const stages=Object.fromEntries(STAGES.map(stage=>{
    const entries=observed.filter(e=>e.stage===stage);
    return [stage,{coverage:entries.length?'reported':'unknown',reportedEventCount:entries.length||null,
      sourceRefs:unique(entries.map(e=>e.sourceRef))}];
  }));
  return {schema:MEASUREMENT_SCHEMA,campaignId,stages,observations:observed.length,
    deduplicatedInputs:checks.length,reportedSettlementCents:observed.filter(e=>e.stage==='settlement').reduce((sum,e)=>sum+e.amountCents,0)||null,
    independentlyVerifiedNetRevenueCents:null,attributedIncrementalRevenueCents:null,
    blockers:['provider_settlement_independent_verification_not_performed','refunds_and_costs_not_reconciled','incrementality_not_established'],
    publicationAuthority:false};
}

/** Content may become REVIEWABLE, but this function cannot approve publishing. */
export function preflightInfluenceDistribution({brief,creatorReview,offerReadiness}={}){
  if(brief?.schema!==INFLUENCE_SCHEMA)throw new Error('influence_brief_invalid');
  const reasons=[];
  if(creatorReview&&creatorReview.reviewState!=='ready_for_human_review')reasons.push('creator_rights_or_disclosure_hold');
  if(offerReadiness?.publicCanaryVerified!==true)reasons.push('live_offer_canary_missing');
  if(offerReadiness?.purchasePathIndependentlyVerified!==true)reasons.push('purchase_path_not_verified');
  if(offerReadiness?.fulfillmentReceiptVerified!==true)reasons.push('fulfillment_receipt_not_verified');
  if(offerReadiness?.observedAt&&Date.now()-Date.parse(offerReadiness.observedAt)>24*3600*1000)reasons.push('offer_evidence_stale');
  if(!offerReadiness?.observedAt||!Number.isFinite(Date.parse(offerReadiness.observedAt)))reasons.push('offer_observation_timestamp_missing');
  return {schema:'evercraft.influence-lab.distribution-preflight.v1',campaignId:brief.campaignId,
    state:reasons.length?'hold':'ready_for_separate_execution_gate_review',reasons,
    externalContactAuthorized:false,creatorCompensationAuthorized:false,publicationAuthority:false,
    note:'A positive review requires an independent Systemia/Passport/Clip authorization and cannot publish media.'};
}
