import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditSocialContinuity} from '../systemia/clip/social-continuity-watch.mjs';
const queue=JSON.parse(fs.readFileSync('distribution/marketing/work-saban-20261030.review.json','utf8'));
const workflow=fs.readFileSync('.github/workflows/clip-social-continuity-watch.yml','utf8');

test('Work Saban is reconciled by the actual Clip six-hour watch, not a fake publishing job',()=>{
 assert.match(workflow,/cron: '17 \*\/6 \* \* \*'/);
 assert.match(workflow,/Work Saban launch receipt watch \(read-only\)/);
 assert.match(workflow,/--queue distribution\/marketing\/work-saban-20261030\.review\.json/);
 assert.match(workflow,/--out artifacts\/clip\/social-continuity-watch\/work-saban\/latest\.json/);
 assert.match(workflow,/artifacts\/clip\/social-continuity-watch\/work-saban\/mission-snapshot\.json/);
 assert.doesNotMatch(workflow,/publishClipSocialPost\(/);
});
test('no approval or provider receipt means zero verified Work Saban social posts',()=>{
 const result=auditSocialContinuity({queue,receipts:[],now:new Date('2026-10-30T20:00:00Z'),receiptSourceAvailable:false});
 assert.equal(result.status,'owner_review_required');
 assert.equal(result.counts.total,5);
 assert.equal(result.counts.approval_hold,5);
 assert.equal(result.counts.provider_receipt_recorded,0);
 assert.equal(result.receipt_source_available,false);
 for(const e of result.entries){
  assert.equal(e.state,'approval_hold');
  assert.equal(e.provider_post_url,null);
  assert.equal(e.authorization_present,false);
 }
});
test('fabricated post URLs without proper approvals never become publication receipts',()=>{
 const sample=queue.entries[0];
 const fake={schema:'evercraft.clip.social-publish-receipt.v1',status:'published',
 requestId:sample.id,authorizationRef:'fabricated-ref',remoteId:'1234',
 url:'https://www.facebook.com/evercraft/posts/1234',publishedAt:'2026-10-30T20:00:00Z',
 sourceRefs:['provider:imitation']};
 const result=auditSocialContinuity({queue,receipts:[fake],now:new Date('2026-10-30T20:05:00Z'),receiptSourceAvailable:true});
 assert.equal(result.counts.provider_receipt_recorded,0);
 assert.equal(result.entries[0].state,'approval_hold');
});
