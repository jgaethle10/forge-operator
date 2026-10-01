#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac, randomBytes } from 'node:crypto';
import { EvercraftSecretStore } from '../secret-store/secret-store.mjs';
import { EvercraftWebhookGateway } from './webhook-gateway.mjs';
import { createStripeWebhookVerifier, createSharedSecretJsonWebhookVerifier } from './provider-verifiers.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-provider-webhook-proof-'));
const now=new Date('2026-10-01T14:00:00.000Z');
let stripeDeliveries=0;
let voiceDeliveries=0;

try{
  const secrets=new EvercraftSecretStore({
    stateDir:path.join(root,'secrets'),
    masterKey:randomBytes(32)
  });
  secrets.setSecret('webhook:audit:stripe','signing-secret','whsec-proof');
  secrets.setSecret('webhook:remote-ops:voice','signing-secret','voice-proof-secret');

  const gateway=new EvercraftWebhookGateway({
    stateDir:path.join(root,'webhooks'),
    secretStore:secrets,
    maxSkewMs:5*60*1000
  });

  gateway.registerRoute({
    appKey:'audit',
    routeKey:'stripe',
    secretNamespace:'webhook:audit:stripe',
    secretName:'signing-secret',
    verifier:createStripeWebhookVerifier(),
    handler:async ({eventId,verificationMetadata})=>{
      stripeDeliveries+=1;
      return {eventId,eventType:verificationMetadata.event_type};
    }
  });

  gateway.registerRoute({
    appKey:'remote-ops',
    routeKey:'voice',
    secretNamespace:'webhook:remote-ops:voice',
    secretName:'signing-secret',
    verifier:createSharedSecretJsonWebhookVerifier(),
    handler:async ({eventId,verificationMetadata})=>{
      voiceDeliveries+=1;
      return {eventId,eventType:verificationMetadata.event_type};
    }
  });

  const stripeBody=Buffer.from(JSON.stringify({
    id:'evt_stripe_proof_1',
    type:'checkout.session.completed',
    data:{object:{id:'cs_test_proof'}}
  }));
  const stripeTs=String(Math.floor(now.getTime()/1000));
  const stripeSig=createHmac('sha256','whsec-proof')
    .update(stripeTs+'.')
    .update(stripeBody)
    .digest('hex');
  const stripeHeaders={
    'stripe-signature':`t=${stripeTs},v1=${'00'.repeat(32)},v1=${stripeSig}`
  };

  const stripeFirst=await gateway.handle({
    appKey:'audit',routeKey:'stripe',
    headers:stripeHeaders,body:stripeBody,now
  });
  assert.equal(stripeFirst.status,'delivered');
  assert.equal(stripeFirst.event_id,'evt_stripe_proof_1');
  assert.equal(stripeDeliveries,1);

  const stripeReplay=await gateway.handle({
    appKey:'audit',routeKey:'stripe',
    headers:stripeHeaders,body:stripeBody,now
  });
  assert.equal(stripeReplay.replayed,true);
  assert.equal(stripeDeliveries,1);

  const staleTs=String(Math.floor((now.getTime()-10*60*1000)/1000));
  const staleSig=createHmac('sha256','whsec-proof')
    .update(staleTs+'.')
    .update(stripeBody)
    .digest('hex');
  await assert.rejects(
    ()=>gateway.handle({
      appKey:'audit',routeKey:'stripe',
      headers:{'stripe-signature':`t=${staleTs},v1=${staleSig}`},
      body:stripeBody,now
    }),
    /webhook_timestamp_outside_replay_window/
  );

  await assert.rejects(
    ()=>gateway.handle({
      appKey:'audit',routeKey:'stripe',
      headers:{'stripe-signature':`t=${stripeTs},v1=${'11'.repeat(32)}`},
      body:stripeBody,now
    }),
    /webhook_signature_mismatch/
  );

  const voiceBody=Buffer.from(JSON.stringify({
    moment_id:'M-proof-1',
    evercraft_call_id:'VOICE-proof',
    event_type:'tool_result',
    content:'Proof event'
  }));
  const voiceHeaders={'x-evercraft-voice-secret':'voice-proof-secret'};
  const voiceFirst=await gateway.handle({
    appKey:'remote-ops',routeKey:'voice',
    headers:voiceHeaders,body:voiceBody,now
  });
  assert.equal(voiceFirst.status,'delivered');
  assert.equal(voiceFirst.event_id,'M-proof-1');
  assert.equal(voiceDeliveries,1);

  const voiceReplay=await gateway.handle({
    appKey:'remote-ops',routeKey:'voice',
    headers:voiceHeaders,body:voiceBody,now:new Date(now.getTime()+60*60*1000)
  });
  assert.equal(voiceReplay.replayed,true);
  assert.equal(voiceDeliveries,1);

  await assert.rejects(
    ()=>gateway.handle({
      appKey:'remote-ops',routeKey:'voice',
      headers:{'x-evercraft-voice-secret':'wrong'},
      body:voiceBody,now
    }),
    /webhook_signature_mismatch/
  );

  assert.equal(gateway.health().route_specific_verifiers_supported,true);

  console.log(JSON.stringify({
    schema:'evercraft.webhook.provider-verifiers-proof.v1',
    status:'pass',
    stripe_raw_body_hmac_verified:true,
    stripe_multiple_v1_supported:true,
    stripe_replay_window_enforced:true,
    stripe_event_id_idempotent:true,
    voice_shared_secret_constant_time_verified:true,
    voice_provider_timestamp_absent_preserved:true,
    voice_body_event_id_idempotent:true,
    duplicate_provider_events_not_redispatched:true
  }));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
