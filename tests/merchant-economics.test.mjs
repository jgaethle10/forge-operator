import test from 'node:test';
import assert from 'node:assert/strict';
import { assessMerchantPaymentEconomics, assessMerchantGrowthOpportunity } from '../systemia/payments/merchant-economics.mjs';

test('rejects missing costs, zero volume and invalid terms',()=>{
 assert.equal(assessMerchantPaymentEconomics({}).decision,'HOLD');
 assert.equal(assessMerchantPaymentEconomics({transaction_cents:1000,transactions_per_month:0,provider_percent:2.9,provider_fixed_cents:30}).ok,false);
 assert.equal(assessMerchantPaymentEconomics({transaction_cents:1000,transactions_per_month:20,provider_percent:-2,provider_fixed_cents:30}).ok,false);
});
test('cannot advertise a lower rate without independently verified supplier costs',()=>{
 const r=assessMerchantPaymentEconomics({transaction_cents:10000,transactions_per_month:100,provider_percent:1.8,provider_fixed_cents:10,platform_percent:2.5,platform_fixed_cents:20,cost_model_verified:false});
 assert.equal(r.ok,true);assert.equal(r.can_advertise_lower_cost,false);assert.equal(r.decision,'HOLD');
});
test('holds a loss-making price even when the headline fee is lower',()=>{
 const r=assessMerchantPaymentEconomics({transaction_cents:10000,transactions_per_month:10,provider_percent:2.9,provider_fixed_cents:30,platform_percent:2.5,platform_fixed_cents:20,monthly_operating_cost_cents:1000,cost_model_verified:true});
 assert.equal(r.positive_unit_margin,false);assert.equal(r.can_advertise_lower_cost,false);
});
test('verified favorable arithmetic remains conditional on contract and legal approval',()=>{
 const r=assessMerchantPaymentEconomics({transaction_cents:10000,transactions_per_month:100,provider_percent:1.8,provider_fixed_cents:10,platform_percent:2.5,platform_fixed_cents:20,cost_model_verified:true});
 assert.equal(r.can_advertise_lower_cost,true);
 assert.equal(r.decision,'CANDIDATE_REQUIRES_MERCHANT_AND_LEGAL_APPROVAL');
});
test('no revenue share for prospecting or modeled growth alone',()=>{
 const base={problem:'Unanswered qualified customer inquiries',evidence_ref:'merchant:crm:2026-10',incremental_revenue_cents:50000,agreed_baseline_ref:'2026-09-sales-baseline',approved_scope:true};
 assert.equal(assessMerchantGrowthOpportunity({...base,opted_in:false}).revenue_share_eligible,false);
 assert.equal(assessMerchantGrowthOpportunity({...base,opted_in:true,agreed_baseline_ref:''}).proposal_ready,false);
 const proposal=assessMerchantGrowthOpportunity({...base,opted_in:true});
 assert.equal(proposal.proposal_ready,true);assert.equal(proposal.revenue_share_eligible,false);
 assert.equal(proposal.contact_allowed,false);assert.equal(proposal.external_action_taken,false);
 assert.equal(proposal.payment_created,false);
});
test('requires agreed terms, observed outcome and independent receipt for revenue share eligibility',()=>{
 const base={opted_in:true,problem:'Unanswered qualified customer inquiries',evidence_ref:'merchant:crm:2026-10',incremental_revenue_cents:50000,agreed_baseline_ref:'2026-09-sales-baseline',approved_scope:true,share_terms_agreed:true,outcome_verified:true};
 assert.equal(assessMerchantGrowthOpportunity({...base}).revenue_share_eligible,false);
 assert.equal(assessMerchantGrowthOpportunity({...base,actual_outcome_receipt_ref:'actual:2026-11'}).revenue_share_eligible,true);
 assert.equal(assessMerchantGrowthOpportunity({...base,share_terms_agreed:false,actual_outcome_receipt_ref:'actual:2026-11'}).revenue_share_eligible,false);
});
