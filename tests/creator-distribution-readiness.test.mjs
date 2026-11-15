import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { diagnosePublishingLanes, toMarkdown } from '../systemia/clip/distribution-readiness.mjs';

const now=new Date('2026-11-15T21:00:00.000Z');
function entry(changes={}){
  return {
    id:'example-evercraft',platform:'facebook',brand_key:'evercraft',
    candidate_account_label:'Evercraft company Facebook',account_id:null,
    account_identity_verified:false,platform_permissions_verified:false,
    authorization:{approved:false,authorizationRef:null},
    planned_day:'2026-11-12',...changes,
  };
}
function queue(rows=[entry()]){
  return {schema:'evercraft.marketing.owner-review-queue.v1',campaign_id:'test-creator-distribution',entries:rows};
}
const journal={schema:'evercraft.journal.index.v1',generated_at:'2026-11-11T08:00:00Z',live_edition:false,stories:[],archive:[{story_id:'old'}]};
test('unverified corporate Page account is not promoted to a publishing lane',()=>{
  const report=diagnosePublishingLanes({queue:queue(),journalIndex:journal,creatorPageSourcePresent:true,now});
  assert.equal(report.company.channels[0].state,'account_identity_unverified');
  assert.equal(report.company.channels[0].provider_post_url,null);
  assert.equal(report.creator.state,'source_present_external_deployment_unverified');
  assert.equal(report.journal.state,'no_verified_live_edition_in_source');
  assert.equal(report.journal.archive_count,1);
  assert.equal(report.boundaries.publication_performed,false);
});
test('company Page must independently pass identity, permissions and issuer release, in that order',()=>{
  const base={account_id:'12345678',account_identity_verified:true};
  let report=diagnosePublishingLanes({queue:queue([entry(base)]),now});
  assert.equal(report.company.channels[0].state,'platform_permissions_unverified');
  report=diagnosePublishingLanes({queue:queue([entry({...base,platform_permissions_verified:true})]),now});
  assert.equal(report.company.channels[0].state,'issuer_authority_not_recorded');
  report=diagnosePublishingLanes({queue:queue([entry({...base,platform_permissions_verified:true,authorization:{approved:true,authorizationRef:'test-ref'}})]),now});
  assert.equal(report.company.channels[0].state,'receipt_evidence_unavailable');
  report=diagnosePublishingLanes({queue:queue([entry({...base,platform_permissions_verified:true,authorization:{approved:true,authorizationRef:'test-ref'}})]),receiptEvidenceAvailable:true,now});
  assert.equal(report.company.channels[0].state,'provider_publication_unverified');
});
test('fake, mismatched and unverified receipts never imply reach',()=>{
  const row=entry({account_id:'12345678',account_identity_verified:true,platform_permissions_verified:true,authorization:{approved:true,authorizationRef:'grant:A'}});
  const receipts=[{schema:'evercraft.clip.social-publish-receipt.v1',requestId:row.id,status:'published',authorizationRef:'wrong-grant',remoteId:'123_456',url:'https://www.facebook.com/123/posts/456',sourceRefs:['provider:facebook-graph-api'],publishedAt:'2026-11-15T20:00:00Z'}];
  const x=diagnosePublishingLanes({queue:queue([row]),receipts,receiptEvidenceAvailable:true,now});
  assert.equal(x.company.channels[0].provider_receipt_recorded,false);
  assert.equal(x.company.channels[0].public_visibility_verified,false);
  assert.equal(x.company.channels[0].state,'provider_receipt_exception');
});
test('even a valid provider receipt requires independent public readback',()=>{
  const row=entry({account_id:'12345678',account_identity_verified:true,platform_permissions_verified:true,authorization:{approved:true,authorizationRef:'grant:A'}});
  const receipts=[{schema:'evercraft.clip.social-publish-receipt.v1',requestId:row.id,status:'published',authorizationRef:'grant:A',remoteId:'123_456',url:'https://www.facebook.com/123/posts/456',sourceRefs:['provider:facebook-graph-api'],publishedAt:'2026-11-15T20:00:00Z'}];
  const x=diagnosePublishingLanes({queue:queue([row]),receipts,receiptEvidenceAvailable:true,now});
  assert.equal(x.company.channels[0].state,'provider_receipt_external_visibility_unverified');
  assert.equal(x.company.channels[0].public_visibility_verified,false);
});
test('exclude independent or unrelated brands regardless of user-provided approval booleans',()=>{
  const x=diagnosePublishingLanes({queue:queue([entry({brand_key:'havenly-cleaning',account_id:'12345678',account_identity_verified:true,platform_permissions_verified:true,authorization:{approved:true,authorizationRef:'grant'}})]),now});
  assert.equal(x.company.channels[0].state,'excluded_brand_boundary');
});
test('existing Evercraft queue and Journal source produce a truthful handoff',()=>{
  const actualQueue=JSON.parse(fs.readFileSync('distribution/marketing/evercraft-partners-20261030.review.json','utf8'));
  const actualJournal=JSON.parse(fs.readFileSync('public/journal/index.json','utf8'));
  const x=diagnosePublishingLanes({queue:actualQueue,journalIndex:actualJournal,creatorPageSourcePresent:true,now});
  assert.equal(x.company.candidate_count,actualQueue.entries.length);
  assert.equal(Object.values(x.company.by_state).reduce((a,b)=>a+b,0),actualQueue.entries.length);
  assert.equal(x.journal.live_edition_in_source,actualJournal.live_edition);
  for(const platform of ['tiktok','youtube']){
    const represented=actualQueue.entries.some(e=>String(e.platform).toLowerCase()===platform);
    assert.equal(x.company.missing_platforms.some(p=>p.platform===platform),!represented);
  }
  const md=toMarkdown(x);
  assert.match(md,/Evercraft Creator & Publishing Lane Readiness/);
  assert.match(md,/account_identity_unverified/);
  assert.doesNotMatch(md,/Token [A-Za-z0-9]/);
});
test('owned creator front door is standalone, original and does not misrepresent publication',()=>{
  const html=fs.readFileSync('public/jesse/index.html','utf8');
  for(const term of ['Look closer.','Build better.','Field Notes','Build Log','Look Closer','Week in Motion','Original series · In development','mailto:jessegaethle10@gmail.com']){
    assert.ok(html.includes(term),term);
  }
  assert.doesNotMatch(html,/(?:base44\.app|tinyfish|christmaslightsusa)/i);
  assert.doesNotMatch(html,/href="https:\/\/(?:www\.)?(?:facebook|instagram|tiktok|linkedin)\.com/i);
  assert.match(html,/name="viewport"/);
  assert.match(html,/rel="canonical"/);
});
