import test from 'node:test';
import assert from 'node:assert/strict';
import {appendRelationshipEvidence} from './relationship-ingest.mjs';
import {projectRelationshipReview} from './relationship-policy.mjs';

const now=new Date('2026-10-21T20:00:00Z');
const start={schema:'evercraft.crm.relationship-ledger.v1',tenant_id:'evercraft',revision:'genesis',records:[]};
const initial={
 relationship_ref:'internal:relation',subject_ref:'internal:party',division_id:'evercraft-home',
 kind:'partner',stage:'discussion',source_ref:'source:inbox-message',
 not_before:'2026-10-01T07:00:00Z',next_review_at:'2026-10-05T07:00:00Z'
};
const first={event_ref:'source:message-1',type:'contact_window_acknowledged',
 evidence_ref:'source:message-1',source_message_ref:'provider:synthetic:1',
 occurred_at:'2026-09-16T18:30:00Z',
 private_context:'Partner preferred a follow-up after their busiest month.'};
test('record creation is manual-only and evidence linked, never sales authorized',()=>{
 const r=appendRelationshipEvidence({ledger:start,initial,event:first,now});
 assert.equal(r.state,'created');
 assert.equal(r.ledger.records[0].outbound_policy,'manual_review_only');
 assert.deepEqual(r.ledger.records[0].allowed_purposes,[]);
 assert.equal(r.ledger.records[0].timeline.length,1);
 assert.equal(r.receipt.contact_permission_granted,false);
 const due=projectRelationshipReview(r.ledger,{now});
 assert.equal(due.signals.length,1);
 assert.equal(JSON.stringify(r.receipt).includes(first.private_context),false);
});
test('new evidence appends without rewriting relationship state or original note',()=>{
 const a=appendRelationshipEvidence({ledger:start,initial,event:first,now});
 const original=JSON.stringify(a.ledger);
 const b=appendRelationshipEvidence({ledger:a.ledger,initial,event:{
   event_ref:'source:message-2',type:'meeting_discussed',
   evidence_ref:'source:message-2',occurred_at:'2026-10-08T18:00:00Z',
   private_context:'Suggested agenda and example to discuss.'
 },now});
 assert.equal(b.state,'appended');
 assert.equal(b.ledger.records[0].timeline.length,2);
 assert.equal(b.ledger.records[0].outbound_policy,'manual_review_only');
 assert.equal(b.ledger.records[0].next_review_at,initial.next_review_at);
 assert.equal(JSON.stringify(a.ledger),original);
 const dup=appendRelationshipEvidence({ledger:b.ledger,initial,event:first,now});
 assert.equal(dup.state,'duplicate');
 assert.equal(dup.ledger.revision,b.ledger.revision);
});
test('id conflicts and identity conflation reject import',()=>{
 const a=appendRelationshipEvidence({ledger:start,initial,event:first,now});
 assert.throws(()=>appendRelationshipEvidence({ledger:a.ledger,initial,event:{
  ...first,private_context:'changed evidence'
 },now}),/event_conflict/);
 assert.throws(()=>appendRelationshipEvidence({ledger:a.ledger,
  initial:{...initial,division_id:'other'},event:{...first,event_ref:'3'},now}),/identity_conflict/);
 assert.throws(()=>appendRelationshipEvidence({ledger:a.ledger,
  initial:{...initial,relationship_ref:'other'},event:{...first,event_ref:'4'},now}),/duplicate_subject_division/);
});
test('an incoming opt-out event does not restore outbound permission',()=>{
 const a=appendRelationshipEvidence({ledger:start,initial,event:first,now});
 const b=appendRelationshipEvidence({ledger:a.ledger,initial,event:{
  event_ref:'event:optout',type:'no_contact_requested',
  evidence_ref:'inbox:evidence',occurred_at:'2026-10-19T00:00:00Z'
 },now});
 assert.equal(b.ledger.records[0].outbound_policy,'manual_review_only');
 assert.equal(b.ledger.records[0].timeline.at(-1).type,'no_contact_requested');
});
