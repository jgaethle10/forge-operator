// First-party, GET-only account-wide Stripe inventory for KAIDANCE.
// Inventory is NOT an offer catalog and DOES NOT give permission to use an old
// checkout URL. Unpinned / retired / Managed Payments links stay quarantined.
import {createHash} from 'node:crypto';
import {privateKeyFile,stripeGet} from './kaidance-stripe-readonly.mjs';
const HASH=value=>'sha256:'+createHash('sha256').update(value).digest('hex').slice(0,24);
const validId=value=>typeof value==='string'&&/^plink_[A-Za-z0-9]+$/.test(value);
const retiredHost=raw=>/base44(?:\.|%2e)(?:app|com|ai)/i.test(String(raw||''));
const validStripeUrl=raw=>{try{const u=new URL(raw);return u.protocol==='https:'&&
 ['buy.stripe.com','book.stripe.com','donate.stripe.com'].includes(u.hostname)&&
 !u.username&&!u.password&&u.port===''&&!u.search&&!u.hash;}catch{return false}};
export async function discoverKaidanceStripeInventory({
 bindings,credentialPaths={},repoRoot='',fetchFn=fetch,now=new Date(),
 maxPages=12,maxLinks=1000
}={}){
 if(bindings?.schema!=='evercraft.payments.heartbeat-offer-bindings.v1')
  throw Error('kaidance_inventory_binding_schema_required');
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>15||
    !Number.isInteger(maxLinks)||maxLinks<1||maxLinks>1500)
  throw Error('kaidance_inventory_budget_invalid');
 const at=new Date(now);
 if(!Number.isFinite(at.getTime()))throw Error('kaidance_inventory_clock_invalid');
 const accounts=[];let totalObserved=0,totalActive=0,autoTaxEnabled=0,autoTaxDisabled=0;
 let noTaxHosted=0,managedPaymentsTaxLocked=0,redirectHold=0;
 for(const [merchant,pin] of Object.entries(bindings.merchant_accounts||{})){
  const summary={merchant,provider_account_pinned:true,promotion_allowed:pin.offer_promotion_allowed===true,
   state:'not_connected_to_owned_runtime',complete:false,observed:0,active:0,inactive:0,
   automatic_tax_enabled_active:0,automatic_tax_disabled_active:0,automatic_tax_unknown_active:0,
   managed_payments_enabled_active:0,no_auto_tax_hosted_candidates:0,redirect_or_retired_holds:0,
   link_refs:[],merchant_account_id_exposed:false,raw_checkout_urls_exposed:false};
  accounts.push(summary);
  if(!credentialPaths[merchant])continue;
  try{
   const key=privateKeyFile(credentialPaths[merchant],repoRoot);
   const identity=await stripeGet('/v1/account',key,fetchFn);
   if(identity?.id!==pin.stripe_account_id||pin.livemode!==true){summary.state='merchant_identity_mismatch_hold';continue;}
   let cursor='',done=false;const ids=new Set(),scanned=[];
   for(let page=0;page<maxPages;page++){
    const query='/v1/payment_links?limit=100'+(cursor?'&starting_after='+encodeURIComponent(cursor):'');
    const batch=await stripeGet(query,key,fetchFn);
    if(!Array.isArray(batch.data)||typeof batch.has_more!=='boolean')throw Error('incomplete_provider_pagination');
    for(const link of batch.data){
     if(!validId(link?.id)||ids.has(link.id))throw Error('duplicate_or_invalid_provider_link');
     ids.add(link.id);
     if(ids.size>maxLinks)throw Error('provider_link_inventory_budget_exceeded');
     scanned.push(link);
    }
    if(!batch.has_more){done=true;break;}
    if(!batch.data.length)throw Error('provider_pagination_cursor_missing');
    cursor=batch.data[batch.data.length-1].id;
   }
   if(!done)throw Error('provider_pagination_unfinished');
   summary.complete=true;summary.state='complete_authenticated_read_only';
   summary.observed=scanned.length;
   for(const link of scanned){
    if(link.active===true){
     summary.active++;
     if(link.automatic_tax?.enabled===true)summary.automatic_tax_enabled_active++;
     else if(link.automatic_tax?.enabled===false)summary.automatic_tax_disabled_active++;
     else summary.automatic_tax_unknown_active++;
     if(link.managed_payments?.enabled===true)summary.managed_payments_enabled_active++;
     const redirect=link.after_completion?.type!=='hosted_confirmation'||
      retiredHost(JSON.stringify(link.after_completion||null))||!validStripeUrl(link.url);
     if(redirect)summary.redirect_or_retired_holds++;
     if(link.automatic_tax?.enabled===false&&link.managed_payments?.enabled===false&&!redirect){
      summary.no_auto_tax_hosted_candidates++;
     }
    }else if(link.active===false)summary.inactive++;
    else throw Error('link_active_state_unknown');
   }
   // Compact hashed references give reconciliation visibility without
   // uploading the provider's full live URL catalog or any private metadata.
   summary.link_refs=scanned.slice(0,Math.min(scanned.length,250)).map(link=>({
    ref:HASH(pin.stripe_account_id+'|'+link.id),active:link.active,
    automatic_tax_enabled:link.automatic_tax?.enabled??null,
    managed_payments_enabled:link.managed_payments?.enabled??null,
    hosted_confirmation:link.after_completion?.type==='hosted_confirmation',
    routable_from_inventory:false
   }));
   totalObserved+=summary.observed;totalActive+=summary.active;
   autoTaxEnabled+=summary.automatic_tax_enabled_active;
   autoTaxDisabled+=summary.automatic_tax_disabled_active;
   noTaxHosted+=summary.no_auto_tax_hosted_candidates;
   managedPaymentsTaxLocked+=summary.managed_payments_enabled_active;
   redirectHold+=summary.redirect_or_retired_holds;
  }catch{
   summary.state='provider_read_failed_hold';
   summary.complete=false;summary.observed=0;summary.active=0;summary.inactive=0;
   summary.link_refs=[];
   summary.automatic_tax_enabled_active=0;summary.automatic_tax_disabled_active=0;
   summary.automatic_tax_unknown_active=0;summary.managed_payments_enabled_active=0;
   summary.no_auto_tax_hosted_candidates=0;summary.redirect_or_retired_holds=0;
  }
 }
 const fullyObserved=accounts.length>0&&accounts.every(a=>a.complete);
 return {schema:'evercraft.kaidance.stripe-portfolio-inventory.v1',observed_at:at.toISOString(),
  account_slots:accounts.length,accounts_observed:accounts.filter(a=>a.complete).length,
  full_merchant_coverage_verified:fullyObserved,
  observed_links_from_complete_accounts:totalObserved,
  active_links_from_complete_accounts:totalActive,
  active_auto_tax_on_from_complete_accounts:autoTaxEnabled,
  active_auto_tax_off_from_complete_accounts:autoTaxDisabled,
  active_managed_payments_from_complete_accounts:managedPaymentsTaxLocked,
  no_auto_tax_hosted_candidates_from_complete_accounts:noTaxHosted,
  active_redirect_or_retired_holds_from_complete_accounts:redirectHold,
  accounts,checkout_urls_returned:false,unmapped_links_may_not_be_promoted:true,
  tax_liabilities_not_determined:true,stripe_mutations_executed:0,payments_inferred:0,
  note:'No-automatic-tax hosted candidates are an inventory subset only. Exact offer, live price, delivery scope and publisher authority require separate checks.'};
}
