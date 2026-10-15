/**
 * Systemia permissioned growth scout. Aggregate merchant data only.
 * Read-only. No outreach, financial changes, customer-data exports or charges.
 */
const count=n=>Number.isSafeInteger(n)&&n>=0;
const clean=s=>typeof s==='string'?s.trim().slice(0,180):'';
const time=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
const allowed=(permissions,s)=>Array.isArray(permissions)&&permissions.includes(s);

export function scanMerchantRevenueOpportunities({
 merchant_id,opted_in=false,approved_scopes=[],metrics={},evidence_ref,observed_at,
 now=new Date().toISOString(),
}={}){
 const base={schema:'evercraft.systemia.merchant-opportunity-scan.v1',read_only:true,
  customer_data_exported:false,communications_sent:false,payment_created:false,
  merchant_configuration_changed:false,agent_execution_authority:false,
  recommendations:[],revenue_share_claimed_cents:0,measured_increment_cents:null};
 if(!clean(merchant_id)||opted_in!==true)
  return {...base,status:'HELD',reason:'merchant_opt_in_required'};
 if(!clean(evidence_ref)||!time(observed_at)||!time(now))
  return {...base,status:'HELD',reason:'source_evidence_or_time_invalid'};
 const age=Date.parse(now)-Date.parse(observed_at);
 if(age<0||age>7*86400000) return {...base,status:'HELD',reason:'source_evidence_stale'};
 const allKeys=['unfollowed_approved_quotes','repeat_customers_without_plan','failed_checkouts','completed_jobs_uninvoiced'];
 for(const key of allKeys){
  if(Object.hasOwn(metrics,key)&&!count(metrics[key]))
   return {...base,status:'HELD',reason:'invalid_aggregate_count'};
 }
 const recommendations=[];
 const add=(kind,n,why,review)=>recommendations.push({
  kind,source_ref:clean(evidence_ref),observed_count:n,
  evidence_state:'merchant_supplied_aggregate_unverified',
  attribution_state:'not_measured',financial_outcome:'unknown',
  baseline_required:true,merchant_approval_required:true,
  outbound_customer_contact_authorized:false,why,next_human_review:review,
 });
 if(allowed(approved_scopes,'quotes:read_aggregates')&&metrics.unfollowed_approved_quotes>=3)
  add('quote_followup_gap',metrics.unfollowed_approved_quotes,
   'At least three approved quotes lack a recorded follow-up.',
   'Validate status and consent before offering follow-up workflows.');
 if(allowed(approved_scopes,'bookings:read_aggregates')&&metrics.repeat_customers_without_plan>=5)
  add('subscription_fit_review',metrics.repeat_customers_without_plan,
   'At least five repeat customers have no recurring-service plan.',
   'Review suitability, margin and customer opt-in subscription terms.');
 if(allowed(approved_scopes,'checkout:read_aggregates')&&metrics.failed_checkouts>=5)
  add('checkout_recovery_review',metrics.failed_checkouts,
   'At least five recorded checkout failures warrant operational diagnosis.',
   'Review gateway errors, provider events and customer consent.');
 if(allowed(approved_scopes,'invoices:read_aggregates')&&metrics.completed_jobs_uninvoiced>=1)
  add('unbilled_work_review',metrics.completed_jobs_uninvoiced,
   'At least one completed job is recorded without an invoice.',
   'Reconcile work against authorized billing; do not auto-invoice.');
 return {...base,status:'ADVISORY_ONLY',
  reason:recommendations.length?'candidates_for_review':'no_signal_over_threshold',
  recommendations,source_ref:clean(evidence_ref),observed_at,
  notice:'Unverified merchant-supplied aggregate data. Forecasts are not earned revenue. Systemia admission, tenant consent, source verification, attribution baseline and human action approval remain separate.'};
}
