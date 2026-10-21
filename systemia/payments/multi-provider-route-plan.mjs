/**
 * Read-only, merchant-permissioned route planner for Evercraft Payments.
 * No checkout, merchant onboarding, payment, provider API request or money movement.
 * Provider families are candidates only; actual merchant connections require verification.
 */
export const PROVIDER_FAMILIES=Object.freeze({
 stripe:Object.freeze({label:'Stripe',research_methods:['card','ach']}),
 moov:Object.freeze({label:'Moov',research_methods:['card','ach']}),
 finix:Object.freeze({label:'Finix',research_methods:['card']}),
 adyen:Object.freeze({label:'Adyen',research_methods:['card']}),
});
const FEE_KEYS=Object.freeze(['processing_fee_cents','payout_fee_cents','platform_fee_cents','allocated_fixed_fee_cents','other_known_fee_cents']);
const money=n=>Number.isSafeInteger(n)&&n>=0;
const truth=x=>x===true;
const clean=(s,len=180)=>typeof s==='string'?s.trim().slice(0,len):'';
const validDate=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));

export function planMerchantPaymentRoute({
 merchant_id,merchant_opted_in=false,merchant_scope_approved=false,amount_cents,
 country='US',currency='USD',method='card',connections=[],quotes=[],now=new Date().toISOString(),
}={}){
 const base={schema:'evercraft.payments.multi-provider-route-plan.v1',
  commerce_layer:'evercraft_payments',settlement_router:'raven_nexus',
  selected_provider_for_execution:null,intent_or_charge_created:false,funds_moved:false,
  payment_authorized:false,requires_human_confirmation:true,recommendation_only:true};
 const merchant=clean(merchant_id,120);
 if(!merchant||!truth(merchant_opted_in)||!truth(merchant_scope_approved))
  return {...base,status:'HELD',reason:'merchant_permission_missing',candidates:[]};
 if(!money(amount_cents)||amount_cents===0||!validDate(now))
  return {...base,status:'HELD',reason:'invalid_amount_or_time',candidates:[]};
 if(country!=='US'||currency!=='USD'||!['card','ach'].includes(method))
  return {...base,status:'HELD',reason:'pilot_country_currency_or_method_unsupported',candidates:[]};
 if(!Array.isArray(connections)||!Array.isArray(quotes))
  return {...base,status:'HELD',reason:'invalid_inputs',candidates:[]};
 const connectedById=new Map();
 for(const connection of connections){
  if(!connection||!Object.hasOwn(PROVIDER_FAMILIES,connection.provider_id)) continue;
  if(connection.merchant_id!==merchant||connection.status!=='approved'||!truth(connection.compliance_approved)||
     !truth(connection.credentials_verified)||!Array.isArray(connection.enabled_methods)||
     !connection.enabled_methods.includes(method)) continue;
  connectedById.set(connection.provider_id,connection);
 }
 const candidates=[];
 for(const quote of quotes){
  if(!quote||!Object.hasOwn(PROVIDER_FAMILIES,quote.provider_id)) continue;
  if(quote.merchant_id!==merchant||quote.method!==method||quote.country!==country||
     quote.currency!==currency||!connectedById.has(quote.provider_id)) continue;
  if(!PROVIDER_FAMILIES[quote.provider_id].research_methods.includes(method)) continue;
  if(!truth(quote.provider_terms_approved)||!truth(quote.cost_verified)||
     quote.amount_cents!==amount_cents||!clean(quote.cost_evidence_ref)||
     !validDate(quote.verified_at)||!validDate(quote.expires_at)||
     Date.parse(quote.verified_at)>Date.parse(now)||
     Date.parse(quote.expires_at)<=Date.parse(now)) continue;
  if(!FEE_KEYS.every(key=>money(quote[key]))) continue;
  const total_fee_cents=FEE_KEYS.reduce((total,key)=>total+quote[key],0);
  if(!Number.isSafeInteger(total_fee_cents)) continue;
  candidates.push({
   provider_id:quote.provider_id,payment_method:method,
   total_estimated_cost_cents:total_fee_cents,cost_evidence_ref:clean(quote.cost_evidence_ref),
   quote_expires_at:quote.expires_at,no_transaction_authority:true,
  });
 }
 candidates.sort((a,b)=>a.total_estimated_cost_cents-b.total_estimated_cost_cents||
   a.provider_id.localeCompare(b.provider_id));
 if(!candidates.length)
  return {...base,status:'HELD',reason:'no_verified_approved_provider_quote',candidates:[]};
 return {...base,status:'CANDIDATE_FOR_MERCHANT_REVIEW',reason:'priced_candidates_exist',
  candidates,cheapest_candidate_provider_id:candidates[0].provider_id,
  notice:'This is advisory only. Provider/merchant agreement, purchase-specific authorization, buyer consent and current provider availability are separate execution gates.'};
}
