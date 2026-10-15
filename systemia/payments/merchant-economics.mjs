// Advisory unit economics for Evercraft Payments merchant pricing.
// No checkout, quote issuance, payment, ledger write, or merchant outreach.
const finite=(n)=>Number.isFinite(n);
const validMoney=(n)=>finite(n)&&n>=0;
const nonnegativeInteger=(n)=>Number.isSafeInteger(n)&&n>=0;

export function assessMerchantPaymentEconomics({
  transaction_cents,
  transactions_per_month,
  provider_percent,
  provider_fixed_cents,
  platform_percent=0,
  platform_fixed_cents=0,
  monthly_processor_account_cents=0,
  monthly_payout_fees_cents=0,
  monthly_operating_cost_cents=0,
  target_competitor_percent=2.9,
  target_competitor_fixed_cents=30,
  cost_model_verified=false,
}={}){
  const errors=[];
  for(const key of ['transaction_cents','transactions_per_month','provider_fixed_cents','platform_fixed_cents','monthly_processor_account_cents','monthly_payout_fees_cents','monthly_operating_cost_cents','target_competitor_fixed_cents']){
    if(!nonnegativeInteger(arguments[0]?.[key] ?? (['platform_fixed_cents','monthly_processor_account_cents','monthly_payout_fees_cents','monthly_operating_cost_cents'].includes(key)?0:NaN))) errors.push('invalid_'+key);
  }
  for(const key of ['provider_percent','platform_percent','target_competitor_percent']){
    const val=arguments[0]?.[key] ?? (key==='platform_percent'?0:key==='target_competitor_percent'?2.9:NaN);
    if(!validMoney(val)||val>100) errors.push('invalid_'+key);
  }
  if(!nonnegativeInteger(transactions_per_month)||transactions_per_month===0) errors.push('no_monthly_volume');
  if(!nonnegativeInteger(transaction_cents)||transaction_cents===0) errors.push('zero_transaction_amount');
  if(typeof cost_model_verified!=='boolean') errors.push('invalid_verification_flag');
  if(errors.length) return {ok:false,errors,decision:'HOLD',can_advertise_lower_cost:false};
  const provider_cost_cents=Math.ceil(transaction_cents*provider_percent/100)+provider_fixed_cents;
  const merchant_price_cents=Math.ceil(transaction_cents*platform_percent/100)+platform_fixed_cents;
  const allocated_monthly_costs_cents=Math.ceil(
    (monthly_processor_account_cents+monthly_payout_fees_cents+monthly_operating_cost_cents)/transactions_per_month
  );
  const actual_total_cost_cents=provider_cost_cents+allocated_monthly_costs_cents;
  const gross_margin_cents=merchant_price_cents-actual_total_cost_cents;
  const competitor_reference_cents=Math.ceil(transaction_cents*target_competitor_percent/100)+target_competitor_fixed_cents;
  const nominally_below_reference=merchant_price_cents<competitor_reference_cents;
  const positive_unit_margin=gross_margin_cents>0;
  return {
    ok:true,
    schema:'evercraft.payments.merchant-economics.advisory.v1',
    advisory_only:true,
    no_payment_or_external_action:true,
    assumptions:{transaction_cents,transactions_per_month,cost_model_verified},
    fee_breakdown_cents:{provider_cost_cents,allocated_monthly_costs_cents,actual_total_cost_cents,merchant_price_cents,competitor_reference_cents,gross_margin_cents},
    nominally_below_reference,
    positive_unit_margin,
    can_advertise_lower_cost:Boolean(cost_model_verified&&nominally_below_reference&&positive_unit_margin),
    decision:cost_model_verified&&nominally_below_reference&&positive_unit_margin?'CANDIDATE_REQUIRES_MERCHANT_AND_LEGAL_APPROVAL':'HOLD',
    caveat:'Illustrative domestic card-only arithmetic; no provider-contract validation, refunds, fraud, taxes, chargeback reserves, risk premiums, volume tiering, interchange variations or regulatory determination. Verify effective rates and complete costs before any public comparison.'
  };
}

export function assessMerchantGrowthOpportunity({
  opted_in=false,
  problem,
  evidence_ref,
  incremental_revenue_cents,
  agreed_baseline_ref,
  approved_scope=false,
  customer_contact_authorized=false,
}={}){
  const valid=opted_in===true&&approved_scope===true&&
    typeof problem==='string'&&problem.trim().length>=10&&
    typeof evidence_ref==='string'&&evidence_ref.trim().length>=5;
  const attributable=valid&&typeof agreed_baseline_ref==='string'&&agreed_baseline_ref.trim().length>=5&&
    nonnegativeInteger(incremental_revenue_cents)&&incremental_revenue_cents>0;
  return {
    schema:'evercraft.payments.merchant-growth-opportunity.v1',
    candidate_only:valid,
    revenue_share_eligible:attributable,
    proposed_attributable_increment_cents:attributable?incremental_revenue_cents:null,
    contact_allowed:valid&&customer_contact_authorized===true,
    external_action_taken:false,
    payment_created:false,
    next_step:!opted_in?'HOLD_NO_MERCHANT_OPT_IN':!valid?'HOLD_INSUFFICIENT_EVIDENCE':!attributable?'REVIEW_AND_SET_SIMPLE_BASELINE':'HUMAN_REVIEW_TERMS_AND_ATTRIBUTION',
    notice:'Observing an opportunity never authorizes outreach, system changes, checkout, or revenue-share collection. Merchant must approve scope and terms; actual increment must be verified after delivery.'
  };
}
