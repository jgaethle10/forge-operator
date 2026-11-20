import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { assessHarborGravityStory, HARBOR_STORY_SCHEMA, HARBOR_FACEBOOK_JOB_SCHEMA } from './gravity-story-gate.mjs';
const sha = s => createHash('sha256').update(s).digest('hex');
const pageId = '356956657493951';
const source = 'https://www.nasa.gov/news-release/test-original-story/';
const story = () => ({
  schema:HARBOR_STORY_SCHEMA,story_id:'example-source-001',headline:'A NASA milestone',
  category:'science',uncertainty_label:'CONFIRMED',
  evidence:[{source_url:source,source_kind:'primary',checked_at_utc:'2026-11-19T20:00:00Z'}],
  targets:[{page_id:pageId,relevance_reason:'Clear learning explanation for this audience'}],
  media_search:{attempted:true,outcome:'ORIGINAL_VIDEO_LINKED'},
  media:[{url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',usage:'link-only'}],
  post:{message:'NASA published a new milestone. Here is what it means for spacecraft communications.',link:source,angle:'science-explainer'},
  journal:{state:'JOURNAL_PENDING',canonical_url:null},first_comment:{state:'WAITING'},
});
const context = () => ({
  approvedPages:[{page_id:pageId,current_name:'Evercraft Learning Network',approved_name:'Evercraft Learning Network',status:'ACTIVE',founder_approved:true,identity_verified:true,provider:'facebook',approved_beats:['science']}],
  review:{claim_check:'PASSED',attribution_check:'PASSED',safety_check:'PASSED',media_rights_check:'PASSED'},
  publishedKeys:[],
});
function codes(s,c){return assessHarborGravityStory(s,c).blockers;}
test('valid approved science story yields a local Facebook job only, no provider action',()=>{
  const result=assessHarborGravityStory(story(),context());
  assert.equal(result.status,'READY_FOR_AUTHORIZED_OPERATOR_REVIEW');
  assert.deepEqual(result.blockers,[]);
  assert.equal(result.facebook_job_candidate.schema,HARBOR_FACEBOOK_JOB_SCHEMA);
  assert.equal(result.facebook_job_candidate.page_id,pageId);
  assert.equal(result.facebook_job_candidate.link,source);
  assert.equal(result.journal_state,'PENDING_OR_UNVERIFIED');
  assert.equal(result.first_comment_candidate,null);
  assert.equal(result.publishing_performed,false);
});
test('missing primary evidence and safety review hold story',()=>{
  const s=story(),c=context();s.evidence=[];c.review.safety_check='PENDING';
  assert.ok(codes(s,c).includes('no_source_evidence'));
  assert.ok(codes(s,c).includes('trusted_safety_review_missing'));
});
test('unknown or ineligible wrong Page is blocked even with otherwise clean text',()=>{
  const s=story(),c=context();c.approvedPages=[];
  assert.ok(codes(s,c).includes('page_not_in_trusted_registry'));
  c.approvedPages=context().approvedPages;c.approvedPages[0].approved_beats=['aviation'];
  assert.ok(codes(s,c).includes('story_outside_page_beat'));
});
test('frozen and name-mismatched Pages do not pass despite trusted registry entry',()=>{
  const s=story(),c=context();c.approvedPages[0].current_name='Little Red Writing Press';
  c.approvedPages[0].approved_name='Little Red Writing Press';
  assert.ok(codes(s,c).includes('excluded_frozen_or_held_page'));
  c.approvedPages[0].current_name='Evercraft Learning Network';
  assert.ok(codes(s,c).includes('page_approved_name_mismatch'));
});
test('mere public visibility or credit is not permission to reupload media',()=>{
  const s=story();s.media=[{url:'https://example.org/video.mp4',usage:'rights-cleared-reupload'}];
  assert.ok(codes(s,context()).includes('upload_rights_receipt_missing_0'));
  s.media[0].rights_receipt='owner-license-123';s.media[0].rights_status='VERIFIED';
  assert.deepEqual(codes(s,context()),[]);
});
test('source links are https; no Base44 Journal shortcut or private links',()=>{
  const s=story();s.evidence[0].source_url='http://localhost:8788/hello';
  assert.ok(codes(s,context()).includes('source_url_invalid_0'));
  s.evidence[0].source_url=source;s.post.link='https://evercraft.base44.app/test';
  assert.ok(codes(s,context()).includes('post_link_invalid'));
});
test('a recorded no-safe-media search is allowed for text-driven urgent coverage',()=>{
  const s=story();s.media=[];s.media_search={attempted:true,outcome:'NO_SAFE_MEDIA_FOUND'};
  assert.deepEqual(codes(s,context()),[]);
  s.media_search.attempted=false;
  assert.ok(codes(s,context()).includes('media_search_not_recorded'));
});
test('duplicate Page+story+angle+update is held, changed version is distinct',()=>{
  const s=story(),c=context();const key=assessHarborGravityStory(s,c).dedup_key;
  c.publishedKeys=[key];assert.ok(codes(s,c).includes('duplicate_story_page_angle_update'));
  s.post.update_version=1;assert.deepEqual(codes(s,c),[]);
});
test('publishing style rules reject em dash, en dash and And-leading paragraphs',()=>{
  const s=story();s.post.message='A milestone — from NASA.';
  assert.ok(codes(s,context()).includes('publishing_punctuation_standard_failed'));
  s.post.message='A milestone.\n\nAnd it continues.';
  assert.ok(codes(s,context()).includes('paragraph_starts_with_and'));
});
test('comment path requires actual live owned Journal, exact post ID and separate approved exact text',()=>{
  const s=story(),c=context(),url='https://worlds.systemiacommandcenters.com/journal/test';
  s.journal={state:'JOURNAL_LIVE',canonical_url:url};s.first_comment={state:'REQUESTED',target_post_id:'provider-post-42'};
  c.journal={urlReadback:url,editorialAccepted:true};c.providerPostId='provider-post-42';
  let r=assessHarborGravityStory(s,c);assert.equal(r.comment_status,'COMMENT_HELD');
  assert.ok(r.comment_blockers.includes('separate_comment_authority_missing'));
  c.commentAuthority={permitted:true,approvedTextHash:sha(`For the full story, original sources, context, and updates: ${url}`)};
  r=assessHarborGravityStory(s,c);
  assert.equal(r.comment_status,'READY_FOR_SEPARATE_COMMENT_OPERATOR_REVIEW');
  assert.equal(r.first_comment_candidate.post_id,'provider-post-42');
  assert.equal(r.commenting_performed,false);
  s.journal.canonical_url='https://evercraft.base44.app/journal/test';
  assert.equal(assessHarborGravityStory(s,c).first_comment_candidate,null);
});
test('unverified or developing anonymous claims cannot masquerade as confirmed',()=>{
  const s=story();s.uncertainty_label='HOLD';
  assert.ok(codes(s,context()).includes('source_not_editorially_eligible'));
  assert.throws(()=>assessHarborGravityStory({},context()),/schema_invalid/);
});
