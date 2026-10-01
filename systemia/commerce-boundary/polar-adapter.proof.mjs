#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EvercraftCommerceBoundary } from './commerce-boundary.mjs';
import { createPolarCommerceAdapter } from './polar-adapter.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-polar-commerce-proof-'));
const checkouts=new Map([
  ['confirmed-proof',{
    id:'confirmed-proof',
    status:'confirmed',
    total_amount:1900,
    currency:'usd',
    metadata:{purchase_token:'confirmed-token',interview_purchase_id:'purchase-confirmed'}
  }],
  ['success-proof',{
    id:'success-proof',
    status:'succeeded',
    total_amount:1900,
    currency:'usd',
    order_id:'order-proof',
    metadata:{purchase_token:'success-token',interview_purchase_id:'purchase-success'}
  }]
]);
let reads=0;

const connectorGateway={
  async invoke(appKey,provider,operation,input,context){
    reads+=1;
    assert.equal(appKey,'workforce');
    assert.equal(provider,'polar');
    assert.equal(operation,'checkouts.get');
    assert.equal(context.purpose,'commerce_verification');
    const checkout=checkouts.get(input?.pathParams?.id);
    if(!checkout) throw new Error('checkout_not_found');
    return structuredClone(checkout);
  }
};

try{
  const boundary=new EvercraftCommerceBoundary({
    stateDir:root,
    adapters:{
      polar:createPolarCommerceAdapter({connectorGateway})
    }
  });

  await assert.rejects(
    ()=>boundary.verifyPayment({
      appKey:'workforce',
      provider:'polar',
      paymentRef:'confirmed-proof',
      expected:{amount_minor:1900,currency:'USD'},
      context:{
        expected_metadata:{
          purchase_token:'confirmed-token',
          interview_purchase_id:'purchase-confirmed'
        }
      }
    }),
    /payment_not_successful/
  );

  await assert.rejects(
    ()=>boundary.verifyPayment({
      appKey:'workforce',
      provider:'polar',
      paymentRef:'success-proof',
      expected:{amount_minor:1900,currency:'USD'},
      context:{
        expected_metadata:{
          purchase_token:'wrong-token',
          interview_purchase_id:'purchase-success'
        }
      }
    }),
    /polar_checkout_metadata_mismatch:purchase_token/
  );

  const verified=await boundary.verifyPayment({
    appKey:'workforce',
    provider:'polar',
    paymentRef:'success-proof',
    expected:{amount_minor:1900,currency:'USD'},
    context:{
      expected_metadata:{
        purchase_token:'success-token',
        interview_purchase_id:'purchase-success'
      }
    }
  });
  assert.equal(verified.replayed,false);
  assert.equal(verified.payment.status,'succeeded');
  assert.equal(verified.payment.amount_minor,1900);
  assert.equal(verified.payment.currency,'USD');
  assert.equal(verified.payment.provider_authoritative,true);
  assert.equal(verified.payment.card_data_stored,false);

  const replay=await boundary.verifyPayment({
    appKey:'workforce',
    provider:'polar',
    paymentRef:'success-proof',
    expected:{amount_minor:1900,currency:'USD'},
    context:{
      expected_metadata:{
        purchase_token:'success-token',
        interview_purchase_id:'purchase-success'
      }
    }
  });
  assert.equal(replay.replayed,true);

  await assert.rejects(
    ()=>boundary.verifyPayment({
      appKey:'workforce',
      provider:'polar',
      paymentRef:'success-proof',
      expected:{amount_minor:1900,currency:'USD'},
      context:{
        expected_metadata:{
          purchase_token:'different-purchase-token',
          interview_purchase_id:'different-purchase-id'
        }
      }
    }),
    /payment_verification_context_mismatch/
  );

  await assert.rejects(
    ()=>boundary.verifyPayment({
      appKey:'workforce',
      provider:'polar',
      paymentRef:'success-proof',
      expected:{amount_minor:2000,currency:'USD'}
    }),
    /payment_amount_mismatch/
  );

  await assert.rejects(
    ()=>boundary.verifyPayment({
      appKey:'workforce',
      provider:'polar',
      paymentRef:'success-proof',
      expected:{amount_minor:1900,currency:'EUR'}
    }),
    /payment_currency_mismatch/
  );

  assert.equal(reads,3);
  assert.equal(boundary.health().creates_payment_obligations,false);

  console.log(JSON.stringify({
    schema:'evercraft.commerce.polar-proof.v1',
    status:'pass',
    confirmed_is_not_payment_success:true,
    succeeded_is_provider_authoritative:true,
    purchase_metadata_binding_required:true,
    amount_currency_match_required:true,
    replay_expectations_revalidated:true,
    replay_ownership_context_revalidated:true,
    creates_payment_obligations:false,
    checkout_created:false
  }));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
