import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createWorld,advanceWorld,PUBLIC_GENESIS_MS,REAL_TICK_MS} from '../public/the-window/world.mjs';
import {decideCivic} from '../systemia/society/window-civic.mjs';
import {decideSocial} from '../systemia/society/window-social.mjs';
import {projectDecisionReceipts,RECEIPT_SCHEMA,MAX_DECISION_RECEIPTS} from '../systemia/society/window-decision-receipts.mjs';
import {advanceHeartbeat,STATE_SCHEMA} from '../systemia/society/window-heartbeat.mjs';

function scenario(steps=30){
 const w=createWorld(0,818);
 for(let i=0;i<steps;i++){
   advanceWorld(w,(i+1)*REAL_TICK_MS);
   decideCivic(w);
   decideSocial(w);
 }
 return w;
}
test('policy receipts are grounded in existing civic and social events, not fabricated LLM actions',()=>{
 const w=scenario(30);
 const before=JSON.stringify(w);
 const projection=projectDecisionReceipts(w,1);
 assert.equal(projection.schema,RECEIPT_SCHEMA);
 assert.equal(projection.execution_mode,'deterministic_rules_no_llm');
 assert.equal(projection.attestation,'content_digest_not_signature');
 assert.ok(projection.receipts.length>0);
 assert.ok(projection.receipts.some(r=>r.source==='rule_policy_v1'));
 assert.ok(projection.receipts.some(r=>r.source==='social_policy_v1'));
 assert.ok(projection.receipts.every(r=>r.inference==='none'&&r.fictional&&r.external_actions===false));
 const residentIds=new Set(w.actors.map(a=>a.id));
 for(const row of projection.receipts){
   assert.ok(residentIds.has(row.actor_id));
   assert.ok(w.events.some(e=>e.id===row.event_id));
   assert.match(row.content_sha256,/^[a-f0-9]{64}$/);
 }
 assert.equal(JSON.stringify(w),before,'receipt generation must never mutate shared society');
 assert.deepEqual(projectDecisionReceipts(w,1),projection,'same snapshot must generate same receipts');
});
test('only new, retained policy events are included, with independent coverage disclosure',()=>{
 const w=scenario(30);
 const earliest=w.next_event_id-5;
 const projection=projectDecisionReceipts(w,earliest);
 assert.equal(projection.total_events_generated,5);
 assert.equal(projection.events_available_in_bounded_ledger,5);
 assert.equal(projection.coverage,'complete');
 assert.ok(projection.receipts.every(r=>Number(r.event_id.slice(1))>=earliest));
 assert.equal(projectDecisionReceipts(w,w.next_event_id).receipts.length,0);
});
test('long outages are explicitly partial when the bounded chronicle cannot cover every event',()=>{
 const w=createWorld(0,818);
 w.events=Array.from({length:160},(_,i)=>({
   id:'e'+(200-i),source:'social_policy_v1',type:'promise_made',
   agent:'r1',day:1,time:'08:00',description:'Synthetic test event '+(200-i)
 }));
 w.next_event_id=201;
 const projection=projectDecisionReceipts(w,1);
 assert.equal(projection.coverage,'partial_bounded_ledger');
 assert.equal(projection.total_events_generated,200);
 assert.equal(projection.events_available_in_bounded_ledger,160);
 assert.equal(projection.policy_events_available,160);
 assert.equal(projection.captured_receipts,MAX_DECISION_RECEIPTS);
 assert.equal(projection.omitted_policy_events,160-MAX_DECISION_RECEIPTS);
 assert.equal(projection.receipts[0].event_id,'e200');
});
test('unknown identities, duplicated or malformed events fail closed',()=>{
 const w=scenario(25);
 const invalid=(change)=>{const x=structuredClone(w);change(x);return x;};
 assert.throws(()=>projectDecisionReceipts(w,0),/Invalid society/);
 assert.throws(()=>projectDecisionReceipts(w,w.next_event_id+1),/Invalid society/);
 assert.throws(()=>projectDecisionReceipts(w,1,{limit:999}),/Invalid society/);
 const forged=invalid(x=>{x.events.unshift({...x.events[0],id:'e'+(x.next_event_id-1),agent:'not-a-resident',source:'social_policy_v1',type:'promise_made'});});
 assert.throws(()=>projectDecisionReceipts(forged,1),/Duplicate event|Unknown decision actor/);
 const fake=invalid(x=>{x.events[0].id='e0';});
 assert.throws(()=>projectDecisionReceipts(fake,1),/Invalid event ID/);
});
test('observer projects existing persisted heartbeat without modifying pinned writer or world',()=>{
 const first=advanceHeartbeat({schema:STATE_SCHEMA,initialized:false,release_status:'held'},PUBLIC_GENESIS_MS+100*REAL_TICK_MS).state;
 const run=advanceHeartbeat(first,PUBLIC_GENESIS_MS+120*REAL_TICK_MS);
 assert.equal(run.changed,true);
 const state=run.state;
 assert.equal(state.decision_receipts,undefined,'pinned canonical writer must remain unchanged');
 const before=JSON.stringify(state);
 const projected=projectDecisionReceipts(state.world,1);
 assert.equal(projected.schema,RECEIPT_SCHEMA);
 assert.equal(createHash('sha256').update(JSON.stringify(state.world)).digest('hex'),state.world_hash);
 assert.ok(projected.receipts.length>0);
 assert.equal(JSON.stringify(state),before,'read-only projection cannot alter heartbeat');
 assert.equal(state.model_mode,'civic_and_social_policy_no_llm');
 assert.equal(state.release_status,'held');
});
