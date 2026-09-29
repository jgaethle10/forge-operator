import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import registry from './product-fulfillment-registry.json' with { type:'json' };
import { routeVerifiedPayment } from './portfolio-fulfillment-router.mjs';
import { authorizeFulfillmentTask, startFulfillmentTask, completeFulfillmentTask, attachCompletionReceipt } from './portfolio-fulfillment-state.mjs';
import { buildDeliveryReceipt } from '../shipping/delivery-receipt.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-all-fulfillment-'));
const results=[];

for (let i=0;i<registry.products.length;i+=1) {
  const profile=registry.products[i];
  const payment={
    public_id:profile.public_id,
    provider:'proof_provider',
    state:'paid',
    verified:true,
    synthetic:false,
    amount_cents:100 + i,
    currency:'usd',
    order_key:`proof-order-${i}`,
    receipt_key:`proof-payment-receipt-${i}`,
    evidence_ref:`proof:provider:${profile.public_id}`,
    verified_at:'2026-09-29T03:10:00Z'
  };

  const routed=routeVerifiedPayment({
    payment,
    stateRoot:root,
    now:new Date('2026-09-29T03:11:00Z')
  });
  assert.equal(routed.admitted,true, profile.public_id + ' route denied');
  let state=JSON.parse(fs.readFileSync(routed.state_file,'utf8'));

  for (const task of [...state.tasks]) {
    if (task.work_key === 'completion-receipt' || task.work_key === 'expansion-review') continue;
    const current=state.tasks.find((t)=>t.work_key===task.work_key);
    if (current.human_gate_required) {
      state=authorizeFulfillmentTask(state,task.work_key,`proof-auth:${profile.public_id}:${task.work_key}`);
    }
    state=startFulfillmentTask(state,task.work_key);
    state=completeFulfillmentTask(state,task.work_key,{
      evidence_refs:[`proof:evidence:${profile.public_id}:${task.work_key}`],
      artifact_refs:task.work_key==='customer-delivery'
        ? [`proof:artifact:${profile.public_id}`]
        : []
    });
  }

  const receipt=buildDeliveryReceipt({
    state,
    recipient_ref:`proof-customer:${profile.public_id}`,
    artifact_refs:[`proof:artifact:${profile.public_id}`],
    delivered_at:'2026-09-29T03:30:00Z'
  });
  state=attachCompletionReceipt(state,receipt,new Date('2026-09-29T03:31:00Z'));

  assert.equal(state.state,'delivered',profile.public_id + ' did not reach delivered');
  assert.equal(state.completion_receipt.public_id,profile.public_id);
  assert.equal(state.tasks.find((t)=>t.work_key==='completion-receipt').state,'completed');
  assert.equal(state.tasks.find((t)=>t.work_key==='expansion-review').state,'ready');
  assert.throws(()=>startFulfillmentTask(state,'expansion-review'),/human_gate_unresolved/);

  results.push({
    public_id:profile.public_id,
    execution_mode:profile.execution_mode,
    delivered:true,
    receipt_key:receipt.receipt_key
  });
}

assert.equal(results.length,14);
console.log(JSON.stringify({
  ok:true,
  products_dry_run:results.length,
  all_reached_delivery_receipt:results.every((r)=>r.delivered),
  expansion_human_gate_preserved:true,
  results
}));
