import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {
  buildStripeConnectionReference,storeStripeConnectionReference,
  readStripeConnectionReference,displayStripeConnectionStatus,
  requireStripeRuntimeAuthorization,stripeConnectionPath,
} from './stripe-connection-registry.mjs';

const sample=()=>buildStripeConnectionReference({
  stripeContext:'acct_1AbCdEfGhI1234',accountName:'Evercraft Test Account',
  livemode:true,observedDate:'2026-10-21',
});

test('connection stores private durable account context but no token or payment authority',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'systemia-stripe-registry-'));
  try{
    const file=stripeConnectionPath({stateHome:root});
    const saved=storeStripeConnectionReference(sample(),{file});
    assert.equal(saved.saved,true);
    assert.equal(saved.unchanged,false);
    const stat=fs.statSync(file);
    assert.equal(stat.mode&0o077,0);
    assert.equal(fs.statSync(path.dirname(file)).mode&0o077,0);
    const text=fs.readFileSync(file,'utf8');
    assert.ok(!/secret_key|api_key|access_token|refresh_token|sk_live_|rk_live_/i.test(text));
    const stored=readStripeConnectionReference({file});
    assert.equal(stored.stripe_context,'acct_1AbCdEfGhI1234');
    assert.equal(stored.account_name,'Evercraft Test Account');
    assert.equal(stored.livemode,true);
    assert.equal(stored.provider_boundary,'raven_nexus');
    assert.equal(stored.commerce_layer,'evercraft_payments');
    assert.equal(stored.credential_custody,'external_provider_managed');
    assert.equal(stored.systemia_runtime_authorized,false);
    assert.equal(stored.checkout_verified,false);
    assert.equal(stored.payment_verified,false);
    assert.equal(stored.settlement_verified,false);
    const status=displayStripeConnectionStatus({file});
    assert.equal(status.stored,true);
    assert.equal(status.runtime_authorized,false);
    assert.ok(!JSON.stringify(status).includes(stored.stripe_context));
    assert.equal(storeStripeConnectionReference(sample(),{file}).unchanged,true);
    assert.throws(requireStripeRuntimeAuthorization,/not_delegated/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('account switching, credential insertion and mode mistakes fail closed',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'systemia-stripe-reject-'));
  try{
    const file=stripeConnectionPath({stateHome:root});
    storeStripeConnectionReference(sample(),{file});
    assert.throws(()=>storeStripeConnectionReference({
      ...sample(),api_key:'sk_live_fake',
    },{file}),/extra_or_secret_fields_forbidden/);
    assert.throws(()=>storeStripeConnectionReference({
      ...sample(),stripe_context:'acct_1OtherDifferent345',
    },{file}),/switch_requires_explicit_replace/);
    assert.throws(()=>storeStripeConnectionReference({
      ...sample(),livemode:false,
    },{file}),/switch_requires_explicit_replace/);
    assert.equal(readStripeConnectionReference({file}).stripe_context,sample().stripe_context);
    const moved=storeStripeConnectionReference({...sample(),livemode:false},{file,allowReplace:true});
    assert.equal(moved.saved,true);
    assert.equal(readStripeConnectionReference({file}).livemode,false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('rejects malformed Stripe account contexts and false financial claims',()=>{
  assert.throws(()=>buildStripeConnectionReference({
    stripeContext:'sk_live_abc',accountName:'Evercraft',livemode:true,
    observedDate:'2026-10-21',
  }),/context_invalid/);
  assert.throws(()=>buildStripeConnectionReference({
    stripeContext:'acct_1AbCdEfGhI1234',accountName:'Evercraft',livemode:'true',
    observedDate:'2026-10-21',
  }),/mode_explicit/);
  assert.throws(()=>buildStripeConnectionReference({
    stripeContext:'acct_1AbCdEfGhI1234',accountName:'Evercraft',
    livemode:true,observedDate:'2026-02-31',
  }),/observation_date_invalid/);
});

test('CLI is node parseable and --status does not demand account credentials',()=>{
  const source=new URL('../../scripts/systemia-stripe-connection.mjs',import.meta.url);
  execFileSync(process.execPath,['--check',source.pathname]);
  const text=fs.readFileSync(source,'utf8');
  assert.match(text,/--register/);
  assert.match(text,/--confirm-live/);
  assert.match(text,/--replace/);
  assert.match(text,/displayStripeConnectionStatus/);
  assert.doesNotMatch(text,/STRIPE_SECRET_KEY/);
});
