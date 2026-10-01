#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { EvercraftSecretStore } from '../../secret-store/secret-store.mjs';
import { EvercraftConnectorGateway } from '../connector-gateway.mjs';
import { createConnectorIntegrationInvoker } from '../../app-fabric/connector-integration-adapter.mjs';
import { createPolarConnectorAdapter } from './polar.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-polar-adapter-proof-'));
const clientSecret='synthetic-polar-client-secret';
let tokenRequests=0;
let productsRequests=0;
let revokeRequests=0;

function jsonResponse(body,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{'content-type':'application/json'}
  });
}
async function fakeFetch(input,options={}){
  const url=new URL(typeof input==='string'?input:input.toString());
  const auth=String(options?.headers?.authorization||options?.headers?.Authorization||'');

  if(url.pathname==='/v1/oauth2/token'){
    tokenRequests+=1;
    const body=new URLSearchParams(String(options.body||''));
    assert.equal(body.get('client_id'),'evercraft-polar-client');
    assert.equal(body.get('client_secret'),clientSecret);
    if(body.get('grant_type')==='authorization_code'){
      assert.equal(body.get('code'),'proof-code');
      return jsonResponse({
        access_token:'access-1',
        token_type:'Bearer',
        expires_in:3600,
        scope:'openid profile email products:read products:write checkouts:read checkouts:write orders:read customers:read',
        refresh_token:'refresh-1'
      });
    }
    assert.equal(body.get('grant_type'),'refresh_token');
    assert.equal(body.get('refresh_token'),'refresh-1');
    return jsonResponse({
      access_token:'access-2',
      token_type:'Bearer',
      expires_in:3600,
      scope:'openid profile email products:read products:write checkouts:read checkouts:write orders:read customers:read',
      refresh_token:'refresh-2'
    });
  }

  if(url.pathname==='/v1/oauth2/userinfo'){
    assert.equal(auth,'Bearer access-1');
    return jsonResponse({sub:'polar-account-proof',name:'Proof Account'});
  }

  if(url.pathname==='/v1/products'&&String(options.method||'GET')==='GET'){
    productsRequests+=1;
    if(auth==='Bearer access-1') return jsonResponse({detail:'expired'},401);
    assert.equal(auth,'Bearer access-2');
    assert.equal(url.searchParams.get('limit'),'100');
    return jsonResponse({items:[{id:'product-proof'}]});
  }

  if(url.pathname==='/v1/checkouts/checkout-proof'&&String(options.method||'GET')==='GET'){
    assert.equal(auth,'Bearer access-2');
    return jsonResponse({
      id:'checkout-proof',
      status:'succeeded',
      total_amount:1900,
      currency:'usd',
      metadata:{purchase_token:'proof'}
    });
  }

  if(url.pathname==='/v1/oauth2/revoke'){
    revokeRequests+=1;
    const body=new URLSearchParams(String(options.body||''));
    assert.equal(body.get('token'),'refresh-2');
    assert.equal(body.get('client_secret'),clientSecret);
    return jsonResponse({});
  }

  throw new Error('unexpected_fake_polar_request:'+url.pathname);
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

try{
  const secrets=new EvercraftSecretStore({
    stateDir:path.join(root,'secrets'),
    masterKey:randomBytes(32)
  });
  const polar=createPolarConnectorAdapter({
    clientId:'evercraft-polar-client',
    clientSecretProvider:async()=>clientSecret,
    authorizationEndpoint:'https://polar.example.invalid/oauth/authorize',
    fetchImpl:fakeFetch
  });
  const gateway=new EvercraftConnectorGateway({
    stateDir:path.join(root,'connectors'),
    secretStore:secrets,
    adapters:{polar}
  });

  const begun=await gateway.beginAuthorization('workforce','polar',{
    redirectUri:'https://connect.evercraft.example/v1/connectors/workforce/polar/callback',
    scopes:[
      'products:read','products:write','checkouts:read','checkouts:write',
      'orders:read','customers:read','openid','profile','email'
    ]
  });
  const authorization=new URL(begun.authorization_url);
  assert.equal(authorization.hostname,'polar.example.invalid');
  assert.equal(authorization.searchParams.get('client_id'),'evercraft-polar-client');
  assert.equal(authorization.searchParams.get('state'),begun.state);
  assert.equal(authorization.searchParams.get('response_type'),'code');

  const connected=await gateway.completeAuthorization('workforce','polar',{
    state:begun.state,
    authorizationCode:'proof-code',
    redirectUri:'https://connect.evercraft.example/v1/connectors/workforce/polar/callback'
  });
  assert.equal(connected.connection.provider_account_ref,'polar-account-proof');
  const firstVersion=connected.connection.credential_version;

  const invokeIntegration=createConnectorIntegrationInvoker({connectorGateway:gateway});
  const products=await invokeIntegration({
    appKey:'workforce',
    provider:'polar',
    operation:'get:/v1/products',
    body:{queryParams:{limit:100}},
    serviceRole:true
  });
  assert.equal(products.success,true);
  assert.equal(products.operation,'products.list');
  assert.equal(products.data.items[0].id,'product-proof');
  assert.equal(productsRequests,2);
  assert.equal(tokenRequests,2);

  const afterRefresh=gateway.connection('workforce','polar');
  assert.ok(afterRefresh.credential_version>firstVersion);

  const checkout=await invokeIntegration({
    appKey:'workforce',
    provider:'polar',
    operation:'get:/v1/checkouts/{id}',
    body:{pathParams:{id:'checkout-proof'}},
    serviceRole:true
  });
  assert.equal(checkout.data.status,'succeeded');
  assert.equal(checkout.data.total_amount,1900);

  const disk=diskText(root);
  for(const secret of [clientSecret,'access-1','access-2','refresh-1','refresh-2',begun.state]){
    assert.equal(disk.includes(secret),false);
  }

  await gateway.disconnect('workforce','polar');
  assert.equal(revokeRequests,1);

  console.log(JSON.stringify({
    schema:'evercraft.connector.polar-proof.v1',
    status:'pass',
    owned_oauth_authorization_url:true,
    connected_account_verified_by_provider:true,
    legacy_custom_operations_mapped:true,
    arbitrary_provider_paths_allowed:false,
    provider_401_refreshes_token:true,
    refreshed_credential_rotated_in_secret_store:true,
    credential_values_plaintext_on_disk:false,
    provider_revoke_on_disconnect:true,
    checkout_or_payment_created:false
  }));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
