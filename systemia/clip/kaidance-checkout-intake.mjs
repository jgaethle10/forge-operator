// Source-grounded Clip queue intake for Kaidance's checkout heartbeat.
// This can IDENTIFY intended commercial offers in existing Evercraft Clip
// campaigns but cannot turn a draft or source "approved" boolean into a
// trusted publication permit or current Stripe provider evidence.
import {createHash} from 'node:crypto';
const hash=s=>'sha256:'+createHash('sha256').update(String(s)).digest('hex').slice(0,24);
const key=v=>typeof v==='string'&&/^[a-zA-Z0-9._:-]{2,128}$/.test(v);
export function inspectClipCheckoutCampaign({queue,catalog,now=new Date()}={}){
 if(queue?.schema!=='evercraft.marketing.owner-review-queue.v1'||
  !Array.isArray(queue.entries)||!key(queue.campaign_id)||
  queue.entries.length>250)throw Error('clip_checkout_source_queue_invalid');
 if(!Array.isArray(catalog))throw Error('clip_checkout_catalog_missing');
 const byLegacy=new Map(catalog.filter(x=>x.source_kind==='legacy_source_requires_live_recheck')
  .map(x=>[x.slug,x]));
 const bySlug=new Map(catalog.map(x=>[x.slug,x]));
 const seen=new Set(),rows=[];
 for(const item of queue.entries){
  if(!key(item?.id)||seen.has(item.id))throw Error('clip_checkout_source_duplicate_entry');
  seen.add(item.id);
  const keys=Array.isArray(item.sku_keys)?item.sku_keys.filter(key):[];
  const candidates=[...new Set(keys)].map(k=>byLegacy.get(k)||bySlug.get(k)).filter(Boolean);
  let canonicalSlug=null;
  try{
   const url=new URL(item.canonical_offer_url);
   if(url.protocol==='https:'&&!url.username&&!url.password)
    canonicalSlug=url.pathname.split('/').filter(Boolean).pop()||null;
  }catch{}
  const selected=candidates.length===1?candidates[0]:
   candidates.filter(c=>c.slug===canonicalSlug).length===1
    ?candidates.find(c=>c.slug===canonicalSlug):null;
  const reason=!keys.length?'no_declared_sku':
   candidates.length!==keys.length?'sku_not_in_exact_offer_catalog':
   !selected?'ambiguous_primary_offer':
   item.authorization?.approved!==true||!item.authorization?.authorizationRef
    ?'publisher_permit_not_source_verified':
    'source_authorization_asserted_requires_private_verification';
  rows.push({entry_ref:hash(queue.campaign_id+'|'+item.id),entry_id:item.id,
   campaign_id:queue.campaign_id,
   placement_key:item.destination||item.platform||null,
   declared_skus:keys,selected_offer_key:selected?.offer_key||null,
   selected_merchant:selected?.merchant||null,
   listed_price_cents:selected?.amount_cents??null,
   selected_offer_route:selected?.slug||null,
   review_state:reason,
   existing_publication_permit_authenticated:false,
   provider_stripe_link_rechecked:false,
   provider_checkout_url_disclosed:false,
   publication_scheduled_by_this_intake:false,
   next_action:selected?'verify_exact_link_and_existing_publisher_permit':'resolve_exact_offer_selection'});
 }
 return {schema:'evercraft.kaidance.clip-checkout-intake.v1',
  observed_at:new Date(now).toISOString(),source_campaign_id:queue.campaign_id,
  source_entries:rows.length,selected_exact_source_offers:rows.filter(x=>x.selected_offer_key).length,
  rows,verified_publishing_authority:false,stripe_mutations:0,published_posts:0,
  note:'An existing Clip draft queue identifies offers and placements, not a provider-verified current campaign or publish permit.'};
}
// Prepare a *new draft*, not an approved provider call. Changing a post's link
// changes its content digest and requires existing Clip publisher to reverify the
// complete final message under the actual account authorization.
export function draftClipRequestWithCheckout({request,placement}={}){
 if(request?.schema!=='evercraft.clip.social-publish-request.v1'||!key(request.id)||
  !key(request.destination)||!key(request.brandKey))throw Error('clip_checkout_publish_request_invalid');
 if(!placement||placement.sku_and_price_verified!==true||
  placement.account_identity_verified!==true||
  placement.recommended_status!=='eligible_for_separate_clip_publish_gate'||
  !key(placement.offer_key)||typeof placement.provider_checkout_url!=='string')
  throw Error('clip_checkout_provider_placement_unverified');
 if(request.checkout_offer?.offer_key!==placement.offer_key||
  request.checkout_offer?.merchant!==placement.merchant||
  request.checkout_offer?.amount_cents!==placement.amount_cents)
  throw Error('clip_checkout_content_offer_mismatch');
 const original=request.metadata||{};
 if(original.link&&original.link!==placement.provider_checkout_url)
  throw Error('clip_checkout_existing_link_requires_copy_review');
 if(/https?:\/\//.test(String(original.message||''))&&
  !String(original.message).includes(placement.provider_checkout_url))
  throw Error('clip_checkout_message_embedded_url_requires_copy_review');
 if(!/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/.test(placement.provider_checkout_url))
  throw Error('clip_checkout_payment_host_invalid');
 return {...request,
  id:request.id+':checkout-draft',
  authorization:{approved:false,authorizationRef:null},
  metadata:{...original,link:placement.provider_checkout_url},
  checkout_offer:{...request.checkout_offer,
   checkout_proof_ref:placement.checkout_proof_ref,
   link_state:'exact_provider_checkout_candidate_requires_clip_publish_gate'},
  preflight_state:'requires_fresh_content_digest_and_existing_private_clip_permit'};
}
