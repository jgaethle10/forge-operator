import assert from 'node:assert/strict';
import test from 'node:test';
import {BANK_OPTIONS, verifyBankDestination} from './bank-destination-policy.mjs';

const bluevine={institution:'bluevine',account_class:'business_checking',business_owner_verified:true,
  receiving_account_verified:true,bank_ach_receiving_confirmed:true};
const hapo={institution:'hapo',account_class:'commercial_checking',business_owner_verified:true,
  receiving_account_verified:true,bank_ach_receiving_confirmed:true};

test('Bluevine business checking is candidate for confirmed ACH credit, never Zelle',()=>{
  assert.equal(BANK_OPTIONS.bluevine.zelle_business_supported,false);
  assert.equal(verifyBankDestination('ach_credit',bluevine),true);
  assert.equal(verifyBankDestination('zelle',{...bluevine,business_zelle_enrollment_confirmed:true,bank_zelle_service_verified:true}),false);
});

test('HAPO commercial account requires confirmed ownership and current receiving service',()=>{
  assert.equal(verifyBankDestination('ach_credit',hapo),true);
  assert.equal(verifyBankDestination('ach_credit',{...hapo,account_class:'personal_checking'}),false);
  assert.equal(verifyBankDestination('ach_credit',{...hapo,business_owner_verified:false}),false);
  assert.equal(verifyBankDestination('zelle',hapo),false);
  assert.equal(verifyBankDestination('zelle',{...hapo,business_zelle_enrollment_confirmed:true,bank_zelle_service_verified:true}),true);
});

test('SoFi personal accounts cannot be business payment destinations',()=>{
  const claimed={institution:'sofi',account_class:'personal_checking',business_owner_verified:true,
    receiving_account_verified:true,bank_ach_receiving_confirmed:true,business_zelle_enrollment_confirmed:true,
    bank_zelle_service_verified:true};
  assert.equal(verifyBankDestination('ach_credit',claimed),false);
  assert.equal(verifyBankDestination('zelle',claimed),false);
});

test('unknown, unverified and unclassified accounts always fail closed',()=>{
  assert.equal(verifyBankDestination('ach_credit',{}),false);
  assert.equal(verifyBankDestination('ach_credit',{...bluevine,receiving_account_verified:false}),false);
  assert.equal(verifyBankDestination('ach_credit',{...bluevine,bank_ach_receiving_confirmed:false}),false);
  assert.equal(verifyBankDestination('zelle',{institution:'unknown',business_zelle_enrollment_confirmed:true}),false);
});
