#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DurableEntityStore } from '../app-fabric/entity-store.mjs';
import { EvercraftCommerceBoundary } from '../commerce-boundary/commerce-boundary.mjs';
import { createPolarCommerceAdapter } from '../commerce-boundary/polar-adapter.mjs';
import { EvercraftWorkforceCommerce } from './commerce-runtime.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-workforce-commerce-proof-'));
let clock=new Date('2026-09-30T20:00:00.000Z');
const checkoutReads=new Map();
const createdCheckouts=[];
let nextCheckout=1;

const connectorGateway={
  async invoke(appKey,provider,operation,input,context={}){
    assert.equal(appKey,'evercraft-ai-workforce');
    assert.equal(provider,'polar');

    if(operation==='products.list'){
      return {items:[
        {
          id:'product-agent',
          metadata:{evercraft_workforce_offer_key:'agent_deposit'}
        },
        {
          id:'product-interview',
          metadata:{evercraft_offer_key:'interview_sprint_7d'}
        }
      ]};
    }

    if(operation==='organizations.list'){
      return {items:[{id:'organization-proof'}]};
    }

    if(operation==='products.create'){
      return {id:'product-created-proof',...input.payload};
    }

    if(operation==='checkouts.create'){
      assert.equal(context.explicit_confirmation,true);
      const id='checkout-'+nextCheckout++;
      const payload=structuredClone(input.payload);
      const success=new URL(payload.success_url);
      assert.equal(success.protocol,'https:');
      assert.equal(success.hostname,'workforce.evercraft.example');
      assert.equal(success.hostname.endsWith('.base44.app'),false);

      const checkout={
        id,
        url:'https://checkout.polar.example.invalid/'+id,
        status:'confirmed',
        total_amount:
          payload.metadata.offer_key==='interview_sprint_7d'
            ? 1900
            : 50000,
        currency:'usd',
        customer_email:payload.customer_email,
        metadata:payload.metadata
      };
      checkoutReads.set(id,checkout);
      createdCheckouts.push(checkout);
      return {id,url:checkout.url};
    }

    if(operation==='checkouts.get'){
      const id=input?.pathParams?.id;
      const checkout=checkoutReads.get(id);
      if(!checkout) throw new Error('checkout_not_found');
      return structuredClone(checkout);
    }

    throw new Error('unexpected_connector_operation:'+operation);
  }
};

try{
  const entityStore=new DurableEntityStore({
    stateDir:path.join(root,'entities')
  });
  const commerceBoundary=new EvercraftCommerceBoundary({
    stateDir:path.join(root,'commerce'),
    adapters:{
      polar:createPolarCommerceAdapter({connectorGateway})
    }
  });
  const workforce=new EvercraftWorkforceCommerce({
    appKey:'evercraft-ai-workforce',
    entityStore,
    connectorGateway,
    commerceBoundary,
    publicOrigin:'https://workforce.evercraft.example',
    clock:()=>clock
  });

  assert.equal(workforce.health().public_origin_base44,false);
  assert.equal(workforce.health().checkout_requires_explicit_confirmation,true);

  await assert.rejects(
    ()=>workforce.createWorkforceCheckout({
      offerKey:'agent_deposit',
      customerEmail:'person@example.invalid',
      confirmedByUser:false
    }),
    /checkout_explicit_confirmation_required/
  );
  assert.equal(createdCheckouts.length,0);

  const deposit=await workforce.createWorkforceCheckout({
    offerKey:'agent_deposit',
    customerEmail:'person@example.invalid',
    customerName:'Proof Person',
    company:'Proof Co',
    need:'Proof an owned checkout path.',
    confirmedByUser:true
  });
  assert.equal(deposit.amount_cents,50000);
  assert.equal(deposit.payment_verified,false);
  assert.equal(deposit.payment_created,false);
  assert.equal(deposit.purchase.payment_status,'checkout_started');
  assert.equal(createdCheckouts.length,1);

  await assert.rejects(
    ()=>workforce.verifyWorkforcePayment({purchaseToken:deposit.purchase_token}),
    /payment_not_successful/
  );
  assert.equal(
    entityStore.get('evercraft-ai-workforce','WorkforcePurchase',deposit.purchase.id).payment_status,
    'checkout_started'
  );

  checkoutReads.get(deposit.checkout_id).status='succeeded';
  checkoutReads.get(deposit.checkout_id).order_id='order-deposit-proof';
  const paidDeposit=await workforce.verifyWorkforcePayment({
    purchaseToken:deposit.purchase_token
  });
  assert.equal(paidDeposit.paid,true);
  assert.equal(paidDeposit.provider_authoritative,true);
  assert.equal(paidDeposit.purchase.payment_status,'paid');
  assert.match(paidDeposit.commerce_verification_hash,/^sha256:[a-f0-9]{64}$/);

  const replay=await workforce.verifyWorkforcePayment({
    purchaseToken:deposit.purchase_token
  });
  assert.equal(replay.verification_replayed,true);

  clock=new Date('2026-09-30T22:10:00.000Z');
  const interview=await workforce.createInterviewCheckout({
    customerEmail:'candidate@example.invalid',
    targetRole:'Operations Manager',
    targetCompany:'Example Co',
    confirmedByUser:true
  });
  assert.equal(interview.amount_cents,1900);
  assert.equal(interview.purchase.payment_status,'checkout_started');

  checkoutReads.get(interview.checkout_id).status='succeeded';
  checkoutReads.get(interview.checkout_id).order_id='order-interview-proof';
  const paidInterview=await workforce.verifyInterviewPayment({
    purchaseToken:interview.purchase_token
  });
  assert.equal(paidInterview.paid,true);
  assert.equal(paidInterview.purchase.premium_actions_limit,25);
  assert.equal(
    paidInterview.access_expires_at,
    '2026-10-07T22:10:00.000Z'
  );

  await assert.rejects(
    ()=>workforce.createInterviewCheckout({
      customerEmail:'candidate@example.invalid',
      targetRole:'Operations Manager',
      confirmedByUser:true
    }),
    /checkout_recent_attempt_exists/
  );

  const tampered=structuredClone(checkoutReads.get(interview.checkout_id));
  tampered.id='tampered-proof';
  tampered.metadata.purchase_token='wrong-token';
  checkoutReads.set('tampered-proof',tampered);
  const tamperedPurchase=entityStore.create('evercraft-ai-workforce','InterviewPurchase',{
    purchase_token:'tampered-purchase-token',
    customer_email:'candidate2@example.invalid',
    target_role:'Analyst',
    offer_key:'interview_sprint_7d',
    amount_cents:1900,
    currency:'USD',
    payment_status:'checkout_started',
    payment_provider:'polar',
    payment_checkout_id:'tampered-proof',
    premium_actions_used:0,
    premium_actions_limit:25
  }).record;
  await assert.rejects(
    ()=>workforce.verifyInterviewPayment({
      purchaseToken:tamperedPurchase.purchase_token
    }),
    /polar_checkout_metadata_mismatch/
  );

  assert.equal(commerceBoundary.health().creates_payment_obligations,false);

  console.log(JSON.stringify({
    schema:'evercraft.workforce.commerce-runtime-proof.v1',
    status:'pass',
    explicit_checkout_confirmation_required:true,
    owned_success_origin_required:true,
    confirmed_status_does_not_unlock_access:true,
    succeeded_status_requires_provider_verification:true,
    purchase_metadata_binding_required:true,
    deposit_payment_provider_authoritative:true,
    interview_access_window_preserved:true,
    interview_action_limit_preserved:true,
    cooldown_preserved:true,
    real_checkout_created:false,
    real_payment_created:false
  }));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
