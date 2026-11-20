import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSystemiaFounderCreatorReview} from './systemia-harbor-upstream.mjs';

const NASA='https://science.nasa.gov/missions/hubble/nasa-explores-potential-commercial-servicing-for-hubble-telescope/';
const at='2026-11-20T20:30:00.000Z';
const base=()=>({
 source_department:'aaar',destination:'harbor',via:'systemia',
 sensitivity:'public',mission_id:'aaar-hubble-001',
 artifact_id:'public-hubble-brief-001',revision:'r1',
 source_receipt_ref:'aaar-signed-receipt-001',
 public_safe_summary:'A bounded, source-backed explanation of the servicing options for Hubble.',
 review_state:'in_progress',
 claims:[
  {claim_id:'c-request',text:'NASA is seeking industry concepts about potential Hubble orbital servicing.',
   evidence_state:'reported',source_urls:[NASA],uncertainty:'A request for information is not a mission approval.'},
  {claim_id:'c-approval',text:'The current request does not establish an approved rescue mission.',
   evidence_state:'reported',source_urls:[NASA],uncertainty:'A future mission remains uncommitted.'}
 ]
});
function trusted(record){
 const snapshot=structuredClone(record);
 return {
  isRegisteredProducer:d=>d==='aaar',
  verifySourceReceipt:identity=>identity.source_receipt_ref===snapshot.source_receipt_ref&&
   identity.revision===snapshot.revision&&identity.artifact_id===snapshot.artifact_id,
  verifyPublicProjection:(identity,payload)=>identity.source_receipt_ref===snapshot.source_receipt_ref&&
   payload.summary===snapshot.public_safe_summary&&
   JSON.stringify(payload.claims)===JSON.stringify(snapshot.claims.map(c=>({...c})))
 };
}
function draft(record=base()){
 const claimText="NASA is asking whether private teams could extend Hubble's useful life, but no rescue has been approved. The telescope has already given us decades of discoveries, and that doesn't make choosing what to do next any easier.\n\nWhat keeps me looking at this story is the people who have worked to keep an aging spacecraft useful. I want to understand the risks and economics of saving it instead of assuming that the most sentimental answer must also be the right one.";
 return {
  schema:'evercraft.creator.personal-post-candidate.v1',
  surface:'facebook-personal',format:'look-closer',
  story_id:'founder:hubble-source-bound-reflection',copy:claimText,
  upstream_source:{source_department:record.source_department,mission_id:record.mission_id,
   artifact_id:record.artifact_id,revision:record.revision,source_receipt_ref:record.source_receipt_ref},
  angle:{why_now:'An official request for ideas has reopened a significant public debate.',
   personal_observation:'I keep thinking about the people who make long-lived machines possible.',
   real_tension:'Technical risk and cost may conflict with our wish to preserve an iconic instrument.',
   reader_value:'Readers can distinguish an invitation for servicing concepts from an approved mission.'},
  sources:[{id:'nasa',url:NASA,kind:'primary',checked_at:at}],
  claims:[
   {claim:'NASA is asking for potential servicing concepts',truth_state:'attributed',
    source_ids:['nasa'],upstream_claim_id:'c-request',
    copy_span:"NASA is asking whether private teams could extend Hubble's useful life"},
   {claim:'No Hubble rescue mission has been approved yet',truth_state:'attributed',
    source_ids:['nasa'],upstream_claim_id:'c-approval',
    copy_span:'no rescue has been approved'}
  ],
  media_search:{attempted:true},
  media:{usage:'link-only',url:NASA},
  publish_state:'DRAFT_NOT_PUBLISHED',personal_voice_owner:'FOUNDER_TO_REVIEW',
  autopost_authorized:false
 };
}
function assess(record=base(),overrides={},checks=trusted(record)){
 return prepareSystemiaFounderCreatorReview({
  upstreamRecord:record,creatorDraft:Object.assign(draft(record),overrides),trustedChecks:checks
 });
}
test('verified AAAR → Systemia → Harbor source plus original five founder standards creates only review handoff',()=>{
 const r=assess();
 assert.equal(r.status,'READY_FOR_INDEPENDENT_EDITORIAL_REVIEW');
 assert.equal(r.candidate.schema,'evercraft.creator.editorial-review-handoff.v1');
 assert.equal(r.candidate.claim_binding_count,2);
 assert.match(r.candidate.exact_copy_sha256,/^sha256:[a-f0-9]{64}$/);
 assert.equal(r.candidate.policy_source_hashes.length,5);
 assert.match(r.candidate.founder_example_receipt.sha256,/^sha256:/);
 assert.equal(r.candidate.contains_personal_copy,false);
 assert.equal(r.candidate.verified_by_live_systemia,false);
 assert.equal(r.candidate.self_attested_claims_accepted,false);
 assert.equal(r.publication_authority,false);
 assert.equal(r.personal_account_authority,false);
 assert.equal(r.provider_posted,false);
 assert.equal(r.editorial_review_completed,false);
 assert.doesNotMatch(JSON.stringify(r),/What keeps me looking at this story|economics of saving it/);
});
test('no authenticated Systemia producer or signed source projection keeps founder candidate held',()=>{
 assert.equal(assess(base(),{},{}).reason,'unverified_upstream_evidence');
 const record=base(),checks=trusted(record);checks.verifySourceReceipt=()=>false;
 assert.equal(assess(record,{},checks).reason,'unverified_upstream_evidence');
 checks.verifySourceReceipt=()=>true;checks.verifyPublicProjection=()=>false;
 assert.equal(assess(record,{},checks).reason,'unverified_upstream_evidence');
});
test('self-claimed review and approval flags in upstream story cannot grant publication',()=>{
 const record=base();
 record.review_state='independent_reviewed';
 record.publication_authority=true;
 record.founder_approved=true;
 const r=assess(record);
 assert.equal(r.status,'READY_FOR_INDEPENDENT_EDITORIAL_REVIEW');
 assert.equal(r.publication_authority,false);
 assert.equal(r.editorial_review_completed,false);
});
test('new source revision invalidates old founder draft and no duplicate source accepted',()=>{
 const record=base();
 const old=draft(record);record.revision='r2';
 const r=prepareSystemiaFounderCreatorReview({
  upstreamRecord:record,creatorDraft:old,trustedChecks:trusted(record)
 });
 assert.equal(r.status,'HOLD');
 assert.equal(r.reason,'creator_upstream_revision_not_bound');
});
test('source claim alteration after signed projection holds before canonical drafting',()=>{
 const original=base(),changed=structuredClone(original);
 changed.claims[0].text='NASA has launched a Hubble rescue mission';
 const r=assess(changed,{},trusted(original));
 assert.equal(r.status,'HOLD');
 assert.equal(r.reason,'unverified_upstream_evidence');
});
test('reported evidence cannot be promoted to confirmed fact by a model',()=>{
 const record=base(),d=draft(record);
 d.claims[0].truth_state='confirmed';
 assert.equal(prepareSystemiaFounderCreatorReview({
  upstreamRecord:record,creatorDraft:d,trustedChecks:trusted(record)
 }).reason,'creator_claim_truth_state_inflated');
});
test('proposed or forecast claim needs exact qualifier in the copy',()=>{
 const record=base();
 record.claims[0].evidence_state='modeled';
 const d=draft(record);d.claims[0].truth_state='forecast';
 d.claims[0].qualifying_language_in_copy='might actually happen on Wednesday';
 const r=prepareSystemiaFounderCreatorReview({
  upstreamRecord:record,creatorDraft:d,trustedChecks:trusted(record)
 });
 assert.equal(r.status,'HOLD');
 assert.ok(r.blockers.includes('forecast_or_proposal_qualification_missing_0'));
});
test('an unverified factual claim cannot piggyback on an otherwise verified post',()=>{
 const record=base(),d=draft(record);
 d.claims.push({claim:'An unsupported claim about a launch date',truth_state:'confirmed',
  source_ids:['nasa'],upstream_claim_id:'c-nonexistent',
  copy_span:'no rescue has been approved'});
 assert.equal(prepareSystemiaFounderCreatorReview({
  upstreamRecord:record,creatorDraft:d,trustedChecks:trusted(record)
 }).reason,'creator_claim_not_in_verified_upstream');
});
test('extra unreviewed outside source cannot ride inside the approved packet',()=>{
 const record=base(),d=draft(record);
 d.sources.push({id:'random',url:'https://some-blog.example.net/my-news',kind:'independent_reporting',checked_at:at});
 assert.equal(prepareSystemiaFounderCreatorReview({
  upstreamRecord:record,creatorDraft:d,trustedChecks:trusted(record)
 }).reason,'creator_extra_unreviewed_source');
});
test('wrong source receipt, URL swap, or copy-span edit all hold',()=>{
 const record=base(),checks=trusted(record);
 let d=draft(record);d.upstream_source.source_receipt_ref='fake-issuer';
 assert.equal(prepareSystemiaFounderCreatorReview({upstreamRecord:record,creatorDraft:d,trustedChecks:checks})
   .reason,'creator_upstream_revision_not_bound');
 d=draft(record);d.claims[0].source_ids=['fake-source'];
 assert.equal(prepareSystemiaFounderCreatorReview({upstreamRecord:record,creatorDraft:d,trustedChecks:checks})
   .reason,'creator_claim_sources_not_bound_to_upstream');
 d=draft(record);d.claims[0].copy_span='a nonexistent caption phrase that did not appear';
 assert.equal(prepareSystemiaFounderCreatorReview({upstreamRecord:record,creatorDraft:d,trustedChecks:checks})
   .reason,'creator_claim_span_not_in_exact_copy');
});
test('personal Facebook never silently becomes corporate Page or automated account post',()=>{
 const record=base();
 const d=draft(record);d.surface='facebook-page';d.autopost_authorized=true;
 const r=prepareSystemiaFounderCreatorReview({upstreamRecord:record,creatorDraft:d,trustedChecks:trusted(record)});
 assert.equal(r.status,'HOLD');
 assert.equal(r.reason,'founder_canonical_editorial_preflight_held');
 assert.ok(r.blockers.includes('wrong_personal_creator_surface'));
 assert.ok(r.blockers.includes('personal_profile_autopost_not_allowed'));
});
test('policy source unavailable is not a pass and never leaks private exact copy',()=>{
 const record=base();
 const result=prepareSystemiaFounderCreatorReview({
  upstreamRecord:record,creatorDraft:draft(record),trustedChecks:trusted(record),
  repoRoot:'/nonexistent/path/for/canonical-publishing'
 });
 assert.equal(result.status,'HOLD');
 assert.equal(result.reason,'canonical_policy_or_candidate_preflight_unavailable');
 assert.equal(result.candidate,null);
});
