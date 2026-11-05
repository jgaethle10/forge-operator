import assert from 'node:assert/strict';
import { buildOneBodyVisualSnapshot } from './one-body-visibility.mjs';

const observedAt='2026-11-04T23:00:00Z';
const privateEventId='customer-personal-private-identifer-123';
const privateReceiptId='payment-private-receipt-789';
const state={
  schema:'evercraft.one-body.state.v1',
  events:{
    [privateEventId]:{
      event_id:privateEventId,product_key:'forensiscope',
      occurred_at:'2026-11-04T21:00:00Z',
      lanes:['context_fabric','organism_goal_runtime'],source_ref:'private-source-ref',
    },
    recent:{
      event_id:'recent',product_key:'evercraft-clip',
      occurred_at:'2026-11-04T22:55:00Z',
      lanes:['signal_fabric'],
    },
  },
  opportunities:{},products:{},lane_queues:{},
};
const base={state,observedAt,overdueAfterMs:60*60*1000};
const withoutProof=buildOneBodyVisualSnapshot(base);
assert.equal(withoutProof.schema,'evercraft.systemia.visual-snapshot.v1');
assert.equal(withoutProof.summary.counts.handoffs,3);
assert.equal(withoutProof.summary.counts.unobserved_overdue,2);
assert.equal(withoutProof.summary.counts.unverified,3);
assert.equal(withoutProof.summary.counts.consumer_receipt_verified,0);
assert.equal(withoutProof.summary.verified_runtime_health,false);
assert.equal(withoutProof.summary.payment_verified,false);
assert.equal(withoutProof.summary.execution_authority_granted,false);
assert.ok(withoutProof.nodes.some(x=>x.kind==='event'));
assert.ok(withoutProof.nodes.some(x=>x.kind==='lane'));
assert.ok(withoutProof.edges.some(x=>x.relationship==='planned_handoff'));
assert.equal(withoutProof.receipts.length,0);
assert.ok(withoutProof.nodes.length<=60);
assert.ok(withoutProof.edges.length<=160);
const json=JSON.stringify(withoutProof);
assert.ok(!json.includes(privateEventId),'raw event identity must not leak');
assert.ok(!json.includes('private-source-ref'),'source references must not leak');
assert.ok(!json.includes(privateReceiptId),'receipt refs must not leak');
assert.ok(!withoutProof.summary.gap_samples.some(x=>x.event_id===privateEventId));

const receipt={
  event_id:privateEventId, lane:'context_fabric',receipt_ref:privateReceiptId,
  observed_at:'2026-11-04T22:10:00Z',
  verified:true, // The incoming boolean itself provides no authority.
};
const supplied=buildOneBodyVisualSnapshot({...base,receiptObservations:[receipt]});
assert.equal(supplied.summary.counts.consumer_receipt_verified,0);
const rejected=buildOneBodyVisualSnapshot({...base,receiptObservations:[receipt],verifyReceipt:()=>false});
assert.equal(rejected.summary.counts.consumer_receipt_verified,0);
const accepted=buildOneBodyVisualSnapshot({
  ...base,receiptObservations:[receipt,receipt,
    {...receipt,lane:'unknown_lane'},
    {...receipt,observed_at:'2026-11-04T23:10:00Z'},
    {...receipt,observed_at:'2026-11-04T20:00:00Z'},
  ],
  verifyReceipt:(r)=>r.receipt_ref===privateReceiptId && r.event_id===privateEventId && r.lane==='context_fabric',
});
assert.equal(accepted.summary.counts.consumer_receipt_verified,1);
assert.equal(accepted.receipts.length,1);
assert.equal(accepted.summary.counts.unobserved_overdue,1);
assert.equal(accepted.summary.counts.unverified,2);
assert.ok(!JSON.stringify(accepted).includes(privateReceiptId));
assert.equal(accepted.receipts[0].verification,'trusted_adapter_callback');
assert.ok(accepted.nodes.every(n=>typeof n.id==='string'&&typeof n.name==='string'));
assert.ok(accepted.edges.every(e=>typeof e.from==='string'&&typeof e.to==='string'));

assert.throws(()=>buildOneBodyVisualSnapshot({state:{}}),/invalid_one_body_state/);
assert.throws(()=>buildOneBodyVisualSnapshot({...base,observedAt:'invalid'}),/invalid_observed_at/);
assert.throws(()=>buildOneBodyVisualSnapshot({...base,maxEvents:100}),/invalid_event_limit/);
assert.throws(()=>buildOneBodyVisualSnapshot({...base,overdueAfterMs:0}),/invalid_overdue_threshold/);
assert.throws(()=>buildOneBodyVisualSnapshot({...base,receiptObservations:{}}),/invalid_receipt_observations/);

const empty=buildOneBodyVisualSnapshot({
  state:{schema:'evercraft.one-body.state.v1',events:{}},observedAt
});
assert.equal(empty.nodes.length,1);
assert.equal(empty.edges.length,0);
assert.equal(empty.summary.total_state_events,0);

console.log(JSON.stringify({
  ok:true,schema:'evercraft.one-body.visualization-proof.v1',
  checks:[
    'persisted routes export to existing Living Graph format',
    'unknown and overdue unconfirmed handoffs remain explicit',
    'untrusted supplied receipts do not prove acknowledgement',
    'trusted callback can mark only matching lane-consumer receipt',
    'duplicate, future, and pre-event receipts cannot forge results',
    'hashed exported identifiers protect raw source and receipt references',
    'visualization grants neither runtime health nor payment nor execution authority',
  ]
},null,2));
