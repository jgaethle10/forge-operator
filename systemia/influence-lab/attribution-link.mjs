const ORIGIN='https://fabric.systemiacommandcenters.com';
const CHANNELS=new Set(['facebook','instagram','linkedin','tiktok','youtube','journal','community','eventwave']);
const KEY=/^[a-z0-9][a-z0-9._-]{2,79}$/;
const safeToken=(value,name)=>{
  if(typeof value!=='string'||!KEY.test(value))throw new Error('influence_attribution_'+name+'_invalid');
  return value;
};
export function makeInfluenceAttributionLink({offerUrl,campaignId,assetId,channel,partnerCode=null}={}){
  if(typeof offerUrl!=='string')throw new Error('influence_attribution_url_invalid');
  let url;try{url=new URL(offerUrl);}catch{throw new Error('influence_attribution_url_invalid')}
  if(url.origin!==ORIGIN||!url.pathname.startsWith('/offers/')||url.username||url.password||url.hash){
    throw new Error('influence_attribution_untrusted_destination');
  }
  if(!url.pathname.match(/^\/offers\/[a-z0-9-]+\/?$/))throw new Error('influence_attribution_offer_path_invalid');
  // Existing checkout / order identifiers are never passed into a public campaign URL.
  const forbidden=['session_id','order_id','token','checkout','payment_intent','client_secret'];
  if(forbidden.some(key=>url.searchParams.has(key)))throw new Error('influence_attribution_sensitive_query_denied');
  const campaign=safeToken(campaignId,'campaign_id');
  const asset=safeToken(assetId,'asset_id');
  if(!CHANNELS.has(channel))throw new Error('influence_attribution_channel_invalid');
  if(partnerCode!==null) safeToken(partnerCode,'partner_code');
  const params=new URLSearchParams();
  params.set('utm_source',channel);
  params.set('utm_medium',partnerCode===null?'owned_content':'disclosed_creator');
  params.set('utm_campaign',campaign);
  params.set('utm_content',asset);
  if(partnerCode!==null)params.set('ref',partnerCode);
  url.search=params.toString();
  return {schema:'evercraft.influence-lab.attribution-preview.v1',
    url:url.toString(),campaignId:campaign,assetId:asset,channel,
    partnerCode,privacyModel:'no_personal_identifiers_or_cross_site_tracking',
    attributionState:'link_tagging_only',creatorRelationshipDisclosureVerified:false,
    visitObserved:false,orderCreated:false,settlementVerified:false,
    incrementalityVerified:false,publishingAuthorized:false};
}
export function reconcileTaggedVisit({link,visit}={}){
  if(link?.schema!=='evercraft.influence-lab.attribution-preview.v1')throw new Error('influence_attribution_link_invalid');
  if(!visit||visit?.campaignId!==link.campaignId||visit?.assetId!==link.assetId||
      visit?.channel!==link.channel||visit?.partnerCode!==link.partnerCode){
    throw new Error('influence_attribution_visit_provenance_mismatch');
  }
  if(!visit?.eventId||!visit?.sourceRef)throw new Error('influence_attribution_visit_receipt_missing');
  return {schema:'evercraft.influence-lab.tagged-visit-report.v1',
    campaignId:link.campaignId,assetId:link.assetId,channel:link.channel,
    eventId:String(visit.eventId),sourceRef:String(visit.sourceRef),
    state:'unverified_source_observation',
    humanVisitorConfirmed:false,incrementalVisitConfirmed:false,
    attributionWindowVerified:false,settlementVerified:false,incrementalRevenueVerified:false,
    publishingAuthorized:false};
}
