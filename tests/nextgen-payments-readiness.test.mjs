import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretFabricHealth,interpretCatalog,observeReadiness} from '../scripts/nextgen-payments-readiness.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('public Fabric state is separate from NextGen shell flags',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'eve-payments-'));
  try{
    mkdirSync(join(folder,'public/mesh/checkout-ready'),{recursive:true});
    mkdirSync(join(folder,'public/.well-known'),{recursive:true});
    writeFileSync(join(folder,'public/mesh/checkout-ready/verified-links.json'),JSON.stringify({checked_on:'2026-10-25',links:[{key:'a',amount_cents:10000,url:'https://buy.stripe.com/abc123',stripe_price_id:'price_abc'}]}));
    writeFileSync(join(folder,'public/.well-known/evercraft-commercial-readiness.json'),JSON.stringify({as_of:'2026-10-25',commercial_checkout_ready:false}));
    const calls=[];
    const fetchImpl=async(url,init)=>{
      calls.push({url,method:init.method});
      if(url.endsWith('/health'))return new Response(JSON.stringify({checkout_purchase_intent_configured:true,checkout_direct_offer_ops_configured:false,checkout_operational_state:'held_owned_payment_endpoint_unconfigured'}),{status:200});
      return new Response('<html>Evercraft Payments</html>',{status:200});
    };
    const r=await observeReadiness({cwd:folder,env:{EVERCRAFT_PAYMENT_OPS_OWNED_URL:'https://private.example'},fetchImpl});
    const shell=r.checks.find(c=>c.check==='nextgen_shell_env');
    const publicHealth=r.checks.find(c=>c.check==='public_fabric_health');
    assert.equal(shell.flags.EVERCRAFT_PURCHASE_INTENT_OWNED_URL,false);
    assert.equal(shell.flags.EVERCRAFT_PAYMENT_OPS_OWNED_URL,true);
    assert.equal(publicHealth.health.purchase_intent_configured,true);
    assert.equal(publicHealth.health.payment_ops_configured,false);
    assert.equal(r.operational_gap,'PUBLIC_FABRIC_OWNED_TRANSPORT_NOT_FULLY_CONFIGURED');
    assert.equal(r.native_checkout_paid_acceptance_verified,false);
    assert.ok(calls.every(c=>c.method==='GET'));
    assert.equal(calls.length,2);
    assert.ok(!JSON.stringify(r).includes('private.example'));
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('healthy HTTP and configured flags never claim verified payment',()=>{
  const status=interpretFabricHealth({checkout_purchase_intent_configured:true,checkout_direct_offer_ops_configured:true,checkout_provider_paid_verified:false,checkout_operational_state:'owned_transport_requires_independent_checkout_canary'});
  assert.equal(status.payment_ops_configured,true);
  assert.equal(status.paid_receipt_verified,false);
});

test('catalog rejects mismatched hosted payment origins and duplicate keys',()=>{
  assert.equal(interpretCatalog({links:[{key:'x',amount_cents:1,url:'https://evil.example/a',stripe_price_id:'price_x'}]}).valid,false);
  assert.equal(interpretCatalog({links:[{key:'x',amount_cents:1,url:'https://buy.stripe.com/abc',stripe_price_id:'price_x'},{key:'x',amount_cents:1,url:'https://buy.stripe.com/def',stripe_price_id:'price_y'}]}).valid,false);
});
