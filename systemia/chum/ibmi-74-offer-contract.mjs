export const DEADLINE_KEY='ibmi_74_deadline_xray_250';
export const DEADLINE_AMOUNT_CENTS=25000;

/**
 * Checks ONLY the published tier listing returned by the authenticated owner gateway.
 * Does not verify checkout success, provider settlement, merchant currency configuration,
 * customer eligibility, or report fulfillment.
 */
export function checkIBMi74TierListing(liveTiers){
 if(!Array.isArray(liveTiers))return {ready:false,reason:'live_tiers_missing',offer_key:DEADLINE_KEY,checkout_verified:false,payment_verified:false};
 const candidates=liveTiers.filter(t=>t?.offer_key===DEADLINE_KEY);
 if(!candidates.length)return {ready:false,reason:'deadline_tier_not_listed',offer_key:DEADLINE_KEY,checkout_verified:false,payment_verified:false};
 if(candidates.length!==1)return {ready:false,reason:'ambiguous_deadline_tier',offer_key:DEADLINE_KEY,checkout_verified:false,payment_verified:false};
 if(!Number.isInteger(Number(candidates[0]?.amount_cents))||Number(candidates[0].amount_cents)!==DEADLINE_AMOUNT_CENTS){
  return {ready:false,reason:'deadline_tier_price_mismatch',offer_key:DEADLINE_KEY,checkout_verified:false,payment_verified:false};
 }
 const currency=String(candidates[0].currency||'').toLowerCase();
 if(currency&&currency!=='usd')return {ready:false,reason:'deadline_currency_mismatch',offer_key:DEADLINE_KEY,checkout_verified:false,payment_verified:false};
 return {ready:true,reason:'owned_catalog_lists_exact_tier_only',offer_key:DEADLINE_KEY,amount_cents:DEADLINE_AMOUNT_CENTS,currency:currency||'not_returned',checkout_verified:false,payment_verified:false};
}
