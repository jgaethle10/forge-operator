import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ProviderCredentialVault} from '../evercraft-home/credential-vault.mjs';
import {STRIPE_FIXED_PRICE_BINDINGS} from './raven-stripe-price-bridge.mjs';
import {
  verifyStripeRestrictedKeyForEvercraft,verifyAndSealStripeRestrictedKey,
} from '../../scripts/systemia-stripe-restricted-intake.mjs';

const key=['rk','live','SYNTHETICNEVERVALID0123456'].join('_');
const account={
  schema:'systemia.payments.stripe-connection-reference.v1',
  stripe_context:'acct_1FixtureOnlyNotReal56',
  provider_boundary:'raven_nexus',livemode:true,account_name:'Evercraft Test Fixture',
};
const mock=(opts={})=>{
  let reads=[];
  const fetchImpl=async(url,init)=>{
    reads.push({url,method:init.method,auth:init.headers.authorization});
    if(url.endsWith('/v1/account'))return Response.json({
      object:'account',id:opts.wrongAccount?'acct_wrong':account.stripe_context,
      charges_enabled:opts.noCharges?false:true,
    });
    for(const [slug,b] of Object.entries(STRIPE_FIXED_PRICE_BINDINGS)){
      if(url.endsWith('/v1/prices/'+b.stripe_price))return Response.json({
        object:'price',id:b.stripe_price,product:b.stripe_product,
        active:true,livemode:true,currency:'usd',type:'one_time',recurring:null,
        unit_amount:opts.badPrice?1:b.amount_cents,
      });
    }
    throw Error('unexpected_endpoint_'+url);
  };
  return {fetchImpl,reads};
};
function tempVault(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'systemia-stripe-intake-'));
  fs.chmodSync(dir,0o700);
  new ProviderCredentialVault({stateDir:dir});
  return dir;
}

test('owner-authenticated read-only Stripe account and exact two live prices, no checkout POST',async()=>{
  const m=mock();
  const result=await verifyStripeRestrictedKeyForEvercraft({key,account,fetchImpl:m.fetchImpl});
  assert.equal(result.account_match_verified,true);
  assert.equal(result.fixed_price_read_checks,2);
  assert.equal(result.checkout_write_permission_verified,false);
  assert.equal(result.checkout_session_created,false);
  assert.equal(result.payment_verified,false);
  assert.equal(m.reads.length,3);
  assert.ok(m.reads.every(x=>x.method==='GET'));
  assert.ok(m.reads.every(x=>x.url.startsWith('https://api.stripe.com/v1/')));
  assert.equal(JSON.stringify(result).includes(key),false);
});

test('restricted key only: reject full-access keys, wrong account, missing charge activation or price mismatch',async()=>{
  for(const input of ['not-a-key','sk_'+'live_'+'FULLKEYTESTNOTREAL01234','rk_'+'test_'+'SANDBOXTEST012345678901']){
    await assert.rejects(verifyStripeRestrictedKeyForEvercraft({key:input,account,fetchImpl:mock().fetchImpl}),
      /restricted_key_required/);
  }
  for(const options of [{wrongAccount:true},{noCharges:true},{badPrice:true}]){
    const m=mock(options);
    await assert.rejects(verifyStripeRestrictedKeyForEvercraft({key,account,fetchImpl:m.fetchImpl}));
    assert.ok(m.reads.every(x=>x.method==='GET'));
  }
});

test('authorized restricted Stripe key is encrypted into existing vault and never echoed',async()=>{
  const dir=tempVault();
  try{
    const verified=await verifyAndSealStripeRestrictedKey({key,stateDir:dir,account,fetchImpl:mock().fetchImpl});
    assert.equal(verified.credential_sealed,true);
    assert.equal(verified.account_match_verified,true);
    assert.equal(verified.raven_runtime_bound,false);
    assert.equal(verified.full_checkout_ready,false);
    const vault=new ProviderCredentialVault({stateDir:dir});
    const refs=vault.list({provider:'stripe'});
    assert.equal(refs.length,1);
    assert.match(refs[0].credential_ref,/^provider_stripe_live_[a-f0-9]{16}$/);
    const files=fs.readdirSync(dir).filter(x=>x.endsWith('.json'));
    assert.equal(files.length,1);
    const encrypted=fs.readFileSync(path.join(dir,files[0]),'utf8');
    assert.equal(encrypted.includes(key),false);
    assert.equal(JSON.stringify(verified).includes(key),false);
    assert.equal(vault.readSecret(refs[0].credential_ref).api_secret,key);
    await assert.rejects(verifyAndSealStripeRestrictedKey({key,stateDir:dir,account,fetchImpl:mock().fetchImpl}),
      /do_not_replace/);
    assert.equal(vault.list({provider:'stripe'}).length,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('missing or unsafe vault fails closed without initializing any new credentials',async()=>{
  const dir=path.join(os.tmpdir(),'stripe-intake-uncreated-'+process.pid);
  fs.rmSync(dir,{recursive:true,force:true});
  const m=mock();
  await assert.rejects(verifyAndSealStripeRestrictedKey({key,stateDir:dir,account,fetchImpl:m.fetchImpl}),
    /existing_evercraft_vault_or_key_missing/);
  assert.equal(fs.existsSync(dir),false);
  assert.equal(m.reads.length,0);
  const existing=tempVault();
  try{
    fs.chmodSync(existing,0o755);
    await assert.rejects(verifyAndSealStripeRestrictedKey({key,stateDir:existing,account,fetchImpl:m.fetchImpl}),
      /vault_permissions_or_identity_unsafe/);
    assert.equal(m.reads.length,0);
  }finally{fs.rmSync(existing,{recursive:true,force:true});}
});

test('invalid provider account or unauthorized key never reaches persistent vault',async()=>{
  const dir=tempVault();
  try{
    const bad=mock({wrongAccount:true});
    await assert.rejects(verifyAndSealStripeRestrictedKey({key,stateDir:dir,account,fetchImpl:bad.fetchImpl}),
      /does_not_match/);
    assert.equal(new ProviderCredentialVault({stateDir:dir}).list({provider:'stripe'}).length,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
