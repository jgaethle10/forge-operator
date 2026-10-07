import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EVERCRAFT_FINANCIAL_STATES,
  classifyFinancialCapability,
  buildFinancialRoute
} from './financial-boundary.mjs';

test('payments may operate without implying bank status',()=>{
  const result=classifyFinancialCapability({
    state:EVERCRAFT_FINANCIAL_STATES.PAYMENTS,
    claims:[]
  });
  assert.equal(result.ok,true);
});

test('bank claim fails closed before charter authority exists',()=>{
  const result=classifyFinancialCapability({
    state:EVERCRAFT_FINANCIAL_STATES.CHARTER_FEASIBILITY,
    claims:['bank','accept_deposits']
  });
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>x.includes('chartered_depository')));
});

test('insured deposit claim requires both charter and insurance authority',()=>{
  const result=classifyFinancialCapability({
    state:EVERCRAFT_FINANCIAL_STATES.CHARTERED_DEPOSITORY,
    claims:['bank','insured_deposit'],
    charterAuthority:'example-charter'
  });
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>x.includes('insurance authority')));
});

test('charter-required capability routes to a blocked regulated boundary',()=>{
  const route=buildFinancialRoute({capability:'consumer_deposit_account',requiresCharter:true});
  assert.equal(route.direct_execution_allowed,false);
  assert.equal(route.execution_state,'blocked_pending_charter_or_authorized_partner');
});
