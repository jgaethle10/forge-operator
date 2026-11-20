import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {preflightFounderPersonalPost,FOUNDER_DRAFT_SCHEMA,FOUNDER_PREFLIGHT_SCHEMA}
 from './founder-editorial-preflight.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const draft=()=>({
 schema:FOUNDER_DRAFT_SCHEMA,
 story_id:'founder:science:synthetic-hubble-reflection',
 surface:'facebook-personal',
 format:'look-closer',
 copy:"NASA is seeking proposals about whether Hubble's orbit can be raised, although no rescue has been approved. The telescope remains useful, and the agency is studying possible outcomes rather than announcing a fixed date.\n\nWhat stays with me is how much human care goes into keeping an older machine useful. The same telescope that inspired a generation still needs thoughtful decisions about risks, cost, and what we choose to preserve. I want to understand those tradeoffs before calling any option the obvious answer.",
 angle:{
  why_now:'A new primary-source NASA request has reopened a timely question.',
  personal_observation:'I care about the years of human work behind long-lived machines.',
  real_tension:'The benefits of preservation must be weighed against costs and risk.',
  reader_value:'Show why saving a scientific instrument is a difficult decision.'
 },
 sources:[{id:'nasa-source-1',
  url:'https://science.nasa.gov/missions/hubble/nasa-explores-potential-commercial-servicing-for-hubble-telescope/',
  kind:'primary',checked_at:'2026-11-20T19:00:00Z'}],
 claims:[
  {claim:'NASA is seeking proposals about Hubble orbit options',
   truth_state:'attributed',source_ids:['nasa-source-1']},
  {claim:'A rescue has not yet been approved',truth_state:'proposed',
   source_ids:['nasa-source-1'],
   qualifying_language_in_copy:'no rescue has been approved'},
 ],
 media_search:{attempted:true},
 media:{usage:'link-only',url:'https://science.nasa.gov/missions/hubble/'},
 publish_state:'DRAFT_NOT_PUBLISHED',
 personal_voice_owner:'FOUNDER_TO_REVIEW',
 autopost_authorized:false
});
const inspect=d=>preflightFounderPersonalPost(d);
test('read real repo policies and actual revised founder Facebook example, never fake an editorial pass',()=>{
 const r=inspect(draft());
 assert.equal(r.schema,FOUNDER_PREFLIGHT_SCHEMA);
 assert.equal(r.status,'READY_FOR_INDEPENDENT_EDITORIAL_REVIEW');
 assert.deepEqual(r.blockers,[]);
 assert.equal(r.policy_source_count,5);
 assert.match(r.documented_founder_example.sha256,/^sha256:[a-f0-9]{64}$/);
 assert.ok(r.canonical_policy_sources.some(s=>s.path.includes('HARBOR-EDITORIAL')));
 assert.ok(r.canonical_policy_sources.some(s=>s.path.includes('FOUNDING_DISTRIBUTION_RECOVERY')));
 assert.equal(r.contradictory_length_rule_enforced,false);
 assert.equal(r.independent_style_and_fact_review_completed,false);
 assert.equal(r.copy_authenticated_as_founder_voice,false);
 assert.equal(r.personal_account_authority_verified,false);
 assert.equal(r.publication_authority,false);
 assert.equal(r.provider_posted,false);
 assert.equal(r.first_comment_posted,false);
 assert.doesNotMatch(JSON.stringify(r),/I care about the years|NASA is seeking proposals|science\.nasa\.gov/);
});
test('length follows the story, never a manufactured two-paragraph 100-word limit',()=>{
 const x=draft(),four=[
  'One newly reported space development deserves closer examination because it affects future science decisions.',
  'The public evidence shows that a request for proposals is an invitation to explore options, not a confirmed flight.',
  'I am drawn to the workers and researchers who keep a mission useful long after its expected lifetime.',
  'That perspective matters when weighing potential technical benefits, future hazards, and the costs of doing nothing.'
 ];
 x.copy=four.join('\n\n');x.claims=x.claims.slice(0,1);
 assert.equal(inspect(x).status,'READY_FOR_INDEPENDENT_EDITORIAL_REVIEW');
 for(const constraints of [{word_limit:100},{paragraph_count:2},{exact_length_rule:'100 words'}]){
  const bad={...draft(),constraints};
  assert.ok(inspect(bad).blockers.includes('invented_length_rule_forbidden'));
 }
});
test('weak editorial formatting rejects chopped lines, And-openers and generic closer',()=>{
 for(const [copy,code] of [
  ['One telescope remains active.\n\nStill falling.\n\nA moment for humanity.','isolated_mini_paragraphs'],
  ['NASA requested ideas. The mission remains useful.\n\nAnd this may change everything.','and_leading_paragraph'],
  ['NASA is still considering options, but no mission is approved. #SaveHubble #Space','hashtag_engagement_campaign'],
  ['NASA is still examining options for the telescope. The future is ours.','generic_motivational_closer'],
  ['The orbit is changing — NASA is considering future options.','editorial_punctuation_requires_revision'],
 ]){
  const x=draft();x.copy=copy;
  assert.ok(inspect(x).blockers.includes(code),code);
 }
});
test('missing factual evidence, bad source and invented source status cannot be ready',()=>{
 let x=draft();x.sources=[];assert.ok(inspect(x).blockers.includes('news_source_evidence_missing'));
 x=draft();x.sources[0].url='http://127.0.0.1:8788/api';
 assert.ok(inspect(x).blockers.includes('primary_or_reporting_source_url_invalid_0'));
 x=draft();x.claims[0].source_ids=['invented-other-document'];
 assert.ok(inspect(x).blockers.includes('claim_source_binding_invalid_0'));
 x=draft();x.claims[0].truth_state='observed_true';
 assert.ok(inspect(x).blockers.includes('claim_truth_state_missing_0'));
});
test('forecasts, proposals and uncertain claims must have qualifier present in exact copy',()=>{
 for(const truth_state of ['forecast','proposed','uncertain']){
  const x=draft();x.claims[1].truth_state=truth_state;
  x.claims[1].qualifying_language_in_copy='this exact qualifier is not present';
  assert.ok(inspect(x).blockers.includes('forecast_or_proposal_qualification_missing_1'));
 }
});
test('authentic media search is required and unlicensed photo reupload cannot slip through',()=>{
 const x=draft();x.media_search={attempted:false};
 assert.ok(inspect(x).blockers.includes('media_source_search_missing'));
 x.media_search={attempted:true};x.media={usage:'licensed',provenance_ref:'nasa:photo'};
 assert.ok(inspect(x).blockers.includes('original_or_licensed_media_rights_missing'));
 x.media={usage:'no-safe-media'};
 assert.ok(inspect(x).blockers.includes('no_safe_media_reason_missing'));
});
test('paper review claims cannot impersonate human editor, account authority or Meta send',()=>{
 const x=draft();x.editorial_approved=true;x.autopost_authorized=true;x.publish_state='PUBLISHED';
 const r=inspect(x);
 assert.ok(r.blockers.includes('untrusted_authority_claim_editorial_approved'));
 assert.ok(r.blockers.includes('personal_profile_autopost_not_allowed'));
 assert.ok(r.blockers.includes('invented_publication_state'));
 assert.equal(r.provider_posted,false);
});
test('creator identity is required and company Page post is not personal Facebook',()=>{
 const x=draft();x.surface='facebook-page';x.format='institutional-promotion';
 assert.ok(inspect(x).blockers.includes('wrong_personal_creator_surface'));
 assert.ok(inspect(x).blockers.includes('creator_series_identity_missing'));
});
test('canonical documents must physically exist and retain distinct mandatory anchors',t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'founder-policy-'));
 t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 const files=[
  'docs/publishing/HARBOR-EDITORIAL-AND-CUSTOMER-COMMS-20261119.md',
  'docs/creator/FOUNDING_DISTRIBUTION_RECOVERY_20261115.md',
  'distribution/boardroom-public-launch-kit.md',
  'distribution/marketing/evercraft-research-launch-20261029.md',
  'distribution/marketing/boardroom-executive-chamber-20261029.md'
 ];
 assert.throws(()=>preflightFounderPersonalPost(draft(),{repoRoot:tmp}),/ENOENT/);
 for(const f of files){
  const destination=path.join(tmp,f);fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.copyFileSync(path.join(root,f),destination);
 }
 assert.equal(preflightFounderPersonalPost(draft(),{repoRoot:tmp}).status,
  'READY_FOR_INDEPENDENT_EDITORIAL_REVIEW');
 const harbor=path.join(tmp,files[0]);
 fs.writeFileSync(harbor,fs.readFileSync(harbor,'utf8')
  .replace('There is no mandatory paragraph count for social posts','Exactly two paragraphs under 100 words'));
 assert.throws(()=>preflightFounderPersonalPost(draft(),{repoRoot:tmp}),
  /creator_canonical_harbor_editorial_anchor_missing/);
});
test('replacing the reviewed example with a generic template fails closed',t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'founder-example-'));
 t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 const files=[
  'docs/publishing/HARBOR-EDITORIAL-AND-CUSTOMER-COMMS-20261119.md',
  'docs/creator/FOUNDING_DISTRIBUTION_RECOVERY_20261115.md',
  'distribution/boardroom-public-launch-kit.md',
  'distribution/marketing/evercraft-research-launch-20261029.md',
  'distribution/marketing/boardroom-executive-chamber-20261029.md'
 ];
 for(const f of files){
  fs.mkdirSync(path.dirname(path.join(tmp,f)),{recursive:true});
  fs.copyFileSync(path.join(root,f),path.join(tmp,f));
 }
 const example=path.join(tmp,files[4]);
 let source=fs.readFileSync(example,'utf8');
 const a='### Personal Facebook, for founder to share manually',
 b='### Personal LinkedIn, for founder to share manually';
 source=source.replace(source.slice(source.indexOf(a)+a.length,source.indexOf(b)),
  '\n\nI made an amazing product! Like and share!\n\n');
 fs.writeFileSync(example,source);
 assert.throws(()=>preflightFounderPersonalPost(draft(),{repoRoot:tmp}),
  /creator_founder_example_modified_or_truncated/);
});
