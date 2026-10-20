import crypto from 'node:crypto';
import { preflightPublicLink } from './public-link-preflight.mjs';
import { assertEvercraftFamilySocialSafe } from './family-social-safety.mjs';

function hash(value){
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizedMetadata(metadata={}){
  return {
    message:String(metadata.message??'').trim(),
    link:String(metadata.link??'').trim(),
    title:String(metadata.title??'').trim(),
    campaign:String(metadata.campaign??'').trim(),
  };
}

function normalizedLinkVerification(value={}){
  return {
    expectedText:Array.isArray(value.expectedText)
      ?value.expectedText.map(item=>String(item??'').trim()).filter(Boolean)
      :[],
    expectedCanonicalUrl:String(value.expectedCanonicalUrl??'').trim(),
    expectedOgUrl:String(value.expectedOgUrl??'').trim(),
    expectedStoryId:String(value.expectedStoryId??'').trim(),
    requireCanonicalSelfMatch:value.requireCanonicalSelfMatch===true,
    requireOpenGraphSelfMatch:value.requireOpenGraphSelfMatch===true,
  };
}

function validateRequest(request){
  if(request?.schema!=='evercraft.clip.social-publish-request.v1') throw new Error('clip_social_publish_schema_invalid');
  if(!request.id?.trim()) throw new Error('clip_social_publish_id_missing');
  if(!request.destination?.trim()) throw new Error('clip_social_publish_destination_missing');
  if(!request.brandKey?.trim()) throw new Error('clip_social_publish_brand_key_missing');
  if(request.authorization?.approved!==true) throw new Error('clip_social_publish_authorization_missing');
  if(!request.authorization?.authorizationRef?.trim()) throw new Error('clip_social_publish_authorization_ref_missing');
  const metadata=normalizedMetadata(request.metadata);
  if(!metadata.message&&!metadata.link) throw new Error('clip_social_publish_content_missing');
  return {metadata,linkVerification:normalizedLinkVerification(request.linkVerification)};
}

function contentDigestFor(request,metadata,linkVerification){
  return hash(JSON.stringify({
    schema:'evercraft.clip.social-content.v2',
    destination:request.destination,
    brandKey:request.brandKey,
    metadata,
    linkVerification,
  }));
}

export async function publishClipSocialPost({request,adapters,policy}){
  const validated=validateRequest(request);
  let metadata=validated.metadata;
  // Evercraft corporate/first-party social publishing cannot carry adult or sexual
  // content or send users to adult pages. It fails before any provider call.
  assertEvercraftFamilySocialSafe(metadata);
  const linkVerification=validated.linkVerification;
  if(policy?.allowPublishing!==true) throw new Error('clip_social_publish_policy_disabled');

  const allowedDestinations=new Set(policy.allowedDestinations||[]);
  if(!allowedDestinations.has(request.destination)) throw new Error('clip_social_publish_policy_destination_blocked');

  const blockedBrands=new Set((policy.blockedBrandKeys||[]).map(value=>String(value).toLowerCase()));
  if(blockedBrands.has(request.brandKey.toLowerCase())) throw new Error('clip_social_publish_policy_brand_blocked');

  const adapter=(adapters||[]).find(item=>item.destination===request.destination&&item.verified===true);
  if(!adapter) throw new Error('clip_social_publish_verified_adapter_missing');

  const startedAt=new Date().toISOString();
  let contentDigest=contentDigestFor(request,metadata,linkVerification);
  let linkPreflight=null;

  try{
    if(metadata.link){
      const linkPolicy=policy?.publicLinkPreflight||{};
      linkPreflight=await preflightPublicLink({
        url:metadata.link,
        fetchImpl:linkPolicy.fetchImpl??globalThis.fetch,
        blockedHostSuffixes:linkPolicy.blockedHostSuffixes,
        expectedText:linkVerification.expectedText.length?linkVerification.expectedText:linkPolicy.expectedText,
        expectedCanonicalUrl:linkVerification.expectedCanonicalUrl||linkPolicy.expectedCanonicalUrl,
        expectedOgUrl:linkVerification.expectedOgUrl||linkPolicy.expectedOgUrl,
        expectedStoryId:linkVerification.expectedStoryId||linkPolicy.expectedStoryId,
        requireCanonicalSelfMatch:linkVerification.requireCanonicalSelfMatch||linkPolicy.requireCanonicalSelfMatch===true,
        requireOpenGraphSelfMatch:linkVerification.requireOpenGraphSelfMatch||linkPolicy.requireOpenGraphSelfMatch===true,
        maxRedirects:linkPolicy.maxRedirects,
        timeoutMs:linkPolicy.timeoutMs,
      });
      metadata={...metadata,link:linkPreflight.finalUrl};
      // A safe-looking short URL may redirect to an unsafe final destination.
      assertEvercraftFamilySocialSafe(metadata);
      contentDigest=contentDigestFor(request,metadata,linkVerification);
    }

    const result=await adapter.publish({
      requestId:request.id,
      metadata,
      brandKey:request.brandKey,
      authorizationRef:request.authorization.authorizationRef,
      contentDigest,
    });

    if(result?.state!=='published') throw new Error('clip_social_publish_adapter_not_published');
    if(!result.remoteId) throw new Error('clip_social_publish_remote_id_missing');
    if(!result.url) throw new Error('clip_social_publish_remote_url_missing');
    if(!Array.isArray(result.sourceRefs)||result.sourceRefs.length===0) throw new Error('clip_social_publish_provider_source_refs_missing');

    return {
      schema:'evercraft.clip.social-publish-receipt.v1',
      status:'published',
      requestId:request.id,
      destination:request.destination,
      brandKey:request.brandKey,
      contentDigest,
      remoteId:result.remoteId,
      url:result.url,
      providerRequestId:result.providerRequestId||result.remoteId,
      authorizationRef:request.authorization.authorizationRef,
      publicLinkPreflight:linkPreflight,
      linkVerification,
      sourceRefs:[
        'clip-social-content:'+contentDigest,
        ...(linkPreflight?['clip-public-link:'+linkPreflight.bodyFingerprint]:[]),
        ...result.sourceRefs,
      ],
      boundaries:{
        firstPartyClipRuntime:true,
        verifiedAdapterRequired:true,
        contentDigestBound:true,
        explicitAuthorizationRequired:true,
        providerReceiptRequired:true,
        publicationStateAssertedFromProviderResponse:true,
        publicLinkPreflightRequired:metadata.link?true:false,
        anonymousPublicLinkVerified:metadata.link?linkPreflight?.verified===true:false,
        legacyProviderPublicLinksBlocked:true,
        canonicalIdentityBound:Boolean(linkVerification.expectedCanonicalUrl||linkVerification.requireCanonicalSelfMatch),
        openGraphIdentityBound:Boolean(linkVerification.expectedOgUrl||linkVerification.requireOpenGraphSelfMatch),
        storyIdentityBound:Boolean(linkVerification.expectedStoryId),
      },
      startedAt,
      publishedAt:new Date().toISOString(),
    };
  }catch(error){
    return {
      schema:'evercraft.clip.social-publish-receipt.v1',
      status:'failed',
      requestId:request.id,
      destination:request.destination,
      brandKey:request.brandKey,
      contentDigest,
      authorizationRef:request.authorization.authorizationRef,
      publicLinkPreflight:linkPreflight,
      linkVerification,
      error:error instanceof Error?error.message:String(error),
      boundaries:{
        firstPartyClipRuntime:true,
        verifiedAdapterRequired:true,
        contentDigestBound:true,
        explicitAuthorizationRequired:true,
        providerReceiptRequired:true,
        publicationStateAssertedFromProviderResponse:false,
        publicLinkPreflightRequired:metadata.link?true:false,
        anonymousPublicLinkVerified:false,
        legacyProviderPublicLinksBlocked:true,
        canonicalIdentityBound:Boolean(linkVerification.expectedCanonicalUrl||linkVerification.requireCanonicalSelfMatch),
        openGraphIdentityBound:Boolean(linkVerification.expectedOgUrl||linkVerification.requireOpenGraphSelfMatch),
        storyIdentityBound:Boolean(linkVerification.expectedStoryId),
      },
      startedAt,
      failedAt:new Date().toISOString(),
    };
  }
}
