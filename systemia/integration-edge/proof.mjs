#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac, randomBytes } from 'node:crypto';
import { EvercraftSecretStore } from '../secret-store/secret-store.mjs';
import { EvercraftConnectorGateway } from '../connector-gateway/connector-gateway.mjs';
import { EvercraftWebhookGateway } from '../webhook-gateway/webhook-gateway.mjs';
import { startIntegrationEdge } from './runtime.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-integration-edge-proof-'));
const accessToken='synthetic-provider-token-not-for-production';
const webhookSecret='synthetic-webhook-signing-secret';
let webhookDeliveries=0;

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

try{
  const secrets=new EvercraftSecretStore({
    stateDir:path.join(root,'secrets'),
    masterKey:randomBytes(32)
  });
  secrets.setSecret('webhook:proof-app:provider','signing-secret',webhookSecret);

  const connectors=new EvercraftConnectorGateway({
    stateDir:path.join(root,'connectors'),
    secretStore:secrets,
    allowLoopbackProof:true,
    adapters:{
      ProofProvider:{
        async buildAuthorizationUrl({state,redirectUri}){
          const url=new URL('https://provider.example.invalid/oauth/authorize');
          url.searchParams.set('state',state);
          url.searchParams.set('redirect_uri',redirectUri);
          return url.toString();
        },
        async exchangeAuthorization({code,redirectUri}){
          assert.equal(code,'proof-code');
          assert.match(redirectUri,/^http:\/\/127\.0\.0\.1:\d+\/v1\/connectors\/proof-app\/ProofProvider\/callback$/);
          return {
            credential:{access_token:accessToken},
            provider_account_ref:'proof-provider-account',
            scopes:['read']
          };
        },
        async invoke(){ return {ok:true}; }
      }
    }
  });

  const webhooks=new EvercraftWebhookGateway({
    stateDir:path.join(root,'webhooks'),
    secretStore:secrets
  });
  webhooks.registerRoute({
    appKey:'proof-app',
    routeKey:'provider',
    secretNamespace:'webhook:proof-app:provider',
    secretName:'signing-secret',
    handler:async()=>{ webhookDeliveries+=1; return {accepted:true}; }
  });

  const edge=await startIntegrationEdge({
    connectorGateway:connectors,
    webhookGateway:webhooks,
    allowLoopbackProof:true,
    authorizeConnectorBegin:async({request})=>request.headers.authorization==='Bearer operator-proof'
  });

  try{
    const health=await fetch(edge.origin+'/health').then((r)=>r.json());
    assert.equal(health.ok,true);
    assert.equal(health.base44_callback_origin_allowed,false);
    assert.equal(health.oauth_callback_state_protected,true);

    const denied=await fetch(edge.origin+'/v1/connectors/proof-app/ProofProvider/authorize',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({scopes:['read']})
    });
    assert.equal(denied.status,401);

    const begunResponse=await fetch(edge.origin+'/v1/connectors/proof-app/ProofProvider/authorize',{
      method:'POST',
      headers:{
        'content-type':'application/json',
        authorization:'Bearer operator-proof'
      },
      body:JSON.stringify({scopes:['read']})
    });
    assert.equal(begunResponse.status,200);
    const begun=await begunResponse.json();
    assert.equal(begun.ok,true);
    assert.ok(begun.state);
    const authUrl=new URL(begun.authorization_url);
    assert.equal(authUrl.searchParams.get('state'),begun.state);

    const beforeCallback=diskText(root);
    assert.equal(beforeCallback.includes(begun.state),false);
    assert.equal(beforeCallback.includes(accessToken),false);

    const callbackUrl=edge.origin+
      '/v1/connectors/proof-app/ProofProvider/callback?code=proof-code&state='+encodeURIComponent(begun.state);
    const callbackResponse=await fetch(callbackUrl);
    assert.equal(callbackResponse.status,200);
    const callback=await callbackResponse.json();
    assert.equal(callback.connected,true);
    assert.equal(callback.credential_value_emitted,false);
    assert.equal(callback.provider_account_ref,'proof-provider-account');

    const replayCallback=await fetch(callbackUrl);
    assert.equal(replayCallback.status,409);

    const timestamp=String(Math.floor(Date.now()/1000));
    const webhookBody=Buffer.from(JSON.stringify({event:'proof'}));
    const signature=createHmac('sha256',webhookSecret)
      .update(timestamp+'.')
      .update(webhookBody)
      .digest('hex');
    const webhookHeaders={
      'content-type':'application/json',
      'x-evercraft-event-id':'evt-integration-proof-1',
      'x-evercraft-timestamp':timestamp,
      'x-evercraft-signature':'sha256='+signature
    };

    const firstWebhook=await fetch(edge.origin+'/v1/webhooks/proof-app/provider',{
      method:'POST',
      headers:webhookHeaders,
      body:webhookBody
    });
    assert.equal(firstWebhook.status,200);
    const firstWebhookBody=await firstWebhook.json();
    assert.equal(firstWebhookBody.replayed,false);
    assert.equal(webhookDeliveries,1);

    const replayWebhook=await fetch(edge.origin+'/v1/webhooks/proof-app/provider',{
      method:'POST',
      headers:webhookHeaders,
      body:webhookBody
    });
    assert.equal(replayWebhook.status,200);
    const replayWebhookBody=await replayWebhook.json();
    assert.equal(replayWebhookBody.replayed,true);
    assert.equal(webhookDeliveries,1);

    const finalDisk=diskText(root);
    assert.equal(finalDisk.includes(accessToken),false);
    assert.equal(finalDisk.includes(begun.state),false);

    console.log(JSON.stringify({
      schema:'evercraft.integration-edge.proof.v1',
      status:'pass',
      connector_start_requires_authorization:true,
      oauth_state_protected_callback:true,
      oauth_callback_replay_rejected:true,
      credentials_encrypted_at_rest:true,
      webhook_raw_body_signature_verified:true,
      webhook_replay_idempotent:true,
      base44_callback_origin_allowed:false
    }));
  }finally{
    await edge.close();
  }
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
