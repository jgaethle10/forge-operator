import {makeInfluenceAttributionLink} from './attribution-link.mjs';
import {INFLUENCE_SCHEMA} from './influence-lab.mjs';
import {assessInfluenceSabanBrowserReceipt} from './saban-browser-review.mjs';

const CANARY_SCHEMA='evercraft.chum.commerce-canary.v2';
const GRAPHICS_SCHEMA='evercraft.influence-lab.graphics-review-slate.v1';
const OFFER_PUBLIC_ID='audit-center-website-audit-machine-v1';
const CHANNELS=['linkedin','facebook','journal','tiktok'];
const HOOKS=Object.freeze({
  designer:{
    opening:'A website can look finished. That does not mean every visitor path feels easy.',
    proofSlot:'[Insert actual, rights-cleared website audit footage and its documented limitations.]',
  },
  human:{
    opening:'Show the work, not just the claim. What does a real public-page website review actually involve?',
    proofSlot:'[Insert a consent-cleared operator walkthrough, disclose their relationship with Evercraft, and cite real observations.]',
  },
  proof:{
    opening:'What can a website audit verify from the public side, and what cannot it establish?',
    proofSlot:'[Insert an authentic input-to-result screen recording with source references and limitations.]',
  },
});
const clean=value=>String(value??'').trim();
function inspectCanary(canary,at){
  const unknown={state:'unknown',sourceAuthentication:'not_established',
    externalHttpReceiptAccepted:false,checkoutCreated:false,
    providerSettlementVerified:false,fulfillmentVerified:false};
  if(!canary)return {...unknown,reason:'no_chum_canary_receipt_supplied'};
  if(canary.schema!==CANARY_SCHEMA)return {...unknown,reason:'chum_canary_schema_mismatch'};
  const time=Date.parse(canary.generated_at);
  const now=Date.parse(at);
  if(!Number.isFinite(time)||!Number.isFinite(now)||time>now+5*60*1000||now-time>24*3600*1000){
    return {...unknown,reason:'chum_canary_timestamp_missing_or_stale'};
  }
  if(canary.status!=='pass'||canary.route_state!=='owned_gateway_probed'||
      canary.base44_used!==false||canary.doctrine?.read_only!==true||
      canary.doctrine?.checkout_created!==false||canary.doctrine?.payment_attempted!==false){
    return {...unknown,reason:'chum_canary_held_or_not_read_only'};
  }
  const results=(Array.isArray(canary.results)?canary.results:[]).filter(x=>x?.public_id===OFFER_PUBLIC_ID);
  if(results.length!==1||results[0].valid!==true||
    results[0].offer_door_valid!==true||results[0].review_door_valid!==true||
    (results[0].buyer_required===true&&results[0].buyer_door_valid!==true)){
    return {...unknown,reason:'website_audit_route_not_readable_in_canary'};
  }
  return {...unknown,state:'canary_reports_readable',reason:'read_only_report_is_not_provider_authentication',
    sourceAuthentication:'unverified_input_canary_json',
    canaryGeneratedAt:new Date(time).toISOString(),publicOfferId:OFFER_PUBLIC_ID,
    externalHttpReceiptAccepted:false};
}

/**
 * Generates a REVIEW PACK only. In particular an asserted CHUM report, a URL,
 * and even a full creative plan can never attest to a paid or shipped order.
 * No media bytes, personal contact fields, cookies, or provider tokens appear.
 */
export function compileInfluenceDistributionReview({brief,slate,canaryReceipt=null,sabanReceipt=null,at}={}){
  if(brief?.schema!==INFLUENCE_SCHEMA||brief.releaseState!=='review_only'||!clean(brief.digest)){
    throw Error('influence_distribution_brief_invalid');
  }
  if(slate?.schema!==GRAPHICS_SCHEMA||slate.briefDigest!==brief.digest||
    slate.campaignId!==brief.campaignId||slate.publicationAuthority!==false){
    throw Error('influence_distribution_graphics_lineage_mismatch');
  }
  if(!Array.isArray(slate.treatments)||slate.treatments.length!==3){
    throw Error('influence_distribution_treatments_invalid');
  }
  if(!at||!Number.isFinite(Date.parse(at)))throw Error('influence_distribution_report_time_invalid');
  const canary=inspectCanary(canaryReceipt,at);
  const sabanBrowser=assessInfluenceSabanBrowserReceipt({receipt:sabanReceipt,at});
  const outputs=[];
  for(const creative of slate.treatments){
    const treatment=creative.key;
    const hook=HOOKS[treatment];
    if(!hook||creative.campaign?.offerUrl!==brief.offerUrl||
      creative.state!=='requires_distinct_renderer_and_real_media'||
      creative.publicationAuthority!==false||creative.plan?.publicationAuthority!==false){
      throw Error('influence_distribution_creative_mismatch');
    }
    for(const channel of CHANNELS){
      const assetId=treatment+'-feed-001';
      const link=makeInfluenceAttributionLink({
        offerUrl:brief.offerUrl,campaignId:brief.campaignId,assetId,channel,
      });
      const captionDraft=[hook.opening,hook.proofSlot,
        'Review the current offer before use: '+link.url].join('\n\n');
      outputs.push({treatment,channel,assetId,link:link.url,
        captionDraft,reviewState:'held',
        blockers:[
          'systemia_admission_not_proven',
          'real_media_and_licensed_rights_missing',
          'editorial_qa_and_creator_review_missing',
          'current_offer_checkout_and_fulfillment_not_independently_verified',
          'evercraft_clip_publication_authority_not_granted',
          ...(canary.state!=='canary_reports_readable'?[canary.reason]:[]),
          ...(sabanBrowser.state!=='untrusted_report_says_ui_visible'?[sabanBrowser.reason]:[]),
        ],
        providerPostId:null,providerPostUrl:null,
        reportedQualifiedVisits:null,verifiedOrders:null,
        netSettledRevenueCents:null,attributedIncrementalRevenueCents:null,
        contactAuthorized:false,publicationAuthority:false});
    }
  }
  const identities=new Set(outputs.map(x=>x.link));
  if(identities.size!==outputs.length)throw Error('influence_distribution_duplicate_attribution_url');
  return {schema:'evercraft.influence-lab.distribution-review.v1',
    campaignId:brief.campaignId,briefDigest:brief.digest,
    graphicsSlateDigest:slate.digest,generatedAt:new Date(Date.parse(at)).toISOString(),
    state:'review_only',canary,sabanBrowser,copyAndLinkDrafts:outputs,
    uniqueDrafts:outputs.length,
    buyerJourney:{publicRouteReadability:canary.state,qualifiedVisits:null,
      buyerIntents:null,createdCheckouts:null,independentlyVerifiedSettlements:null,
      deliveryReceipts:null,incrementalNetRevenueCents:null,
      note:'Click tags, source canary JSON and a readable buyer URL are never payment, delivery or incrementality evidence.'},
    boundaries:{systemiaAdmitted:false,boardroomQuorum:false,creativeMediaVerified:false,
      providerPaymentVerified:false,shippingVerified:false,editorialApproved:false,
      creatorContactAuthorized:false,evercraftClipPublished:false,
      productionReady:false,publicationAuthority:false},
  };
}
