import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFinancialCapabilityMatrix, routeFinancialCapability } from './financial-capability-router.mjs';

const matrix=loadFinancialCapabilityMatrix();

test('Evercraft may own canonical payment orders without bank authority',()=>{
  const route=routeFinancialCapability({capabilityKey:'canonical_payment_order',matrix});
  assert.equal(route.allowed,true);
  assert.equal(route.route,'evercraft_payments');
  assert.ok(route.claims_allowed.includes('payment_order'));
});

test('insured deposit account fails closed without both authorities',()=>{
  const route=routeFinancialCapability({capabilityKey:'insured_deposit_account',matrix});
  assert.equal(route.allowed,false);
  assert.deepEqual(route.claims_allowed,[]);
  assert.ok(route.blockers.includes('regulated_authority_required'));
  assert.ok(route.blockers.includes('deposit_insurance_authority_required'));
});

test('regulated authority alone is insufficient for insured deposit claim',()=>{
  const route=routeFinancialCapability({
    capabilityKey:'insured_deposit_account',
    matrix,
    regulatedAuthority:'example-charter'
  });
  assert.equal(route.allowed,false);
  assert.ok(route.blockers.includes('deposit_insurance_authority_required'));
});

test('deposit capability can route only after required authority evidence is supplied',()=>{
  const route=routeFinancialCapability({
    capabilityKey:'insured_deposit_account',
    matrix,
    regulatedAuthority:'verified-charter-evidence-ref',
    depositInsuranceAuthority:'verified-insurance-evidence-ref'
  });
  assert.equal(route.allowed,true);
  assert.equal(route.route,'authorized_insured_depository_rail');
  assert.deepEqual(route.claims_allowed,['insured_deposit_account']);
});

test('financing discovery stays distinct from lending authority',()=>{
  const route=routeFinancialCapability({capabilityKey:'financing_discovery',matrix});
  assert.equal(route.allowed,true);
  assert.equal(route.route,'qualified_partner_discovery');
  assert.ok(!route.claims_allowed.includes('lend_as_principal'));
});
