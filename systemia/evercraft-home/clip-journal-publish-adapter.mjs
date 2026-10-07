import fs from 'node:fs';
import path from 'node:path';
import { publishCfbJournalToFacebook } from '../newsroom/cfb-clip-facebook-publish.mjs';
import { resolveFacebookPageCredential } from '../clip/facebook-page-credential-resolver.mjs';

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
  authorizationRef,
  fetchImpl=globalThis.fetch,
  publisher=publishCfbJournalToFacebook,
}={}){
  const resourceRef=journalStoryResourceRef(slug);
  const {file,handoff}=readJournalClipHandoff(repoRoot,slug);
  if(!clean(credentialStateDir)) throw new Error('home_clip_credential_vault_not_configured');

  const receipt=await publisher({
    handoff,
    authorizationRef:clean(authorizationRef)||'policy:evercraft-journal-autopublish-v1',
    fetchImpl,
    resolveCredential:()=>resolveFacebookPageCredential({credentialStateDir}),
  });

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
