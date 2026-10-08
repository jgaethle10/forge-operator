import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEconomicPosition, buildEconomicWorkspace } from './economic-workspace.mjs';

test('external observed balance requires evidence and contributes to observed cash',()=>{
  const p=normalizeEconomicPosition({
    position_key:'cash-1',
    type:'external_balance_observation',
    currency:'usd',
    amount:1000,
    evidence_ref:'evidence://bank-balance',
    as_of:'2026-10-07'
  });
  assert.equal(p.evidence_state,'observed_external');
  assert.equal(p.contributes_to_observed_cash,true);
  assert.equal(p.custody_state,'no_evercraft_custody_claim');
});

test('receivable is projected money, not observed cash',()=>{
  const p=normalizeEconomicPosition({
    position_key:'recv-1',
    type:'evercraft_receivable',
    currency:'USD',
    amount:500,
    payment_order_ref:'evercraft-payment://order-1'
  });
  assert.equal(p.evidence_state,'expected_receivable');
  assert.equal(p.contributes_to_observed_cash,false);
  assert.equal(p.contributes_to_projected_cash,true);
});

test('planning bucket is not stored value',()=>{
  const p=normalizeEconomicPosition({
    position_key:'goal-1',
    type:'planning_bucket',
    currency:'USD',
    amount:300,
    target_ref:'goal://equipment'
  });
  assert.equal(p.evidence_state,'planning_only');
  assert.equal(p.contributes_to_observed_cash,false);
  assert.match(p.boundary,/do not represent/);
});

test('workspace preserves observed cash separately from projections',()=>{
  const workspace=buildEconomicWorkspace({
    workspaceKey:'workspace-1',
    entityKey:'business-1',
    positions:[
      {position_key:'cash',type:'external_balance_observation',currency:'USD',amount:1000,evidence_ref:'evidence://cash',as_of:'2026-10-07'},
      {position_key:'recv',type:'evercraft_receivable',currency:'USD',amount:500,payment_order_ref:'order://1'},
      {position_key:'pay',type:'evercraft_payable',currency:'USD',amount:200,obligation_ref:'obligation://1'},
      {position_key:'goal',type:'planning_bucket',currency:'USD',amount:900,target_ref:'goal://1'}
    ]
  });
  assert.equal(workspace.summary_by_currency.USD.observed_external_cash,1000);
  assert.equal(workspace.summary_by_currency.USD.expected_receivables,500);
  assert.equal(workspace.summary_by_currency.USD.expected_payables,200);
  assert.equal(workspace.summary_by_currency.USD.projected_after_known_receivables_and_payables,1300);
  assert.equal(workspace.custody_state,'no_evercraft_custody_claim');
});
