import fs from 'node:fs';
import path from 'node:path';
import { publishCfbJournalToFacebook } from '../newsroom/cfb-clip-facebook-publish.mjs';
import { resolveFacebookPageCredential } from '../clip/facebook-page-credential-resolver.mjs';
import {claimJournalPublish,completeJournalPublishClaim} from './clip-journal-claim.mjs';

function clean(value){ return String(value??'').trim(); }

export function normalizeJournalStorySlug(value){
  const slug=clean(value);
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){
    throw new Error('home_clip_journal_slug_invalid');
  }
  return slug;
}

export function journalStoryResourceRef(slug){
  return 'journal-story:'+normalizeJournalStorySlug(slug);
}

export function journalClipHandoffPath(repoRoot,slug){
  const safeSlug=normalizeJournalStorySlug(slug);
  const journalRoot=path.resolve(repoRoot,'public','journal','production');
  const target=path.resolve(journalRoot,safeSlug,'clip-handoff.json');
  if(!target.startsWith(journalRoot+path.sep)) throw new Error('home_clip_journal_path_escape_blocked');
  return target;
}

export function readJournalClipHandoff(repoRoot,slug){
  const file=journalClipHandoffPath(repoRoot,slug);
  if(!fs.existsSync(file)) throw new Error('home_clip_journal_handoff_missing');
  const handoff=JSON.parse(fs.readFileSync(file,'utf8'));
  if(handoff?.schema!=='evercraft.clip.journal-handoff.v1'){
    throw new Error('home_clip_journal_handoff_schema_invalid');
  }
  if(clean(handoff.slug)!==normalizeJournalStorySlug(slug)){
    throw new Error('home_clip_journal_handoff_slug_mismatch');
  }
  return {file,handoff};
}

export async function publishJournalStoryFacebookFromHome({
  repoRoot,
  slug,
  credentialStateDir,
  stateRoot=process.env.EVERCRAFT_CLIP_JOURNAL_STATE_DIR||'',
  authorizationRef,
  fetchImpl=globalThis.fetch,
  publisher=publishCfbJournalToFacebook,
  resolveCredential=()=>resolveFacebookPageCredential({credentialStateDir}),
}={}){
  const resourceRef=journalStoryResourceRef(slug);
  const {file,handoff}=readJournalClipHandoff(repoRoot,slug);
  if(!clean(credentialStateDir)) throw new Error('home_clip_credential_vault_not_configured');

  // Validate the legacy CFB-specific handoff and current sealed Page credential
  // *before* consuming the write-once claim. These local failures cannot create
  // a provider post, so they must remain safely correctable without manual hold.
  if(handoff.schema!=='evercraft.clip.journal-handoff.v1' ||
     !clean(handoff.story_id).includes('cfb-power-rankings') ||
     handoff.publication_authority!==false ||
     !clean((handoff.derivatives||[]).find(row=>clean(row?.platform).toLowerCase()==='facebook')?.copy))
    throw new Error('home_clip_cfb_publish_preflight_failed');
  const credential=resolveCredential();
  if(credential?.safe_status?.facebook!=='resolved' ||
     !clean(credential?.config?.pageId) || !clean(credential?.config?.pageAccessToken))
    throw new Error('home_clip_facebook_credential_not_ready');

  const claim=claimJournalPublish({repoRoot,stateRoot,slug:normalizeJournalStorySlug(slug),handoff});
  if(claim.state==='duplicate_hold') return {
    schema:'evercraft.home.clip-journal-publish-receipt.v1',
    state:'duplicate_or_reconciliation_hold',
    slug:normalizeJournalStorySlug(slug),story_id:clean(handoff.story_id),
    resource_ref:resourceRef,destination:'facebook-page',
    provider_remote_id:claim.prior_remote_id,
    provider_post_url:claim.prior_provider_post_url,
    previous_state:claim.prior_state,
    provider_may_have_published:true,
    manual_reconciliation_required:true,
    automatic_retry_allowed:false,
    secret_material_returned:false,
  };
  let receipt;
  try{
    receipt=await publisher({
      handoff,
      authorizationRef:clean(authorizationRef)||'policy:evercraft-journal-autopublish-v1',
      fetchImpl,
      resolveCredential:()=>credential,
    });
  }catch{
    // A provider timeout can occur after its POST. Never erase the attempt claim.
    receipt={status:'reconciliation_required',providerMayHavePublished:true,
      error:'provider_attempt_unresolved'};
  }
  const stored=completeJournalPublishClaim({claim,receipt});

  return {
    schema:'evercraft.home.clip-journal-publish-receipt.v1',
    state:receipt.status,
    slug:normalizeJournalStorySlug(slug),
    story_id:clean(handoff.story_id),
    resource_ref:resourceRef,
    destination:'facebook-page',
    handoff_ref:path.relative(path.resolve(repoRoot),file).replaceAll('\\','/'),
    canonical_url:clean(handoff.canonical_url),
    provider_post_url:clean(receipt.url)||null,
    provider_remote_id:clean(receipt.remoteId)||null,
    provider_may_have_published:stored.provider_may_have_published,
    automatic_retry_allowed:false,
    manual_reconciliation_required:receipt.status==='reconciliation_required',
    durable_claim_recorded:true,
    authorization_ref:clean(receipt.authorizationRef)||clean(authorizationRef)||null,
    public_link_preflight:receipt.publicLinkPreflight||null,
    canonical_postflight:receipt.canonicalPostflight||null,
    boundaries:{
      storySlugOnly:true,
      arbitraryUrlInputAccepted:false,
      credentialVaultRequired:true,
      secretMaterialReturned:false,
      journalReceiptBound:receipt.boundaries?.journalReceiptBound===true,
      canonicalPreflightVerified:receipt.publicLinkPreflight?.verified===true,
      canonicalPostflightVerified:receipt.boundaries?.canonicalPostflightVerified===true,
    },
    error:clean(receipt.error||receipt.postflight_error)||null,
  };
}
