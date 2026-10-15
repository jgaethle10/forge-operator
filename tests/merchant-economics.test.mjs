import test from 'node:test';
import assert from 'node:assert/strict';
import { assessMerchantPaymentEconomics, assessMerchantGrowthOpportunity } from '../systemia/payments/merchant-economics.mjs';

test('rejects missing costs, zero volume and invalid numeric terms',()=>{
  assert.equal(assessMerchantPaymentEconomics({}).decision,'HOLD');
  assert.equal(assessMerchantPaymentEconomics({transaction_cents:1000,transactions_per_month:0,provider_percent:2.9,provider_fixed_cents:30}).ok,false);
  assert.equal(assessMerchantPaymentEconomics({transaction_cents:1000,transactions_per_month:20,provider_percent:-2,provider_fixed_cents:30}).ok,false);
});
test('cannot advertise undercut before supplier costs are independently verified',()=>{
  const result=assessMerchantPaymentEconomics({transaction_cents:10000,transactions_per_month:100,provider_percent:1.8,provider_fixed_cents:10,platform_percent:2.5,platform_fixed_cents:20,cost_model_verified:false});
  assert.equal(result.ok,true);
  assert.equal(result.can_advertise_lower_cost,false);
  assert.equal(result.decision,'HOLD');
});
test('cannot advertise lower cost at zero or negative margin',()=>{
  const r=assessMerchantPaymentEconomics({transaction_cents:10000,transactions_per_month:10,provider_percent:2.9,provider_fixed_cents:30,platform_percent:2.5,platform_fixed_cents:20,monthly_operating_cost_cents:1000,cost_model_verified:true});
  assert.equal(r.positive_unit_margin,false);
  assert.equal(r.can_advertise_lower_cost,false);
});
test('candidate still requires contract and human approval',()=>{
  const r=assessMerchantPaymentEconomics({transaction_cents:10000,transactions_per_month:100,provider_percent:1.8,provider_fixed_cents:10,platform_percent:2.5,platform_fixed_cents:20,cost_model_verified:true});
  assert.equal(r.can_advertise_lower_cost,true);
  assert.equal(r.decision,'CANDIDATE_REQUIRES_MERCHANT_AND_LEGAL_APPROVAL');
});
test('growth scout respects opt-in and does not infer revenue share from a lead',()=>{
  const base={problem:'Unanswered qualified customer inquiries',evidence_ref:'merchant:crm:2026-10',incremental_revenue_cents:50000,agreed_baseline_ref:'2026-09-sales-baseline',approved_scope:true};
  assert.equal(assessMerchantGrowthOpportunity({...base,opted_in:false}).revenue_share_eligible,false);
  assert.equal(assessMerchantGrowthOpportunity({...base,opted_in:true,agreed_baseline_ref:''}).revenue_share_eligible,false);
  const r=assessMerchantGrowthOpportunity({...base,opted_in:true});
  assert.equal(r.revenue_share_eligible,true);
  assert.equal(r.contact_allowed,false);
  assert.equal(r.external_action_taken,false);
  assert.equal(r.payment_created,false);
});
