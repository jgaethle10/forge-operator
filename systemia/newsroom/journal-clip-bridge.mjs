function clean(value){ return String(value??'').trim(); }

export function buildJournalClipSocialPublishRequest({
  handoff,
  destination,
  brandKey='evercraft-journal',
  authorizationRef,
  message,
  campaign='evercraft-journal',
  requestId,
}={}){
  if(handoff?.schema!=='evercraft.clip.journal-handoff.v1') throw new Error('journal_clip_handoff_schema_invalid');
  if(!clean(handoff.story_id)||!clean(handoff.title)) throw new Error('journal_clip_handoff_identity_missing');
  if(!clean(handoff.canonical_url)) throw new Error('journal_clip_canonical_url_missing');
  if(!handoff.link_verification||typeof handoff.link_verification!=='object'){
    throw new Error('journal_clip_link_verification_missing');
  }
  if(!clean(destination)) throw new Error('journal_clip_destination_required');
  if(!clean(brandKey)) throw new Error('journal_clip_brand_key_required');
  if(!clean(authorizationRef)) throw new Error('journal_clip_authorization_ref_required');
  if(!clean(message)) throw new Error('journal_clip_message_required');

  const linkVerification={
    expectedText:Array.isArray(handoff.link_verification.expectedText)
      ?handoff.link_verification.expectedText.map(clean).filter(Boolean)
      :[handoff.title],
    expectedCanonicalUrl:clean(handoff.link_verification.expectedCanonicalUrl)||clean(handoff.canonical_url),
    expectedOgUrl:clean(handoff.link_verification.expectedOgUrl)||clean(handoff.canonical_url),
    expectedStoryId:clean(handoff.link_verification.expectedStoryId)||clean(handoff.story_id),
    requireCanonicalSelfMatch:handoff.link_verification.requireCanonicalSelfMatch!==false,
    requireOpenGraphSelfMatch:handoff.link_verification.requireOpenGraphSelfMatch!==false,
  };

  if(linkVerification.expectedCanonicalUrl!==clean(handoff.canonical_url)){
    throw new Error('journal_clip_canonical_contract_mismatch');
  }
  if(linkVerification.expectedOgUrl!==clean(handoff.canonical_url)){
    throw new Error('journal_clip_og_contract_mismatch');
  }
  if(linkVerification.expectedStoryId!==clean(handoff.story_id)){
    throw new Error('journal_clip_story_contract_mismatch');
  }

  return {
    schema:'evercraft.clip.social-publish-request.v1',
    id:clean(requestId)||`journal:${clean(handoff.story_id)}:${clean(destination)}`,
    destination:clean(destination),
    brandKey:clean(brandKey),
    authorization:{
      approved:true,
      authorizationRef:clean(authorizationRef),
    },
    metadata:{
      title:clean(handoff.title),
      message:clean(message),
      link:clean(handoff.canonical_url),
      campaign:clean(campaign),
    },
    linkVerification,
    lineage:{
      story_id:clean(handoff.story_id),
      canonical_url:clean(handoff.canonical_url),
      publication_receipt_ref:clean(handoff.publication_receipt_ref)||null,
      source_refs:Array.isArray(handoff.source_refs)?handoff.source_refs.map(clean).filter(Boolean):[],
    },
  };
}
