import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { routeVerifiedPayment } from './portfolio-fulfillment-router.mjs';
import { authorizeFulfillmentTask, startFulfillmentTask, completeFulfillmentTask, attachCompletionReceipt } from './portfolio-fulfillment-state.mjs';
import { buildDeliveryReceipt } from '../shipping/delivery-receipt.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-fulfillment-e2e-'));
const payment={
  public_id:'website-launch-service-v1',
  provider:'stripe',
  state:'paid',
  verified:true,
  synthetic:false,
  amount_cents:50000,
  currency:'usd',
  order_key:'site-order-001',
  receipt_key:'site-payment-receipt-001',
  evidence_ref:'stripe:checkout.session:cs_live_site',
  verified_at:'2026-09-29T02:20:00Z'
};

const routed=routeVerifiedPayment({payment,stateRoot:root,now:new Date('2026-09-29T02:21:00Z')});
let state=JSON.parse(fs.readFileSync(routed.state_file,'utf8'));

state=startFulfillmentTask(state,'payment-reconcile');
state=completeFulfillmentTask(state,'payment-reconcile',{evidence_refs:[payment.evidence_ref]});

state=authorizeFulfillmentTask(state,'intake-scope-lock','human-auth:intake-001');
state=startFulfillmentTask(state,'intake-scope-lock');
state=completeFulfillmentTask(state,'intake-scope-lock',{evidence_refs:['intake:site-001']});

state=startFulfillmentTask(state,'specialist-execution');
state=completeFulfillmentTask(state,'specialist-execution',{artifact_refs:['artifact:site-build-001']});

state=startFulfillmentTask(state,'parallel-quality-pass');
state=completeFulfillmentTask(state,'parallel-quality-pass',{evidence_refs:['qa:mobile-pass','qa:accessibility-pass','qa:forms-pass']});

state=startFulfillmentTask(state,'delivery-package');
state=completeFulfillmentTask(state,'delivery-package',{artifact_refs:['package:site-delivery-001']});

state=authorizeFulfillmentTask(state,'human-delivery-review','human-auth:delivery-review-001');
state=startFulfillmentTask(state,'human-delivery-review');
state=completeFulfillmentTask(state,'human-delivery-review',{evidence_refs:['review:approved-001']});

state=startFulfillmentTask(state,'customer-delivery');
state=completeFulfillmentTask(state,'customer-delivery',{artifact_refs:['package:site-delivery-001'],evidence_refs:['delivery:event-001']});

const receipt=buildDeliveryReceipt({
  state,
  recipient_ref:'customer:site-order-001',
  artifact_refs:['package:site-delivery-001'],
  delivered_at:'2026-09-29T03:00:00Z'
});
assert.match(receipt.receipt_key,/^delivery:/);
assert.match(receipt.integrity_digest,/^sha256:/);
assert.equal(receipt.truth_boundary.expansion_not_authorized,true);

state=attachCompletionReceipt(state,receipt,new Date('2026-09-29T03:01:00Z'));
assert.equal(state.state,'delivered');
assert.equal(state.completion_receipt.receipt_key,receipt.receipt_key);
assert.equal(state.tasks.find((t)=>t.work_key==='completion-receipt').state,'completed');
assert.equal(state.tasks.find((t)=>t.work_key==='expansion-review').state,'ready');

assert.throws(
  ()=>startFulfillmentTask(state,'expansion-review'),
  /human_gate_unresolved/
);

console.log(JSON.stringify({
  ok:true,
  paid_order_to_delivery_receipt:true,
  human_review_preserved:true,
  expansion_still_gated:true,
  receipt_integrity:true
}));
