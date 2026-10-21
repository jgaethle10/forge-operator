import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {ProviderCredentialVault} from '../evercraft-home/credential-vault.mjs';
import {
  createRavenStripeCheckoutSession,loadRavenStripeSecret,
} from './raven-stripe-checkout-adapter.mjs';
import {STRIPE_FIXED_PRICE_BINDINGS} from './raven-stripe-price-bridge.mjs';

const account={
  schema:'systemia.payments.stripe-connection-reference.v1',
  connection_key:'evercraft-primary-stripe',provider_boundary:'raven_nexus',
  stripe_context:'acct_1SyntheticRavenOwner123',
  livemode:true,systemia_runtime_authorized:false,
};
const order={
  slug:'findmypart',order_key:'buyer-01234567-89ab-cdef-0123-456789abcdef',
  offer_key:'findmypart.quick_hunt_19.v1',amount_cents:1900,currency:'usd',
  order_truth:'evercraft_payments',provider_boundary:'raven_nexus',
  confirmation_state:'buyer_confirmed',order_persisted:true,
  payment_state:'unpaid',synthetic:false,customer_email:'buyer@example.com',
};
const providerPrice={
  object:'price',id:STRIPE_FIXED_PRICE_BINDINGS.findmypart.stripe_price,
  product:STRIPE_FIXED_PRICE_BINDINGS.findmypart.stripe_product,
  unit_amount:1900,currency:'usd',active:true,livemode:true,
  type:'one_time',recurring:null,
};
const mockCredential='unit-test-credential-not-real';
const mockReader=()=>mockCredential;
const response=value=>Response.json(value,{status:200});

function mockStripe({wrongAccount=false,disabled=false,wrongPrice=false,paidSession=false}={}){
  const requests=[];
  const fetchImpl=async(url,req)=>{
    requests.push({url,method:req.method,authorization:req.headers.authorization,
      idempotency:req.headers['idempotency-key'],body:req.body});
    if(url==='https://api.stripe.com/v1/account'){
      return response({object:'account',id:wrongAccount?'acct_wrong':account.stripe_context,
        charges_enabled:!disabled});
    }
    if(url==='https://api.stripe.com/v1/prices/'+providerPrice.id){
      return response({...providerPrice,...(wrongPrice?{unit_amount:1}:{})});
    }
    if(url==='https://api.stripe.com/v1/checkout/sessions'){
      const fields=new URLSearchParams(req.body);
      return response({
        object:'checkout.session',id:'cs_live_MOCKONLY123',
        url:'https://checkout.stripe.com/c/pay/cs_live_MOCKONLY123',
        livemode:true,mode:'payment',status:'open',
        payment_status:paidSession?'paid':'unpaid',
        currency:'usd',amount_total:1900,
        client_reference_id:fields.get('client_reference_id'),
        metadata:{
          evercraft_order_key:fields.get('metadata[evercraft_order_key]'),
          evercraft_offer_key:fields.get('metadata[evercraft_offer_key]'),
        },
      });
    }
    if(url.endsWith('/line_items')){
      return response({object:'list',has_more:false,data:[{
        quantity:1,currency:'usd',amount_total:1900,
        price:{id:providerPrice.id,product:providerPrice.product,unit_amount:1900,currency:'usd'},
      }]});
    }
    throw Error('mock_stripe_unexpected_endpoint');
  };
  return {fetchImpl,requests};
}

test('existing encrypted Evercraft vault is mandatory: no parallel raw secret file is created',()=>{
  assert.throws(()=>loadRavenStripeSecret({
    stateDir:'/tmp/not-provisioned-raven-provider-vault',
    credentialRef:'provider_stripe_live_0123456789abcdef',
  }),/not_provisioned/);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-raven-stripe-vault-'));
  try{
    const vault=new ProviderCredentialVault({stateDir:dir});
    const meta=vault.put({
      provider:'stripe',environment:'live',label:'primary',
      apiKeyId:'test-only-identifier',
      apiSecret:'test-not-a-stripe-key-value',
    });
    const result=vault.list({provider:'stripe'});
    assert.equal(result.length,1);
    assert.equal(result[0].credential_ref,meta.credential_ref);
    assert.throws(()=>loadRavenStripeSecret({
      stateDir:dir,credentialRef:meta.credential_ref
    }),/live_secret_invalid/);
    assert.throws(()=>loadRavenStripeSecret({
      stateDir:dir,credentialRef:'provider_stripe_live_0123456789abcdef'
    }),/credential_ref_not_found/);
    fs.chmodSync(path.join(dir,'.vault-key'),0o644);
    assert.throws(()=>loadRavenStripeSecret({
      stateDir:dir,credentialRef:meta.credential_ref
    }),/vault_insecure/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('authenticated mock performs account, price and idempotent checkout calls, but never declares paid',async()=>{
  const fake=mockStripe();
  const opts={order,account,vaultStateDir:'mock-vault-not-read',credentialRef:'mock-ref-not-read',fetchImpl:fake.fetchImpl,secretReader:mockReader};
  const ready=await createRavenStripeCheckoutSession(opts);
  assert.equal(ready.state,'checkout_prepared_unpaid');
  assert.equal(ready.checkout_ready,true);
  assert.equal(ready.payment_verified,false);
  assert.equal(ready.receipt_created,false);
  assert.equal(ready.entitlement_granted,false);
  assert.equal(ready.fulfillment_released,false);
  assert.deepEqual(fake.requests.map(x=>x.method),['GET','GET','POST']);
  assert.ok(fake.requests.every(x=>x.authorization==='Bearer '+mockCredential));
  assert.match(fake.requests[2].idempotency,/^evercraft-checkout-[a-f0-9]{44}$/);
  assert.equal(new URLSearchParams(fake.requests[2].body).get('line_items[0][price]'),providerPrice.id);
  assert.equal(JSON.stringify(ready).includes(mockCredential),false);
  const second=await createRavenStripeCheckoutSession(opts);
  assert.equal(second.checkout_url,ready.checkout_url);
  assert.equal(fake.requests[2].idempotency,fake.requests[5].idempotency);
});

test('account identity, charge status and price mismatches reject before POST',async()=>{
  for(const config of [{wrongAccount:true},{disabled:true},{wrongPrice:true}]){
    const fake=mockStripe(config);
    await assert.rejects(createRavenStripeCheckoutSession({
      order,account,vaultStateDir:'mock-vault-not-read',credentialRef:'mock-ref-not-read',fetchImpl:fake.fetchImpl,secretReader:mockReader
    }));
    assert.ok(fake.requests.length>=1);
    assert.ok(fake.requests.every(req=>req.method==='GET'));
  }
});

test('provider session reporting paid or completed at creation is rejected',async()=>{
  const fake=mockStripe({paidSession:true});
  await assert.rejects(createRavenStripeCheckoutSession({
    order,account,vaultStateDir:'mock-vault-not-read',credentialRef:'mock-ref-not-read',fetchImpl:fake.fetchImpl,secretReader:mockReader
  }),/new_session_unverified/);
});

test('buyer confirmation, persisted order, non-synthetic unpaid state required before credential read',async()=>{
  const fake=mockStripe();
  for(const patch of [
    {order_persisted:false},{confirmation_state:'pending'},
    {payment_state:'paid'},{synthetic:true},{amount_cents:1},{order_truth:'stripe'}
  ]){
    await assert.rejects(createRavenStripeCheckoutSession({
      order:{...order,...patch},account,vaultStateDir:'mock-vault-not-read',credentialRef:'mock-ref-not-read',fetchImpl:fake.fetchImpl,
      secretReader:()=>{throw Error('should_not_read_secret');}
    }),/canonical_order_ineligible/);
  }
  assert.equal(fake.requests.length,0);
});
