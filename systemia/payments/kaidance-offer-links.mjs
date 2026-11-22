// Provider-bound offer-to-checkout reconciliation for the KAIDANCE company heartbeat.
// Pure planning only: does not create links, change prices, publish posts or take payments.
import {createHash} from 'node:crypto';
const KEY=/^[a-zA-Z0-9._:-]{3,128}$/;
const sha=v=>'sha256:'+createHash('sha256').update(String(v)).digest('hex');
const httpsStripe=u=>{try{const x=new URL(u);return x.protocol==='https:'&&x.hostname==='buy.stripe.com'&&!x.username&&!x.password&&!x.search&&!x.hash&&x.pathname.length>2}catch{return false}};
const isRetired=u=>/base44(?:\\.|%2e)(?:app|com|ai)/i.test(String(u||''));
const safeTime=(value,now,maxMs)=>{const n=Date.parse(value);return Number.isFinite(n)&&n<=now+60000&&n>=now-maxMs};
export function listHeartbeatOffers(config,legacy=null){
 if(config?.schema!=='evercraft.payments.heartbeat-offer-bindings.v1'||!Array.isArray(config.offers))throw Error('offer_binding_schema_invalid');
 const merchants=config.merchant_accounts||{},items=[],seen=new Set();
 for(const [alias,m] of Object.entries(merchants)){
  if(!/^[a-z][a-z0-9-]{2,50}$/.test(alias)||!/^acct_[A-Za-z0-9]+$/.test(m.stripe_account_id)||m.livemode!==true)throw Error('merchant_pin_invalid');
 }
 for(const row of config.offers){
  if(!KEY.test(row.offer_key)||seen.has(row.offer_key)||!merchants[row.merchant]||
   !Number.isSafeInteger(row.amount_cents)||row.amount_cents<=0||row.currency!=='usd'||
   !/^plink_[A-Za-z0-9]+$/.test(row.payment_link_id)||!/^price_[A-Za-z0-9]+$/.test(row.price_id)||
   !/^prod_[A-Za-z0-9]+$/.test(row.product_id)||
   !httpsStripe(row.checkout_url))throw Error('exact_offer_binding_invalid');
  seen.add(row.offer_key);items.push({...row,source_kind:'live_verified_binding'});
 }
 if(legacy){
  if(legacy.schema!=='evercraft.payments.existing-provider-links.v1'||legacy.current_processor_account!=='Systemia'||!Array.isArray(legacy.links))throw Error('legacy_catalog_invalid');
  for(const row of legacy.links){
   if(row.commercial_state!=='sell_now_original_sku'||row.public_promotion_allowed!==true||row.checkout_ready!==true)continue;
   const offer_key='legacy-systemia:'+row.key;
   if(!KEY.test(offer_key)||seen.has(offer_key)||!Number.isSafeInteger(row.amount_cents)||row.amount_cents<=0||
    !httpsStripe(row.url)||!/^plink_[A-Za-z0-9]+$/.test(row.payment_link_id)||
    !/^price_[A-Za-z0-9]+$/.test(row.stripe_price_id)||!/^prod_[A-Za-z0-9]+$/.test(row.stripe_product_id))throw Error('legacy_exact_sku_invalid');
   seen.add(offer_key);
   items.push({offer_key,slug:row.key,name:row.name,merchant:'systemia',
    amount_cents:row.amount_cents,currency:'usd',payment_link_id:row.payment_link_id,
    price_id:row.stripe_price_id,product_id:row.stripe_product_id,checkout_url:row.url,
    scope_confirmation_required:true,source_kind:'legacy_source_requires_live_recheck'});
  }
 }
 return items;
}
function validateProviderReadbacks(provider,merchants,now,expiryMs){
 if(provider?.schema!=='evercraft.payments.stripe-link-readback.v1'||!Array.isArray(provider.accounts))return new Map();
 const map=new Map();
 for(const account of provider.accounts){
  const pin=merchants[account.merchant];
  if(!pin||account.account_id!==pin.stripe_account_id||account.livemode!==true||
   account.source!=='stripe_api_authenticated_read'||account.complete!==true||
   !safeTime(account.observed_at,now,expiryMs)||map.has(account.merchant))continue;
  if(!Array.isArray(account.links))continue;
  const ids=new Set();let valid=true;
  for(const l of account.links){if(!/^plink_[A-Za-z0-9]+$/.test(l.id)||ids.has(l.id)){valid=false;break}ids.add(l.id);}
  if(valid)map.set(account.merchant,account);
 }
 return map;
}
function matchLink(offer,account){
 if(!account)return {state:'hold_stripe_readback_unavailable',provider_link:null};
 const l=account.links.find(x=>x.id===offer.payment_link_id);
 if(!l)return {state:'missing_pinned_payment_link',provider_link:null};
 if(l.active!==true)return {state:'hold_payment_link_inactive',provider_link:l};
 if(l.after_completion?.type!=='hosted_confirmation'||isRetired(JSON.stringify(l.after_completion)))
  return {state:'hold_redirect_not_attested',provider_link:l};
 if(!httpsStripe(l.url)||l.url!==offer.checkout_url)return {state:'hold_checkout_url_mismatch',provider_link:l};
 if(l.line_items_complete!==true||!Array.isArray(l.line_items)||l.line_items.length!==1)return {state:'hold_line_items_incomplete',provider_link:l};
 const item=l.line_items[0];
 if(item.price_id!==offer.price_id||item.product_id!==offer.product_id||
  item.currency!==offer.currency||item.unit_amount!==offer.amount_cents||item.quantity!==1||
  item.type!=='one_time')return {state:'hold_exact_price_or_sku_mismatch',provider_link:l};
 return {state:'exact_live_checkout_verified',provider_link:l};
}
export function reconcileKaidanceOfferLinks({
 bindings,legacy=null,promotions=null,provider=null,now=new Date()
}={}){
 const offers=listHeartbeatOffers(bindings,legacy),at=new Date(now),nowMs=at.getTime();
 if(!Number.isFinite(nowMs))throw Error('invalid_checkout_heartbeat_clock');
 const snap=validateProviderReadbacks(provider,bindings.merchant_accounts,nowMs,
  (bindings.rules?.provider_readback_max_seconds||600)*1000);
 const incoming=promotions?.schema==='evercraft.clip.verified-offer-beat.v1'&&
  Array.isArray(promotions.offers)&&safeTime(promotions.observed_at,nowMs,
   (bindings.rules?.promotion_max_seconds||900)*1000)?promotions.offers:[];
 const known=new Map(offers.map(x=>[x.offer_key,x]));
 const seen=new Set(),placements=[],holds=[],actions=[];
 for(const event of incoming.slice(0,200)){
  const offerKey=String(event?.offer_key||''), placementKey=String(event?.placement_key||'');
  if(!KEY.test(offerKey)||!KEY.test(placementKey))continue;
  const dedupeKey=sha(offerKey+'|'+placementKey+'|'+String(event.campaign_id||''));
  if(seen.has(dedupeKey))continue;seen.add(dedupeKey);
  const offer=known.get(offerKey);
  if(!offer){holds.push({offer_key:offerKey,placement_key:placementKey,reason:'offer_not_in_exact_price_registry'});actions.push({dedupe_key:dedupeKey,offer_key:offerKey,action:'admit_exact_price_sku',authority:'review_required'});continue;}
  if(event.promotion_state!=='ready_for_publisher_verification'||event.offer_amount_cents!==offer.amount_cents||
   event.currency!==offer.currency||event.merchant!==offer.merchant){
   holds.push({offer_key:offerKey,placement_key:placementKey,reason:'promotion_contract_mismatch_or_not_ready'});continue;
  }
  const result=matchLink(offer,snap.get(offer.merchant));
  if(result.state!=='exact_live_checkout_verified'){
   holds.push({offer_key:offerKey,placement_key:placementKey,reason:result.state});
   if(result.state==='missing_pinned_payment_link'||result.state==='hold_payment_link_inactive')
    actions.push({dedupe_key:dedupeKey,offer_key:offerKey,action:'reconcile_or_create_exact_sku_link',authority:'existing_stripe_adapter_and_signed_scope_required'});
   continue;
  }
  placements.push({offer_key:offerKey,placement_key:placementKey,campaign_id:String(event.campaign_id||''),
   merchant:offer.merchant,amount_cents:offer.amount_cents,currency:offer.currency,
   provider_checkout_url:result.provider_link.url,
   account_identity_verified:true,sku_and_price_verified:true,
   recommended_status:'eligible_for_separate_clip_publish_gate',
   published_by_this_cycle:false,payment_received_verified:false,
   scope_confirmation_required:offer.scope_confirmation_required===true,
   publisher_authorization_from_this_receipt:false,
   checkout_proof_ref:sha(offer.merchant+'|'+offer.payment_link_id+'|'+snap.get(offer.merchant).observed_at)});
 }
 return {schema:'evercraft.kaidance.offer-checkout-heartbeat.v1',observed_at:at.toISOString(),
  requested_offers:incoming.length,known_exact_price_offers:offers.length,
  accounts_fresh_and_pinned:snap.size,placements,holds,actions,
  clip_publications_executed:0,stripe_mutations_executed:0,new_links_created:0,
  payment_received_verified:false,all_external_effects_require_existing_authority:true,
  contract_note:'Provider readback authorizes link matching only. A claimed Clip promotion does not itself establish publisher permission; downstream Clip must independently verify its signed publish permit.'};
}
