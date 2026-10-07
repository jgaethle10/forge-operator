import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startRavenPaymentRuntime} from './raven-payment-runtime.mjs';

const token='fixture-raven-payment-token-abcdefghijklmnopqrstuvwxyz';
const fakeSettlement=({orderKey})=>Promise.resolve({
  adapter:'stripe',
  checkout_session_id:'cs_test_'+orderKey.toLowerCase(),
  checkout_url:'https://checkout.stripe.test/session/'+orderKey.toLowerCase(),
  payment_state:'unpaid',
});

test('Raven payment runtime is loopback-only',async()=>{
  await assert.rejects(
    ()=>startRavenPaymentRuntime({
      host:'0.0.0.0',
      stateDir:fs.mkdtempSync(path.join(os.tmpdir(),'raven-pay-')),
      controlToken:token,
      settlementExecutor:fakeSettlement,
    }),
    /loopback/
  );
});

test('owned purchase intent uses canonical offer price and idempotently reuses checkout',async()=>{
  const stateDir=fs.mkdtempSync(path.join(os.tmpdir(),'raven-pay-'));
  let calls=0;
  const runtime=await startRavenPaymentRuntime({
    stateDir,
    controlToken:token,
    settlementExecutor:async(args)=>{calls+=1;return fakeSettlement(args);},
  });
  try{
    const noAuth=await fetch(runtime.url+'/v1/purchase-intents',{method:'POST'});
    assert.equal(noAuth.status,401);

    const noConfirm=await fetch(runtime.url+'/v1/purchase-intents',{
      method:'POST',
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify({
        user_confirmed:false,
        capability_key:'website-audit-quick-win',
        idempotency_key:'fixture-idempotency-001',
      }),
    });
    assert.equal(noConfirm.status,409);
    assert.equal(calls,0);

    const body={
      user_confirmed:true,
      capability_key:'website-audit-quick-win',
      idempotency_key:'fixture-idempotency-001',
      amount_cents:1,
    };
    const first=await fetch(runtime.url+'/v1/purchase-intents',{
      method:'POST',
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify(body),
    });
    assert.equal(first.status,200);
    const firstJson=await first.json();
    assert.equal(firstJson.amount_cents,4900);
    assert.equal(firstJson.authority,'Evercraft Payments');
    assert.equal(firstJson.provider_boundary,'Raven Nexus');
    assert.equal(firstJson.settlement_adapter,'stripe');
    assert.equal(firstJson.checkout_ready,true);
    assert.equal(firstJson.payment_state,'unpaid');
    assert.equal(firstJson.fulfillment_release,false);
    assert.equal(calls,1);

    const second=await fetch(runtime.url+'/v1/purchase-intents',{
      method:'POST',
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify(body),
    });
    assert.equal(second.status,200);
    const secondJson=await second.json();
    assert.equal(secondJson.order_key,firstJson.order_key);
    assert.equal(secondJson.checkout_url,firstJson.checkout_url);
    assert.equal(secondJson.duplicate_prevented,true);
    assert.equal(calls,1);
  }finally{
    await runtime.close();
    fs.rmSync(stateDir,{recursive:true,force:true});
  }
});

test('unknown purchase key and idempotency conflicts fail closed',async()=>{
  const stateDir=fs.mkdtempSync(path.join(os.tmpdir(),'raven-pay-'));
  const runtime=await startRavenPaymentRuntime({
    stateDir,
    controlToken:token,
    settlementExecutor:fakeSettlement,
  });
  try{
    const unknown=await fetch(runtime.url+'/v1/purchase-intents',{
      method:'POST',
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify({
        user_confirmed:true,
        capability_key:'not-a-real-offer',
        idempotency_key:'fixture-idempotency-002',
      }),
    });
    assert.equal(unknown.status,404);

    const headers={authorization:'Bearer '+token,'content-type':'application/json'};
    const first=await fetch(runtime.url+'/v1/purchase-intents',{
      method:'POST',headers,
      body:JSON.stringify({
        user_confirmed:true,
        capability_key:'findmypart-quick-hunt',
        idempotency_key:'fixture-idempotency-003',
      }),
    });
    assert.equal(first.status,200);

    const conflict=await fetch(runtime.url+'/v1/purchase-intents',{
      method:'POST',headers,
      body:JSON.stringify({
        user_confirmed:true,
        capability_key:'legacy-rescue-scan',
        idempotency_key:'fixture-idempotency-003',
      }),
    });
    assert.equal(conflict.status,409);
  }finally{
    await runtime.close();
    fs.rmSync(stateDir,{recursive:true,force:true});
  }
});

test('missing settlement credential fails closed after preserving Evercraft order',async()=>{
  const stateDir=fs.mkdtempSync(path.join(os.tmpdir(),'raven-pay-'));
  const runtime=await startRavenPaymentRuntime({
    stateDir,
    controlToken:token,
    env:{},
    credentialStateDir:'',
  });
  try{
    const response=await fetch(runtime.url+'/v1/purchase-intents',{
      method:'POST',
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify({
        user_confirmed:true,
        capability_key:'ibmi-estate-xray',
        idempotency_key:'fixture-idempotency-004',
      }),
    });
    assert.equal(response.status,503);
    const body=await response.json();
    assert.equal(body.amount_cents,25000);
    assert.match(body.order_key,/^EC-/);
    assert.equal(body.checkout_ready,false);
    assert.equal(body.fulfillment_release,false);
  }finally{
    await runtime.close();
    fs.rmSync(stateDir,{recursive:true,force:true});
  }
});
