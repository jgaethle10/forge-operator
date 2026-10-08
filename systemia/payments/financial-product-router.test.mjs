import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyAuthorityRecord, resolveFinancialAuthority } from './financial-authority-registry.mjs';
import { routeFinancialProduct } from './financial-product-router.mjs';

test('arbitrary authority strings are not accepted as authority records',()=>{
  const registry={authorities:[]};
  const result=resolveFinancialAuthority({
    registry,
    authorityKey:'yep-we-are-a-bank',
    capabilityKey:'deposit_account'
  });
  assert.equal(result.ok,false);
  assert.equal(result.reason,'authority_not_found');
});

test('verified authority must explicitly scope the requested capability',()=>{
  const record={
    authority_key:'partner-1',
    status:'verified',
    regulator_or_issuer:'Example regulator',
    evidence_ref:'evidence://charter',
    capability_scope:['card_issuing']
  };
  const check=verifyAuthorityRecord(record,'deposit_account');
  assert.equal(check.ok,false);
});

test('Financial Command Center is routable now without custody or bank claims',()=>{
  const result=routeFinancialProduct({productKey:'evercraft-financial-command-center'});
  assert.equal(result.ready,true);
  assert.equal(result.custody_claim,false);
  assert.equal(result.bank_claim,false);
  assert.ok(result.capabilities.every(x=>x.allowed));
});

test('partner account experience is blocked while authority registry is empty',()=>{
  const result=routeFinancialProduct({productKey:'evercraft-partner-account-experience'});
  assert.equal(result.ready,false);
  assert.ok(result.capabilities.every(x=>x.allowed===false));
});

test('chartered account is blocked while charter and insurance evidence are absent',()=>{
  const result=routeFinancialProduct({productKey:'evercraft-chartered-account'});
  assert.equal(result.ready,false);
  assert.equal(result.custody_claim,true);
  assert.equal(result.bank_claim,true);
  assert.equal(result.capabilities[0].allowed,false);
});

test('verified scoped authority can unlock only its declared rails',()=>{
  const products={
    products:[{
      product_key:'partner-test',
      name:'Partner Test',
      state:'test',
      capabilities:['deposit_account','card_issuing'],
      authority_key:'partner-verified',
      custody_claim:false,
      bank_claim:false
    }]
  };
  const authorityRegistry={
    authorities:[{
      authority_key:'partner-verified',
      status:'verified',
      regulator_or_issuer:'Example authority',
      evidence_ref:'evidence://verified-authority',
      capability_scope:['deposit_account']
    }]
  };
  const result=routeFinancialProduct({productKey:'partner-test',products,authorityRegistry});
  assert.equal(result.ready,false);
  assert.equal(result.capabilities.find(x=>x.capability_key==='deposit_account').allowed,true);
  assert.equal(result.capabilities.find(x=>x.capability_key==='card_issuing').allowed,false);
});
