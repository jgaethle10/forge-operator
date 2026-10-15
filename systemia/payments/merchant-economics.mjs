// Advisory merchant economics only. NEVER takes payments, creates invoices, or contacts customers.
const nonnegativeInteger = n => Number.isSafeInteger(n) && n >= 0;
const percentOk = n => Number.isFinite(n) && n >= 0 && n <= 100;
export function assessMerchantPaymentEconomics({
 transaction_cents, transactions_per_month, provider_percent, provider_fixed_cents,
 platform_percent=0, platform_fixed_cents=0, monthly_processor_account_cents=0,
 monthly_payout_fees_cents=0, monthly_operating_cost_cents=0,
 target_competitor_percent=2.9,target_competitor_fixed_cents=30,cost_model_verified=false,
}={}){
 const values={transaction_cents,transactions_per_month,provider_percent,provider_fixed_cents,
 platform_percent,platform_fixed_cents,monthly_processor_account_cents,monthly_payout_fees_cents,
 monthly_operating_cost_cents,target_competitor_percent,target_competitor_fixed_cents};
 const errors=[];
 for(const key of ['transaction_cents','transactions_per_month','provider_fixed_cents',
 'platform_fixed_cents','monthly_processor_account_cents','monthly_payout_fees_cents',
 'monthly_operating_cost_cents','target_competitor_fixed_cents']){
  if(!nonnegativeInteger(values[key])) errors.push('invalid_'+key);
 }
 for(const key of ['provider_percent','platform_percent','target_competitor_percent']){
  if(!percentOk(values[key])) errors.push('invalid_'+key);
 }
 if(!nonnegativeInteger(transactions_per_month)||transactions_per_month===0) errors.push('no_monthly_volume');
 if(!nonnegativeInteger(transaction_cents)||transaction_cents===0) errors.push('zero_transaction_amount');
 if(typeof cost_model_verified!=='boolean') errors.push('invalid_verification_flag');
 if(errors.length) return {ok:false,errors,decision:'HOLD',can_advertise_lower_cost:false};
 const provider_cost_cents=Math.ceil(transaction_cents*provider_percent/100)+provider_fixed_cents;
 const merchant_price_cents=Math.ceil(transaction_cents*platform_percent/100)+platform_fixed_cents;
 const allocated_monthly_costs_cents=Math.ceil((monthly_processor_account_cents+monthly_payout_fees_cents+monthly_operating_cost_cents)/transactions_per_month);
 const actual_total_cost_cents=provider_cost_cents+allocated_monthly_costs_cents;
 const gross_margin_cents=merchant_price_cents-actual_total_cost_cents;
 const competitor_reference_cents=Math.ceil(transaction_cents*target_competitor_percent/100)+target_competitor_fixed_cents;
 const nominally_below_reference=merchant_price_cents<competitor_reference_cents;
 const positive_unit_margin=gross_margin_cents>0;
 if(![provider_cost_cents,merchant_price_cents,allocated_monthly_costs_cents,actual_total_cost_cents,competitor_reference_cents].every(Number.isSafeInteger)) return {ok:false,errors:['cost_overflow'],decision:'HOLD',can_advertise_lower_cost:false};
 const qualified=Boolean(cost_model_verified&&nominally_below_reference&&positive_unit_margin);
 return {ok:true,schema:'evercraft.payments.merchant-economics.advisory.v1',
  advisory_only:true,no_payment_or_external_action:true,
  assumptions:{transaction_cents,transactions_per_month,cost_model_verified},
  fee_breakdown_cents:{provider_cost_cents,allocated_monthly_costs_cents,actual_total_cost_cents,merchant_price_cents,competitor_reference_cents,gross_margin_cents},
  nominally_below_reference,positive_unit_margin,can_advertise_lower_cost:qualified,
  decision:qualified?'CANDIDATE_REQUIRES_MERCHANT_AND_LEGAL_APPROVAL':'HOLD',
  caveat:'Illustrative card-only arithmetic. The verified-cost flag must refer to independently substantiated contract pricing. Not a quote, merchant agreement, or legal determination.'};
}
export function assessMerchantGrowthOpportunity({
 opted_in=false,problem,evidence_ref,incremental_revenue_cents,agreed_baseline_ref,
 approved_scope=false,customer_contact_authorized=false,share_terms_agreed=false,
 outcome_verified=false,actual_outcome_receipt_ref,
}={}){
 const valid=opted_in===true&&approved_scope===true&&typeof problem==='string'&&problem.trim().length>=10&&
  typeof evidence_ref==='string'&&evidence_ref.trim().length>=5;
 const proposed_attributable=valid&&typeof agreed_baseline_ref==='string'&&agreed_baseline_ref.trim().length>=5&&
  nonnegativeInteger(incremental_revenue_cents)&&incremental_revenue_cents>0;
 const revenue_share_eligible=proposed_attributable&&share_terms_agreed===true&&outcome_verified===true&&
  typeof actual_outcome_receipt_ref==='string'&&actual_outcome_receipt_ref.trim().length>=5;
 return {schema:'evercraft.payments.merchant-growth-opportunity.v1',candidate_only:valid,
  proposal_ready:proposed_attributable,revenue_share_eligible,
  proposed_attributable_increment_cents:proposed_attributable?incremental_revenue_cents:null,
  contact_allowed:valid&&customer_contact_authorized===true,
  external_action_taken:false,payment_created:false,
  next_step:!opted_in?'HOLD_NO_MERCHANT_OPT_IN':!valid?'HOLD_INSUFFICIENT_EVIDENCE':!proposed_attributable?
   'REVIEW_AND_SET_SIMPLE_BASELINE':!revenue_share_eligible?'HUMAN_REVIEW_TERMS_AND_VERIFY_ACTUAL_OUTCOME':
   'REVIEW_VERIFIED_INCREMENT_AND_INVOICE_AUTHORITY',
  notice:'A recommendation does not authorize outreach, execution or invoice. Actual increase, attribution, agreed terms and separate merchant invoice approval are mandatory.'};
}
