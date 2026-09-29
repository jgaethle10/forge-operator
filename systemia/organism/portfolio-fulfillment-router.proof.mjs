import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { routeVerifiedPayment } from './portfolio-fulfillment-router.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-fulfillment-'));
const payment={
  public_id:'faie-signal-brief-v1',
  provider:'stripe',
  state:'paid',
  verified:true,
  synthetic:false,
  amount_cents:25000,
  currency:'usd',
  order_key:'faie-order-001',
  receipt_key:'faie-receipt-001',
  evidence_ref:'stripe:checkout.session:cs_live_faie',
  verified_at:'2026-09-29T02:10:00Z'
};

const first=routeVerifiedPayment({payment,stateRoot:root,now:new Date('2026-09-29T02:11:00Z')});
assert.equal(first.admitted,true);
assert.equal(first.duplicate_suppressed,false);
assert.equal(first.state,'intake_required');
assert.equal(first.next_work_key,'intake-scope-lock');
assert.equal(first.team.execution_fabric,'Saban');
assert(fs.existsSync(first.state_file));

const state=JSON.parse(fs.readFileSync(first.state_file,'utf8'));
assert.equal(state.promised_deliverables.length > 0,true);
assert.equal(state.completion_receipt,null);
assert.equal(state.authority.production_mutation,'not_authorized_by_payment');
assert(state.tasks.some((t)=>t.work_key==='completion-receipt'));

const second=routeVerifiedPayment({payment,stateRoot:root,now:new Date('2026-09-29T02:12:00Z')});
assert.equal(second.admitted,true);
assert.equal(second.duplicate_suppressed,true);
assert.equal(second.fulfillment_key,first.fulfillment_key);

const blocked=routeVerifiedPayment({
  payment:{...payment,public_id:'website-launch-service-v1',state:'checkout_open',verified:false,evidence_ref:''},
  stateRoot:root
});
assert.equal(blocked.admitted,false);
assert(blocked.reasons.includes('provider_not_verified'));

console.log(JSON.stringify({
  ok:true,
  payment_to_fulfillment_state:true,
  duplicate_suppression:true,
  completion_receipt_required:true,
  saban_execution_declared:true,
  checkout_only_rejected:true
}));
