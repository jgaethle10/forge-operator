import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverHistoricalRequestThreads as discover} from './external-dependencies-backfill.mjs';
const key='synthetic-key-not-for-production-1234567890';
const m={message_id:'raw-message-1',thread_id:'raw-thread-1',direction:'sent',occurred_at:'2026-10-01T00:00:00Z',subject:'private subject',body:'private body'};
const reply={...m,message_id:'raw-message-2',direction:'inbound',occurred_at:'2026-11-01T00:00:00Z',has_attachment:true};
const run=(messages,coverage='complete_query')=>discover({messages,coverage,hmacKey:key});
test('sent and inbound in one candidate; no invented mission or delivery',()=>{
 const r=run([m,reply]);assert.equal(r.summary.candidate_threads,1);assert.equal(r.summary.both,1);
 assert.equal(r.summary.with_attachments,1);assert.equal(r.verified_requests,null);
 assert.equal(r.candidates[0].mission_binding_verified,false);assert.equal(r.candidates[0].response_verified,false);
 assert.equal(r.execution_authorized,false);
});
test('dedup and input ordering deterministic',()=>{
 assert.deepEqual(run([m,reply,m]),run([reply,m]));
});
test('raw content and identifiers never copied',()=>{
 const s=JSON.stringify(run([m,reply]));for(const raw of ['raw-message','raw-thread','private subject','private body'])assert.ok(!s.includes(raw));
});
test('conflicting identity held; invalid export marks coverage partial',()=>{
 assert.throws(()=>run([m,{...m,direction:'inbound'}]),/conflicting_message_identity/);
 assert.equal(run([m,{message_id:'bad'}]).source_coverage,'partial');
 assert.throws(()=>discover({messages:[m],hmacKey:'weak'}),/private_hmac_key_required/);
});
test('drafts excluded; inbound-only and unknown remain candidates',()=>{
 const r=run([reply,{...m,message_id:'draft',direction:'draft'},{...m,message_id:'unknown',thread_id:'other',direction:'unknown'}]);
 assert.equal(r.summary.candidate_threads,2);assert.equal(r.summary.with_sent,0);
 assert.equal(r.summary.with_inbound,1);assert.equal(r.candidates.filter(x=>x.review_required).length,2);
});
