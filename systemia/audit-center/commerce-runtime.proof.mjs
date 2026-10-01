#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac, randomBytes } from 'node:crypto';
import { DurableEntityStore } from '../app-fabric/entity-store.mjs';
import { EvercraftSecretStore } from '../secret-store/secret-store.mjs';
import { EvercraftWebhookGateway } from '../webhook-gateway/webhook-gateway.mjs';
import { EvercraftCommerceBoundary } from '../commerce-boundary/commerce-boundary.mjs';
import { createStripeProviderClient } from '../commerce-boundary/stripe-provider.mjs';
import { createStripeCommerceAdapter } from '../commerce-boundary/stripe-adapter.mjs';
import { EvercraftAuditCommerce, AUDIT_TIERS } from './commerce-runtime.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-audit-commerce-proof-'));
const stripeSecret='sk_test_synthetic_audit_secret';
const webhookSecret='whsec_synthetic_audit_secret';
let checkoutCreates=0;
let checkoutReads=0;
let acquisitionEvents=0;
let sequence=1;
const sessions=new Map();

function json(body,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{'content-type':'application/json'}
  });
}
function diskText(dir){
  const chunks=[];
  const walk=(current)=>{
    if(!fs.existsSync(current)) return;
    for(const entry of fs.readdirSync(current,{withFileTypes:true})){
      const full=path.join(current,entry.name);
      if(entry.isDirectory()) walk(full);
      else if(entry.isFile()) chunks.push(fs.readFileSync(full));
    }
  };
  walk(dir);
  return Buffer.concat(chunks).toString('utf8');
}
async function fakeFetch(input,options={}){
  const url=new URL(typeof input==='string'?input:input.toString());
  assert.equal(String(options?.headers?.authorization||''), 'Bearer '+stripeSecret);

  if(url.pathname==='/v1/checkout/sessions'&&String(options.method||'GET')==='POST'){
    checkoutCreates+=1;
    const params=new URLSearchParams(String(options.body||''));
    const id='cs_proof_'+sequence++;
    const tier=params.get('metadata[tier]');
    const config=AUDIT_TIERS[tier];
    assert.ok(config);
    const metadata={};
    for(const [key,value] of params.entries()){
      const m=key.match(/^metadata\[(.+)\]$/);
      if(m) metadata[m[1]]=value;
    }
    const priceId=params.get('line_items[0][price]')||'';
    const inlineAmount=Number(params.get('line_items[0][price_data][unit_amount]')||0);
    const session={
      id,
      url:'https://checkout.stripe.example.invalid/'+id,
      status:'open',
      payment_status:'unpaid',
      amount_total:config.amount_minor,
      currency:'usd',
      customer_details:{email:'buyer@example.invalid'},
      metadata,
      line_items:{
        data:[{
          price:{
            id:priceId,
            unit_amount:priceId?config.amount_minor:inlineAmount
          }
        }]
      }
    };
    sessions.set(id,session);
    assert.equal(params.get('success_url').includes('base44.app'),false);
    assert.equal(params.get('cancel_url').includes('base44.app'),false);
    assert.match(params.get('success_url'),/^https:\/\/audit\.evercraft\.example\/success\?/);
    assert.equal(metadata.audit_order_id?.length>0,true);
    return json({id,url:session.url});
  }

  const match=url.pathname.match(/^\/v1\/checkout\/sessions\/(cs_[A-Za-z0-9_:-]+)$/);
  if(match){
    checkoutReads+=1;
    const session=sessions.get(match[1]);
    if(!session) return json({error:{message:'not found'}},404);
    return json(session);
  }
  throw new Error('unexpected_stripe_request:'+url.pathname);
}

try{
  const secrets=new EvercraftSecretStore({
    stateDir:path.join(root,'secrets'),
    masterKey:randomBytes(32)
  });
  secrets.setSecret('stripe:audit','secret-key',stripeSecret);
  secrets.setSecret('webhook:systemia-audit-center:stripe','signing-secret',webhookSecret);

  const stripeClient=createStripeProviderClient({
    secretProvider:async()=>secrets.getSecretText('stripe:audit','secret-key'),
    fetchImpl:fakeFetch
  });
  const commerce=new EvercraftCommerceBoundary({
    stateDir:path.join(root,'commerce'),
    adapters:{
      stripe:createStripeCommerceAdapter({
        client:stripeClient,
        tiers:AUDIT_TIERS
      })
    }
  });
  const entities=new DurableEntityStore({
    stateDir:path.join(root,'entities')
  });
  const audit=new EvercraftAuditCommerce({
    entityStore:entities,
    stripeClient,
    commerceBoundary:commerce,
    publicOrigin:'https://audit.evercraft.example',
    acquisitionSink:async(event)=>{
      acquisitionEvents+=1;
      assert.equal(event.event_type,'checkout_started');
      assert.equal(event.offer_id,'audit-center-website-audit-machine-v1');
    },
    clock:()=>new Date('2026-10-01T14:30:00.000Z')
  });

  assert.equal(audit.health().public_origin_base44,false);
  assert.equal(audit.health().webhook_can_self_assert_paid,false);

  await assert.rejects(
    ()=>audit.createCheckout({
      tier:'quick',
      domain:'example.com',
      confirmedByUser:false
    }),
    /checkout_explicit_confirmation_required/
  );
  assert.equal(checkoutCreates,0);

  const quick=await audit.createCheckout({
    tier:'quick',
    domain:'https://www.example.com/path',
    referralCode:'proof-ref',
    acquisitionSource:'proof',
    campaignKey:'proof-campaign',
    journeyBucket:'ps_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    confirmedByUser:true
  });
  assert.equal(quick.amount_cents,4900);
  assert.equal(quick.order.status,'pending_payment');
  assert.equal(quick.order.domain,'example.com');
  assert.equal(quick.acquisition_state,'recorded');
  assert.equal(acquisitionEvents,1);
  assert.equal(checkoutCreates,1);

  await assert.rejects(
    ()=>audit.verifyPaidAudit({sessionId:quick.session_id}),
    /payment_not_successful/
  );
  assert.equal(
    entities.get('systemia-audit-center','PaidAuditOrder',quick.order.id).status,
    'pending_payment'
  );

  const quickSession=sessions.get(quick.session_id);
  quickSession.status='complete';
  quickSession.payment_status='paid';
  quickSession.payment_intent='pi_proof_quick';

  const verified=await audit.verifyPaidAudit({sessionId:quick.session_id});
  assert.equal(verified.verified,true);
  assert.equal(verified.provider_authoritative,true);
  assert.equal(verified.order.status,'paid_needs_intake');
  assert.equal(verified.order.amount_paid,49);
  assert.equal(verified.email,'buyer@example.invalid');

  const replay=await audit.verifyPaidAudit({sessionId:quick.session_id});
  assert.equal(replay.replayed,true);

  const tampered=await audit.createCheckout({
    tier:'complete',
    confirmedByUser:true
  });
  const tamperedSession=sessions.get(tampered.session_id);
  tamperedSession.status='complete';
  tamperedSession.payment_status='paid';
  tamperedSession.amount_total=49999;
  await assert.rejects(
    ()=>audit.verifyPaidAudit({sessionId:tampered.session_id}),
    /stripe_checkout_price_mismatch/
  );
  assert.equal(
    entities.get('systemia-audit-center','PaidAuditOrder',tampered.order.id).status,
    'pending_payment'
  );

  const webhookOrder=await audit.createCheckout({
    tier:'patch',
    confirmedByUser:true
  });
  const webhookSession=sessions.get(webhookOrder.session_id);
  webhookSession.status='complete';
  webhookSession.payment_status='paid';
  webhookSession.payment_intent='pi_proof_patch';

  const webhooks=new EvercraftWebhookGateway({
    stateDir:path.join(root,'webhooks'),
    secretStore:secrets
  });
  audit.registerStripeWebhook(webhooks);

  const body=Buffer.from(JSON.stringify({
    id:'evt_audit_checkout_1',
    type:'checkout.session.completed',
    data:{object:{id:webhookOrder.session_id}}
  }));
  const timestamp=String(Math.floor(new Date('2026-10-01T14:30:00.000Z').getTime()/1000));
  const signature=createHmac('sha256',webhookSecret)
    .update(timestamp+'.')
    .update(body)
    .digest('hex');
  const readsBeforeWebhook=checkoutReads;
  const delivered=await webhooks.handle({
    appKey:'systemia-audit-center',
    routeKey:'stripe',
    headers:{'stripe-signature':`t=${timestamp},v1=${signature}`},
    body,
    now:new Date('2026-10-01T14:30:00.000Z')
  });
  assert.equal(delivered.status,'delivered');
  assert.equal(
    entities.get('systemia-audit-center','PaidAuditOrder',webhookOrder.order.id).status,
    'paid_needs_intake'
  );
  assert.ok(checkoutReads>readsBeforeWebhook);

  const readsAfterFirstWebhook=checkoutReads;
  const replayWebhook=await webhooks.handle({
    appKey:'systemia-audit-center',
    routeKey:'stripe',
    headers:{'stripe-signature':`t=${timestamp},v1=${signature}`},
    body,
    now:new Date('2026-10-01T14:30:00.000Z')
  });
  assert.equal(replayWebhook.replayed,true);
  assert.equal(checkoutReads,readsAfterFirstWebhook);

  const disk=diskText(root);
  assert.equal(disk.includes(stripeSecret),false);
  assert.equal(disk.includes(webhookSecret),false);

  console.log(JSON.stringify({
    schema:'evercraft.audit-center.commerce-runtime-proof.v1',
    status:'pass',
    explicit_checkout_confirmation_required:true,
    owned_success_and_cancel_urls:true,
    local_order_identity_bound_into_provider_metadata:true,
    unpaid_session_does_not_unlock:true,
    provider_price_and_tier_verified:true,
    provider_authoritative_paid_transition:true,
    webhook_triggers_provider_verification:true,
    webhook_cannot_self_assert_paid:true,
    webhook_replay_does_not_reverify:true,
    provider_secrets_encrypted_at_rest:true,
    real_checkout_created:false,
    real_payment_created:false
  }));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
