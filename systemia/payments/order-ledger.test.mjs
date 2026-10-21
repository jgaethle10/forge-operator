import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EvercraftPaymentOrderStore,
  buildPaymentReceipt,
} from './order-ledger.mjs';

function verifier(receipt,{purpose,order}={}){
  if(!receipt||receipt.valid!==true){
    return {ok:false};
  }
  return {
    ok:true,
    receipt_hash:receipt.receipt_hash,
    purpose:receipt.purpose,
    order_id:receipt.order_id,
    amount_minor:receipt.amount_minor,
    currency:receipt.currency,
  };
}

function ravenReceipt({
  hash,
  purpose,
  orderId,
  amountMinor=50000,
  currency='USD',
}){
  return {
    valid:true,
    receipt_hash:hash,
    purpose,
    order_id:orderId,
    amount_minor:amountMinor,
    currency,
  };
}

async function setup(){
  const root=await mkdtemp(join(tmpdir(),'evercraft-payment-order-'));
  const store=new EvercraftPaymentOrderStore(root,{
    ravenReceiptVerifier:verifier,
  });
  await store.init();
  return {root,store};
}

test('Lineage $500 pilot creates one canonical Evercraft Payments order', async()=>{
  const {root,store}=await setup();
  try{
    const first=await store.createOrder({
      productKey:'lineage',
      offerKey:'lineage-founding-pilot-500',
      amountMinor:50000,
      requestKey:'buyer-acme-lineage-pilot-1',
      actor:{type:'system',id:'lineage_commerce'},
      metadata:{pilot_slots:5},
    });
    const second=await store.createOrder({
      productKey:'lineage',
      offerKey:'lineage-founding-pilot-500',
      amountMinor:50000,
      requestKey:'buyer-acme-lineage-pilot-1',
      actor:{type:'system',id:'lineage_commerce'},
      metadata:{pilot_slots:5},
    });

    assert.equal(first.order_id,second.order_id);
    assert.equal(first.state,'confirmation_required');
    assert.equal(first.amount_minor,50000);
    assert.equal(first.currency,'USD');
    assert.equal(first.route.commerce_layer,'evercraft_payments');
    assert.equal(first.route.provider_boundary,'raven_nexus');
    assert.equal(first.route.settlement_adapter,'stripe');
    assert.equal(first.route.direct_provider_checkout_allowed,false);
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});

test('same request key with different economics fails instead of creating a second truth', async()=>{
  const {root,store}=await setup();
  try{
    await store.createOrder({
      productKey:'lineage',
      offerKey:'lineage-founding-pilot-500',
      amountMinor:50000,
      requestKey:'same-request',
    });
    await assert.rejects(
      ()=>store.createOrder({
        productKey:'lineage',
        offerKey:'lineage-founding-pilot-500',
        amountMinor:40000,
        requestKey:'same-request',
      }),
      /payment_request_idempotency_conflict/
    );
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});

test('checkout handoff requires explicit buyer confirmation and never means paid', async()=>{
  const {root,store}=await setup();
  try{
    const created=await store.createOrder({
      productKey:'lineage',
      offerKey:'lineage-founding-pilot-500',
      amountMinor:50000,
      requestKey:'confirmation-proof',
    });

    await assert.rejects(
      ()=>store.recordRavenHandoff(created.order_id,{
        checkoutRef:'opaque-checkout-ref',
        ravenReceipt:ravenReceipt({
          hash:'a'.repeat(64),
          purpose:'payment_checkout_handoff',
          orderId:created.order_id,
        }),
      }),
      /payment_order_not_confirmed/
    );

    const confirmed=await store.confirmOrder(created.order_id,{
      buyerRef:'buyer_acme',
      actor:{type:'human',id:'authorized_buyer'},
    });
    assert.equal(confirmed.state,'confirmed');
    assert.equal(confirmed.buyer_confirmation.confirmed,true);

    const handed=await store.recordRavenHandoff(created.order_id,{
      checkoutRef:'opaque-checkout-ref',
      ravenReceipt:ravenReceipt({
        hash:'a'.repeat(64),
        purpose:'payment_checkout_handoff',
        orderId:created.order_id,
      }),
    });
    assert.equal(handed.state,'settlement_pending');
    assert.equal(handed.settlement,null);
    assert.equal(handed.handoff.provider_boundary,'raven_nexus');
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});

test('payment state cannot advance without a verifying Raven receipt', async()=>{
  const root=await mkdtemp(join(tmpdir(),'evercraft-payment-no-verifier-'));
  const store=new EvercraftPaymentOrderStore(root);
  await store.init();
  try{
    const created=await store.createOrder({
      productKey:'lineage',
      offerKey:'lineage-founding-pilot-500',
      amountMinor:50000,
      requestKey:'no-verifier',
    });
    await store.confirmOrder(created.order_id,{buyerRef:'buyer_acme'});
    await assert.rejects(
      ()=>store.recordRavenHandoff(created.order_id,{
        checkoutRef:'looks-real-but-is-not-proof',
        ravenReceipt:{receipt_hash:'a'.repeat(64)},
      }),
      /raven_receipt_verifier_required/
    );
    assert.equal((await store.getOrder(created.order_id)).state,'confirmed');
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});

test('verified Raven settlement marks paid only when amount currency purpose and order match', async()=>{
  const {root,store}=await setup();
  try{
    const created=await store.createOrder({
      productKey:'lineage',
      offerKey:'lineage-founding-pilot-500',
      amountMinor:50000,
      requestKey:'paid-proof',
    });
    await store.confirmOrder(created.order_id,{buyerRef:'buyer_acme'});
    await store.recordRavenHandoff(created.order_id,{
      checkoutRef:'checkout_opaque_123',
      ravenReceipt:ravenReceipt({
        hash:'a'.repeat(64),
        purpose:'payment_checkout_handoff',
        orderId:created.order_id,
      }),
    });

    await assert.rejects(
      ()=>store.recordSettlement(created.order_id,{
        providerEventId:'evt_bad_amount',
        amountMinor:50000,
        status:'succeeded',
        ravenReceipt:ravenReceipt({
          hash:'b'.repeat(64),
          purpose:'payment_settlement_succeeded',
          orderId:created.order_id,
          amountMinor:49999,
        }),
      }),
      /raven_receipt_amount_mismatch/
    );

    const paid=await store.recordSettlement(created.order_id,{
      providerEventId:'evt_provider_123',
      amountMinor:50000,
      currency:'USD',
      status:'succeeded',
      ravenReceipt:ravenReceipt({
        hash:'c'.repeat(64),
        purpose:'payment_settlement_succeeded',
        orderId:created.order_id,
        amountMinor:50000,
        currency:'USD',
      }),
    });

    assert.equal(paid.state,'paid');
    assert.equal(paid.settlement.provider_boundary,'raven_nexus');
    assert.equal(paid.settlement.settlement_adapter,'stripe');
    assert.equal(paid.settlement.provider_event_id,'evt_provider_123');

    const receipt=buildPaymentReceipt(paid);
    assert.equal(receipt.schema,'evercraft.payments.receipt.v1');
    assert.equal(receipt.order_id,created.order_id);
    assert.equal(receipt.amount_minor,50000);
    assert.match(receipt.receipt_hash,/^[a-f0-9]{64}$/);
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});

test('tampering with canonical order history fails integrity verification', async()=>{
  const {root,store}=await setup();
  try{
    const created=await store.createOrder({
      productKey:'lineage',
      offerKey:'lineage-founding-pilot-500',
      amountMinor:50000,
      requestKey:'tamper-proof',
    });
    const file=store.orderPath(created.order_id);
    const raw=JSON.parse(await readFile(file,'utf8'));
    raw.events[0].data.amount_minor=1;
    await writeFile(file,JSON.stringify(raw,null,2)+'\n');

    await assert.rejects(
      ()=>store.getOrder(created.order_id),
      /payment_order_event_hash_invalid|payment_order_materialized_amount_minor_invalid/
    );
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});
