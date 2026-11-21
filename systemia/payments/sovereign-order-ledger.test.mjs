import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createSovereignOrder,prepareExternalPaymentInstructions,
  noteCustomerPaymentClaim,persistSovereignOrder,readSovereignOrder
} from './sovereign-order-ledger.mjs';

const order=()=>createSovereignOrder({
  productKey:'findmypart',offerKey:'findmypart.quick_hunt_19.v1',
  amountCents:1900,customerRef:'buyer-alias-opaque'
});

test('offline Evercraft order has no default processor and cannot pretend paid',()=>{
  const row=order();
  assert.equal(row.order_owner,'evercraft_payments');
  assert.equal(row.provider_required,false);
  assert.equal(row.rail,null);
  assert.equal(row.payment_state,'unpaid');
  assert.equal(row.entitlement_state,'held');
  assert.equal(row.fulfillment_state,'held');
  assert.equal(row.settlement_receipt_ref,null);
  assert.match(row.order_id,/^buyer-[0-9a-f-]{36}$/);
});
test('external payment methods are never shown as ready without merchant verification and buyer consent',()=>{
  const start=order();
  for(const rail of [
    'cash','check','bank_transfer','zelle_business',
    'paypal_business','venmo_business','cash_app_business'
  ]){
    assert.throws(()=>prepareExternalPaymentInstructions(start,{rail}),/readiness/);
    assert.throws(()=>prepareExternalPaymentInstructions(start,{rail,merchantRailConfigured:true}),/readiness/);
    const selected=prepareExternalPaymentInstructions(start,{
      rail,merchantRailConfigured:true,buyerConfirmed:true
    });
    assert.equal(selected.rail,rail);
    assert.equal(selected.collection_state,'instructions_ready_for_authenticated_merchant_delivery');
    assert.equal(selected.payment_state,'unpaid');
    assert.equal(selected.entitlement_state,'held');
    assert.equal(selected.fulfillment_state,'held');
    assert.equal(selected.settlement_receipt_ref,null);
    assert.equal(selected.version,2);
    assert.throws(()=>prepareExternalPaymentInstructions(selected,{rail,merchantRailConfigured:true,buyerConfirmed:true}));
  }
  assert.throws(()=>prepareExternalPaymentInstructions(start,{rail:'card_processor',merchantRailConfigured:true,buyerConfirmed:true}),/not_supported/);
});
test('customer saying they paid never becomes settlement or delivery permission',()=>{
  const chosen=prepareExternalPaymentInstructions(order(),{
    rail:'bank_transfer',merchantRailConfigured:true,buyerConfirmed:true
  });
  assert.throws(()=>noteCustomerPaymentClaim(chosen,{claimRef:'not a key !'}),/ineligible/);
  const claimed=noteCustomerPaymentClaim(chosen,{claimRef:'customer-claim-001'});
  assert.equal(claimed.customer_claim_ref,'customer-claim-001');
  assert.equal(claimed.collection_state,'customer_claim_unverified');
  assert.equal(claimed.payment_state,'unpaid');
  assert.equal(claimed.settlement_receipt_ref,null);
  assert.equal(claimed.entitlement_state,'held');
  assert.equal(claimed.fulfillment_state,'held');
  assert.throws(()=>noteCustomerPaymentClaim(claimed,{claimRef:'duplicate'}),/ineligible/);
});
test('order files survive reload with owner-only permissions and refuse duplicate IDs',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-sovereign-payments-'));
  fs.chmodSync(dir,0o700);
  try{
    const row=order();
    const receipt=persistSovereignOrder(row,{dir});
    assert.equal(receipt.payment_state,'unpaid');
    assert.equal(receipt.fulfillment_state,'held');
    assert.equal(receipt.provider_required,false);
    const file=path.join(dir,row.order_id+'.json');
    assert.equal(fs.statSync(dir).mode&0o077,0);
    assert.equal(fs.statSync(file).mode&0o077,0);
    assert.deepEqual(readSovereignOrder(row.order_id,{dir}),row);
    assert.throws(()=>persistSovereignOrder(row,{dir}),/EEXIST/);
    assert.throws(()=>persistSovereignOrder({...row,payment_state:'paid'},{dir}),/contract_invalid/);
    assert.throws(()=>persistSovereignOrder({...row,fulfillment_state:'released'},{dir}),/contract_invalid/);
    fs.chmodSync(file,0o644);
    assert.throws(()=>readSovereignOrder(row.order_id,{dir}),/not_private/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('invalid amounts, customer references, and traversal fail closed',()=>{
  for(const cents of [0,-1,NaN,1.5,Number.MAX_SAFE_INTEGER]){
    assert.throws(()=>createSovereignOrder({
      productKey:'part',offerKey:'findmypart.quick_hunt_19.v1',
      amountCents:cents,customerRef:'cust-123'
    }),/invalid/);
  }
  assert.throws(()=>createSovereignOrder({
    productKey:'part',offerKey:'findmypart.quick_hunt_19.v1',
    amountCents:1900,customerRef:'../../secrets'
  }),/invalid/);
  assert.throws(()=>readSovereignOrder('../../credentials'),/order_id_invalid/);
});
