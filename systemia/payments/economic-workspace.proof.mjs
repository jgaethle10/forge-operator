import assert from 'node:assert/strict';
import { buildEconomicWorkspace } from './economic-workspace.mjs';

const workspace=buildEconomicWorkspace({
  workspaceKey:'proof-workspace',
  entityKey:'proof-entity',
  positions:[
    {position_key:'cash',type:'external_balance_observation',currency:'USD',amount:800,evidence_ref:'evidence://observed-cash',as_of:'2026-10-07'},
    {position_key:'receivable',type:'evercraft_receivable',currency:'USD',amount:500,payment_order_ref:'evercraft-payment://proof-order'},
    {position_key:'payable',type:'evercraft_payable',currency:'USD',amount:125,obligation_ref:'obligation://proof'},
    {position_key:'equipment-goal',type:'planning_bucket',currency:'USD',amount:1500,target_ref:'goal://equipment'}
  ]
});

assert.equal(workspace.summary_by_currency.USD.observed_external_cash,800);
assert.equal(workspace.summary_by_currency.USD.projected_after_known_receivables_and_payables,1175);
assert.equal(workspace.positions.find(x=>x.type==='planning_bucket').contributes_to_observed_cash,false);

process.stdout.write(JSON.stringify({
  schema:'evercraft.financial.economic-workspace-proof.v1',
  observed_external_cash:workspace.summary_by_currency.USD.observed_external_cash,
  expected_receivables:workspace.summary_by_currency.USD.expected_receivables,
  expected_payables:workspace.summary_by_currency.USD.expected_payables,
  projected_after_known_receivables_and_payables:workspace.summary_by_currency.USD.projected_after_known_receivables_and_payables,
  planning_bucket_amount:workspace.positions.find(x=>x.type==='planning_bucket').amount,
  planning_bucket_counted_as_cash:false,
  custody_state:workspace.custody_state,
  boundary:workspace.boundary
},null,2)+'\n');
