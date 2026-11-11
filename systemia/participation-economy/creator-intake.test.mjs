import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCreatorStory, CREATOR_STORY_SCHEMA } from './creator-intake.mjs';
const story = (patch={}) => ({
  id:'story:pilot001', creator_ref:'creator:sample', asset_ref:'asset:pilot',
  title:'The oldest marker in the valley', format:'documentary',
  destinations:['home','evermaps','journal','clip'], source_refs:['archive:1'],
  heritage:{cemetery_ref:'cemetery:tahoma',marker_ref:'marker:sample',location_confidence:'verified_marker'},
  creator_publish_opt_in:true, creator_revenue_opt_in:true,
  rights_asserted:true, original_work_asserted:true,
  identifies_living_people:false, contains_private_family_content:false,
  ...patch,
});
const review = (patch={}) => ({
  decision:'approved',reviewer_ref:'reviewer:editor',evidence_ref:'review:1',
  moderation_clear:true,rights_clear:true,heritage_clear:true,factual_clear:true,
  media_clear:true,living_people_privacy_clear:true,...patch,
});
test('pilot may reach editorial candidate state but cannot publish or pay',()=>{
  const p=evaluateCreatorStory({story:story(),review:review()});
  assert.equal(p.schema,CREATOR_STORY_SCHEMA);
  assert.equal(p.routes.length,4);
  assert.ok(p.routes.every(r=>r.state==='candidate_for_trusted_publisher_review' && !r.published));
  assert.equal(p.published,false);
  assert.equal(p.payable_cents,null);
  assert.equal(p.payouts_enabled,false);
  assert.equal(p.review_attestation,'caller_asserted_not_authenticated');
  assert.equal(p.monetization_state,'opted_in_pending_verified_campaign_and_terms');
});
test('without independent review every destination stays held',()=>{
  const p=evaluateCreatorStory({story:story()});
  assert.ok(p.routes.every(r=>r.state==='held'));
  assert.ok(p.routes[0].hold_reasons.includes('editorial_review_required'));
});
test('rejected editorial submissions cannot be presented as ready',()=>{
  const p=evaluateCreatorStory({story:story(),review:review({decision:'rejected'})});
  assert.ok(p.routes.every(r=>r.hold_reasons.includes('editorial_rejected')));
});
test('creator publication consent and rights are independent gates',()=>{
  const p=evaluateCreatorStory({story:story({creator_publish_opt_in:false,rights_asserted:false}),review:review()});
  assert.ok(p.routes.every(r=>r.hold_reasons.includes('creator_publication_consent_required')));
  assert.ok(p.routes.every(r=>r.hold_reasons.includes('creator_rights_assertion_required')));
});
test('living person records need privacy review and private family material is blocked',()=>{
  const p=evaluateCreatorStory({story:story({identifies_living_people:true,contains_private_family_content:true}),review:review({living_people_privacy_clear:false})});
  assert.ok(p.routes.every(r=>r.hold_reasons.includes('living_people_privacy_review_required')));
  assert.ok(p.routes.every(r=>r.hold_reasons.includes('private_family_content_not_publishable')));
});
test('EverMaps marker verification and sources are separate from Home',()=>{
  const p=evaluateCreatorStory({story:story({source_refs:[],heritage:{cemetery_ref:'cemetery:tahoma',location_confidence:'unverified'}}),review:review()});
  assert.equal(p.routes.find(r=>r.destination==='home').state,'candidate_for_trusted_publisher_review');
  assert.ok(p.routes.find(r=>r.destination==='evermaps').hold_reasons.includes('heritage_place_and_source_verification_required'));
  assert.ok(p.routes.find(r=>r.destination==='journal').hold_reasons.includes('journal_source_and_factual_review_required'));
});
test('only documentary video can be Clip candidate',()=>{
  const p=evaluateCreatorStory({story:story({format:'photo_essay'}),review:review()});
  assert.ok(p.routes.find(r=>r.destination==='clip').hold_reasons.includes('clip_video_and_media_review_required'));
});
test('missing review evidence and unknown destination fail closed',()=>{
  assert.throws(()=>evaluateCreatorStory({story:story(),review:{decision:'approved'}}),/review_invalid/);
  assert.throws(()=>evaluateCreatorStory({story:story({destinations:['home','outside']})}),/destinations_invalid/);
});
test('duplicate destinations, source refs, and private coordinates reject',()=>{
  assert.throws(()=>evaluateCreatorStory({story:story({destinations:['home','home']})}),/destinations_invalid/);
  assert.throws(()=>evaluateCreatorStory({story:story({source_refs:['source:a','source:a']})}),/sources_invalid/);
  assert.throws(()=>evaluateCreatorStory({story:story({latitude:46.6})}),/private_location_or_identity_field_forbidden/);
  assert.throws(()=>evaluateCreatorStory({story:story({heritage:{cemetery_ref:'cemetery:x',location_confidence:'verified_marker',coordinates:[1,2]}})}),/heritage_record_invalid/);
});
test('only revenue opt in changes modelled monetization state, never income',()=>{
  const p=evaluateCreatorStory({story:story({creator_revenue_opt_in:false}),review:review()});
  assert.equal(p.monetization_state,'not_opted_in');
  assert.equal(p.earnings_cents,null);
  assert.equal(p.financial_authority_granted,false);
});
