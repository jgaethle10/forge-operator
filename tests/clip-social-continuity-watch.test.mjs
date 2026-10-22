import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {auditSocialContinuity,runSocialContinuityWatch} from '../systemia/clip/social-continuity-watch.mjs';
const now=new Date('2026-10-25T20:00:00Z');
function queue(approved=false){
  return {schema:'evercraft.marketing.owner-review-queue.v1',campaign_id:'evercraft-problem-first-20261022',entries:[
    {id:'EVC-PF-01',planned_day:'2026-10-22',authorization:{approved,authorizationRef:approved?'grant:1':null},proposed_channels:['facebook']}
  ]};
}
function receipt(changes={}){
  return {schema:'evercraft.clip.social-publish-receipt.v1',status:'published',requestId:'EVC-PF-01',authorizationRef:'grant:1',remoteId:'123_456',url:'https://www.facebook.com/123/posts/456',sourceRefs:['provider:facebook-graph-api-v26'],publishedAt:'2026-10-23T17:00:00Z',...changes};
}
test('never count unapproved draft as provider-published',()=>{
  const x=auditSocialContinuity({queue:queue(),receipts:[receipt()],now});
  assert.equal(x.status,'owner_review_required');
  assert.equal(x.counts.provider_receipt_recorded,0);
  assert.equal(x.entries[0].state,'approval_hold');
});
test('alert on approved-overdue content with no publisher receipt',()=>{
  const x=auditSocialContinuity({queue:queue(true),receipts:[],now});
  assert.equal(x.status,'attention_required');
  assert.equal(x.counts.overdue_approved,1);
});
test('require publisher-sourced receipt; do not claim live platform visibility',()=>{
  const x=auditSocialContinuity({queue:queue(true),receipts:[receipt()],now});
  assert.equal(x.counts.provider_receipt_recorded,1);
  assert.match(x.warnings[0],/do not prove live/);
});
test('reject wrong domain, missing provider source, wrong authorization and future receipt',()=>{
  for(const changes of [{url:'https://fake.example/post'},{sourceRefs:[]},{authorizationRef:'different'},{publishedAt:'2027-01-01T00:00:00Z'}]){
    const x=auditSocialContinuity({queue:queue(true),receipts:[receipt(changes)],now});
    assert.equal(x.counts.publish_exception,1);
  }
});
test('absent local receipt source does not prove lack of platform publication',()=>{
  const x=auditSocialContinuity({queue:queue(true),receipts:[],now,receiptSourceAvailable:false});
  assert.equal(x.entries[0].state,'receipt_source_unavailable');
});
test('persist structured local audit without posting, secrets or invented receipts',()=>{
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'clip-social-watch-'));
  try{
    const q=path.join(d,'queue.json'),r=path.join(d,'receipts'),o=path.join(d,'audit/latest.json');
    fs.mkdirSync(r);
    fs.writeFileSync(q,JSON.stringify(queue(true)));
    fs.writeFileSync(path.join(r,'receipt.json'),JSON.stringify(receipt()));
    const x=runSocialContinuityWatch({queueFile:q,receiptDir:r,outputFile:o,now});
    assert.equal(x.counts.provider_receipt_recorded,1);
    assert.equal(JSON.parse(fs.readFileSync(o,'utf8')).status,'receipts_recorded');
    const mission=JSON.parse(fs.readFileSync(path.join(d,'audit','mission-snapshot.json'),'utf8'));
    assert.equal(mission.schema,'evercraft.kaidance.mission-snapshot.v1');
    assert.equal(mission.counts.scanned,1);
    assert.equal(mission.counts.held,0);
    assert.equal(mission.boundaries.publication_authority,false);
  }finally{fs.rmSync(d,{recursive:true,force:true});}
});
