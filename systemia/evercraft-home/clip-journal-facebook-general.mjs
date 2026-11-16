import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readJournalClipHandoff,normalizeJournalStorySlug} from './clip-journal-publish-adapter.mjs';
import {claimJournalPublish,completeJournalPublishClaim} from './clip-journal-claim.mjs';
import {buildJournalClipSocialPublishRequest} from '../newsroom/journal-clip-bridge.mjs';
import {publishClipSocialPost} from '../clip/social-publisher-runtime.mjs';
import {preflightPublicLink} from '../clip/public-link-preflight.mjs';
import {createFacebookPagePublisherAdapter} from '../clip/facebook-page-publisher.mjs';
import {resolveFacebookPageCredential} from '../clip/facebook-page-credential-resolver.mjs';

const clean=value=>String(value??'').trim();
const sha=value=>createHash('sha256').update(value).digest('hex');
const PAGE_ID=/^[1-9][0-9]{5,19}$/;

export function assertLiveJournalForFacebook({repoRoot,slug,handoff,now=new Date()}={}){
  const root=path.resolve(repoRoot,'public','journal');
  const safe=normalizeJournalStorySlug(slug);
  if(handoff?.schema!=='evercraft.clip.journal-handoff.v1' ||
      clean(handoff.slug)!==safe ||
      handoff.publication_authority!==false ||
      clean(handoff.publication_receipt_ref)!=='receipts/'+safe+'.json'){
    throw new Error('clip_facebook_general_handoff_invalid');
  }
  const receiptFile=path.join(root,'receipts',safe+'.json');
  const articleFile=path.join(root,safe,'index.html');
  if(!fs.existsSync(receiptFile)||!fs.existsSync(articleFile))
    throw new Error('clip_facebook_general_journal_receipt_missing');
  const receipt=JSON.parse(fs.readFileSync(receiptFile,'utf8'));
  const article=fs.readFileSync(articleFile,'utf8');
  if(receipt.schema!=='evercraft.journal.publication-receipt.v1' ||
      receipt.slug!==safe ||
      receipt.story_id!==clean(handoff.story_id) ||
      receipt.title!==clean(handoff.title) ||
      receipt.canonical_url!==clean(handoff.canonical_url) ||
      receipt.clip_handoff_ref!=='production/'+safe+'/clip-handoff.json' ||
      receipt.article_sha256!==sha(article) ||
      receipt.publication_authority!==true ||
      receipt.publication_state!=='live' ||
      receipt.live_edition_eligible!==true ||
      receipt.editorial_gate?.status!=='accepted' ||
      Number(receipt.editorial_gate?.score)!==10 ||
      receipt.production_grade?.status!=='accepted' ||
      receipt.production_grade?.text_primary===true ||
      !(Date.parse(receipt.freshness_expires_at)>new Date(now).getTime()))
    throw new Error('clip_facebook_general_journal_receipt_unverified');
  return receipt;
}

export async function publishGeneralJournalFacebookFromHome({
  repoRoot,slug,credentialStateDir,stateRoot,authorizationRef,
  expectedPageId,publisherEnabled=false,writePermissionVerified=false,
  fetchImpl=globalThis.fetch,
  resolveCredential=()=>resolveFacebookPageCredential({credentialStateDir}),
  adapterFactory=createFacebookPagePublisherAdapter,
}={}){
  const safe=normalizeJournalStorySlug(slug);
  if(!clean(authorizationRef).startsWith('passport-grant:') || clean(authorizationRef).length<20)
    throw new Error('clip_facebook_general_passport_grant_required');
  if(publisherEnabled!==true || writePermissionVerified!==true)
    throw new Error('clip_facebook_general_publisher_held');
  if(!PAGE_ID.test(clean(expectedPageId)))
    throw new Error('clip_facebook_general_page_allowlist_missing');
  if(!clean(stateRoot))throw new Error('clip_facebook_general_durable_state_required');
  if(!clean(credentialStateDir))
    throw new Error('clip_facebook_general_vault_not_configured');
  const {handoff}=readJournalClipHandoff(repoRoot,safe);
  if(clean(handoff.story_id).includes('cfb-power-rankings'))
    throw new Error('clip_facebook_general_specialist_story');
  assertLiveJournalForFacebook({repoRoot,slug:safe,handoff});

  const derivative=(handoff.derivatives||[]).find(d=>clean(d.platform).toLowerCase()==='facebook');
  const copy=clean(derivative?.copy);
  if(!copy)throw new Error('clip_facebook_general_derivative_missing');

  const credential=resolveCredential();
  if(credential?.safe_status?.facebook!=='resolved' ||
      clean(credential?.config?.pageId)!==clean(expectedPageId) ||
      !clean(credential?.config?.pageAccessToken))
    throw new Error('clip_facebook_general_credential_mismatch_or_missing');

  const request=buildJournalClipSocialPublishRequest({
    handoff,destination:'facebook-page',brandKey:'evercraft-journal',
    authorizationRef:clean(authorizationRef),message:copy,
    campaign:'evercraft-journal',requestId:'journal-facebook:'+safe,
  });
  // A dead or mismatched Journal URL must not consume the durable provider claim.
  await preflightPublicLink({
    url:request.metadata.link,fetchImpl,
    expectedText:request.linkVerification.expectedText,
    expectedCanonicalUrl:request.linkVerification.expectedCanonicalUrl,
    expectedOgUrl:request.linkVerification.expectedOgUrl,
    expectedStoryId:request.linkVerification.expectedStoryId,
    requireCanonicalSelfMatch:true,requireOpenGraphSelfMatch:true,
  });
  const claim=claimJournalPublish({repoRoot,stateRoot,slug:safe,handoff});
  if(claim.state==='duplicate_hold')return {
    schema:'evercraft.home.clip-journal-publish-receipt.v1',
    state:'duplicate_or_reconciliation_hold',slug:safe,
    story_id:clean(handoff.story_id),destination:'facebook-page',
    resource_ref:'journal-story:'+safe,
    provider_may_have_published:true,
    provider_remote_id:claim.prior_remote_id,
    provider_post_url:claim.prior_provider_post_url,
    manual_reconciliation_required:true,automatic_retry_allowed:false,
    secret_material_returned:false,
  };

  let receipt;
  try{
    const adapter=adapterFactory({
      ...credential.config,fetchImpl,allowPublish:true,verified:true,
    });
    receipt=await publishClipSocialPost({
      request,adapters:[adapter],
      policy:{
        allowPublishing:true,
        allowedDestinations:['facebook-page'],
        blockedBrandKeys:['rnb-chicken-and-soul'],
        publicLinkPreflight:{fetchImpl},
      }
    });
    if(receipt.status==='published'){
      try{
        await preflightPublicLink({
          url:request.metadata.link,fetchImpl,
          expectedText:request.linkVerification.expectedText,
          expectedCanonicalUrl:request.linkVerification.expectedCanonicalUrl,
          expectedOgUrl:request.linkVerification.expectedOgUrl,
          expectedStoryId:request.linkVerification.expectedStoryId,
          requireCanonicalSelfMatch:true,requireOpenGraphSelfMatch:true,
        });
      }catch{
        receipt={...receipt,status:'published_postflight_failed'};
      }
    }
  }catch{
    receipt={status:'reconciliation_required',providerMayHavePublished:true,
      error:'provider_attempt_unresolved'};
  }
  const record=completeJournalPublishClaim({claim,receipt});
  return {
    schema:'evercraft.home.clip-journal-publish-receipt.v1',
    state:receipt.status,
    slug:safe,story_id:clean(handoff.story_id),
    resource_ref:'journal-story:'+safe,destination:'facebook-page',
    canonical_url:clean(handoff.canonical_url),
    provider_post_url:['published','published_postflight_failed'].includes(receipt.status)
      ?clean(receipt.url)||null:null,
    provider_remote_id:clean(receipt.remoteId)||null,
    provider_may_have_published:true,
    manual_reconciliation_required:receipt.status!=='published',
    automatic_retry_allowed:false,
    durable_claim_recorded:Boolean(record),
    authorization_ref:clean(authorizationRef),
    secret_material_returned:false,
    error:clean(receipt.error)||null,
  };
}
