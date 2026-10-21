import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createApprovedOwnedOrder,EVERCRAFT_APPROVED_ENTRY_OFFERS,
} from './approved-order-intake.mjs';
import {readSovereignOrder} from './sovereign-order-ledger.mjs';

function isolatedStore(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-owned-entry-order-'));
  fs.chmodSync(dir,0o700);
  return dir;
}
const intent=(patch={})=>({
  offerSlug:'website-audit',customerRef:'buyer-case-001',
  idempotencyKey:'owner-created-unique-intent-001',...patch
});

test('real Evercraft-owned $49 order is durable, unpaid and processor-independent',()=>{
  const dir=isolatedStore();
  try{
    const a=createApprovedOwnedOrder(intent(),{storeDir:dir});
    assert.equal(a.amount_cents,4900);
    assert.equal(a.currency,'USD');
    assert.equal(a.replayed,false);
    assert.equal(a.canonical_owner,'evercraft_payments');
    assert.equal(a.provider_required,false);
    assert.equal(a.payment_state,'unpaid');
    assert.equal(a.payment_verified,false);
    assert.equal(a.invoice_issued,false);
    assert.equal(a.payment_instructions_available,false);
    assert.equal(a.entitlement_granted,false);
    assert.equal(a.fulfillment_released,false);
    const reloaded=readSovereignOrder(a.order_id,{dir});
    assert.equal(reloaded.customer_ref,'buyer-case-001');
    assert.equal(reloaded.amount_cents,4900);
    assert.equal(reloaded.payment_state,'unpaid');
    const b=createApprovedOwnedOrder(intent(),{storeDir:dir});
    assert.equal(b.order_id,a.order_id);
    assert.equal(b.replayed,true);
    assert.equal(fs.readdirSync(dir).filter(x=>x.endsWith('.json')).length,1);
    assert.equal(fs.statSync(path.join(dir,a.order_id+'.json')).mode&0o077,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('FindMyPart fixed price and account independence remain enforced',()=>{
  const dir=isolatedStore();
  try{
    const a=createApprovedOwnedOrder(intent({
      offerSlug:'findmypart',
      idempotencyKey:'owner-created-unique-intent-002'
    }),{storeDir:dir});
    assert.equal(a.amount_cents,1900);
    assert.equal(a.offer_key,EVERCRAFT_APPROVED_ENTRY_OFFERS.findmypart.offer_key);
    assert.equal(a.collection_state,'awaiting_payment_method');
    assert.equal(a.merchant_payment_method_state,'requires_verified_business_rail');
    assert.equal(a.settlement_receipt_ref,null);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('reused idempotency key cannot switch payer or price or offer',()=>{
  const dir=isolatedStore();
  try{
    createApprovedOwnedOrder(intent(),{storeDir:dir});
    assert.throws(()=>createApprovedOwnedOrder(intent({customerRef:'different-buyer'}),{storeDir:dir}),
      /idempotency_conflict/);
    assert.throws(()=>createApprovedOwnedOrder(intent({offerSlug:'findmypart'}),{storeDir:dir}),
      /idempotency_conflict/);
    const rows=fs.readdirSync(dir).filter(x=>x.endsWith('.json'));
    assert.equal(rows.length,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('buyer cannot override amount, fee, provider, merchant or order ownership',()=>{
  const dir=isolatedStore();
  try{
    for(const patch of [
      {amount_cents:1},{currency:'EUR'},{payment_state:'paid'},
      {settlement_adapter:'stripe'},{merchant_destination:'evil.example'},
      {order_persisted:true},{orderId:'buyer-arbitrary'},
    ]){
      assert.throws(()=>createApprovedOwnedOrder(intent(patch),{storeDir:dir}),
        /only_approved_order_fields_allowed/);
    }
    for(const patch of [
      {offerSlug:'unreviewed'}, {offerSlug:'constructor'},
      {customerRef:'x'}, {customerRef:'../../etc/passwd'},
      {idempotencyKey:'short'},
    ]){
      assert.throws(()=>createApprovedOwnedOrder(intent(patch),{storeDir:dir}));
    }
    assert.equal(fs.readdirSync(dir).length,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
