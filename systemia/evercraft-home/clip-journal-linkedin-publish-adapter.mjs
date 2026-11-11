import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import { ProviderCredentialVault } from './credential-vault.mjs';
import { readJournalClipHandoff, normalizeJournalStorySlug } from './clip-journal-publish-adapter.mjs';
import { claimJournalPublish, completeJournalPublishClaim } from './clip-journal-claim.mjs';
import { buildJournalClipSocialPublishRequest } from '../newsroom/journal-clip-bridge.mjs';
import { publishClipSocialPost } from '../clip/social-publisher-runtime.mjs';
import { createLinkedInOrganizationPublisherAdapter } from '../clip/linkedin-organization-publisher.mjs';

const clean = value => String(value ?? '').trim();

function verifyJournalPublicationReceipt(repoRoot,slug,handoff) {
  const journal=path.resolve(repoRoot,'public','journal');
  const expectedRef='receipts/'+slug+'.json';
  if (clean(handoff.publication_receipt_ref)!==expectedRef)
    throw Error('clip_linkedin_journal_receipt_reference_mismatch');
  const receiptFile=path.join(journal,'receipts',slug+'.json');
  const articleFile=path.join(journal,slug,'index.html');
  if (!fs.existsSync(receiptFile)||!fs.existsSync(articleFile))
    throw Error('clip_linkedin_journal_publication_receipt_missing');
  const receipt=JSON.parse(fs.readFileSync(receiptFile,'utf8'));
  const article=fs.readFileSync(articleFile,'utf8');
  const digest=createHash('sha256').update(article).digest('hex');
  if (receipt.schema!=='evercraft.journal.publication-receipt.v1' ||
      receipt.slug!==slug ||
      receipt.story_id!==clean(handoff.story_id) ||
      receipt.title!==clean(handoff.title) ||
      receipt.canonical_url!==clean(handoff.canonical_url) ||
      receipt.clip_handoff_ref!=='production/'+slug+'/clip-handoff.json' ||
      receipt.article_sha256!==digest ||
      receipt.publication_authority!==true ||
      receipt.publication_state!=='live' ||
      receipt.live_edition_eligible!==true ||
      receipt.editorial_gate?.status!=='accepted' ||
      Number(receipt.editorial_gate?.score)!==10 ||
      receipt.production_grade?.status!=='accepted' ||
      receipt.production_grade?.text_primary===true ||
      !(Date.parse(receipt.freshness_expires_at)>Date.now()))
    throw Error('clip_linkedin_journal_publication_receipt_unverified');
  return receipt;
}


function resolveLinkedInCredential({ credentialStateDir, expectedOrganizationId, credentialRef='' }) {
  if (!clean(credentialStateDir)) throw Error('clip_linkedin_credential_vault_not_configured');
  if (!/^[1-9][0-9]{1,19}$/.test(clean(expectedOrganizationId)))
    throw Error('clip_linkedin_private_organization_allowlist_missing');
  const vault = new ProviderCredentialVault({stateDir:credentialStateDir});
  const matches = vault.list({provider:'linkedin-organization'});
  const selected = credentialRef
    ? matches.filter(row=>row.credential_ref===credentialRef)
    : matches;
  if (selected.length !== 1) throw Error(
    selected.length ? 'clip_linkedin_credential_selection_ambiguous' : 'clip_linkedin_credential_missing'
  );
  const secret=vault.readSecret(selected[0].credential_ref);
  if (clean(secret.api_key_id) !== 'urn:li:organization:' + clean(expectedOrganizationId))
    throw Error('clip_linkedin_organization_identity_mismatch');
  if (!clean(secret.api_secret)) throw Error('clip_linkedin_credential_invalid');
  return {organizationId:clean(expectedOrganizationId),accessToken:clean(secret.api_secret)};
}

// Authenticated Evercraft Home calls this only after verifying a Passport
// home.clip.publish grant scoped to the specific Journal story. The caller must
// bind the target organization via private runtime configuration, not HTTP input.
export async function publishJournalStoryLinkedInFromHome({
  repoRoot, slug, credentialStateDir, stateRoot,
  organizationId, authorizationRef,
  credentialRef='', linkedinVersion, publisherEnabled=false,
  orgAccessVerified=false, writePermissionVerified=false, readPermissionVerified=false,
  fetchImpl=globalThis.fetch,
  adapterFactory=createLinkedInOrganizationPublisherAdapter,
} = {}) {
  const safeSlug=normalizeJournalStorySlug(slug);
  const auth=clean(authorizationRef);
  if (!auth.startsWith('passport-grant:') || auth.length<20)
    throw Error('clip_linkedin_passport_grant_required');
  if (publisherEnabled !== true) throw Error('clip_linkedin_publisher_disabled');
  if (!clean(stateRoot)) throw Error('clip_linkedin_durable_claim_state_required');

  const {handoff}=readJournalClipHandoff(repoRoot,safeSlug);
  if (handoff.publication_authority !== false ||
      clean(handoff.slug) !== safeSlug ||
      !clean(handoff.publication_receipt_ref))
    throw Error('clip_linkedin_journal_release_receipt_unverified');
  verifyJournalPublicationReceipt(repoRoot,safeSlug,handoff);
  const derivative=(handoff.derivatives || [])
    .find(row=>clean(row.platform).toLowerCase()==='linkedin');
  if (!clean(derivative?.copy)) throw Error('clip_linkedin_journal_derivative_missing');

  const cred=resolveLinkedInCredential({
    credentialStateDir,expectedOrganizationId:organizationId,credentialRef,
  });
  const request=buildJournalClipSocialPublishRequest({
    handoff,destination:'linkedin-organization',brandKey:'evercraft-journal',
    authorizationRef:auth,message:clean(derivative.copy),
    campaign:'evercraft-journal',requestId:'journal-linkedin:'+safeSlug,
  });
  let claim=null;
  let duplicate=false;
  const adapter=adapterFactory({
    ...cred,linkedinVersion,fetchImpl,verified:true,allowPublish:true,
    allowedOrganizationIds:[clean(organizationId)],
    allowedBrandKeys:['evercraft-journal'],
    organizationAccessVerified:orgAccessVerified,
    writePermissionVerified,readPermissionVerified,
    verifyAuthority:async({organizationId:target,authorizationRef:grant,brandKey,requestId})=>({
      approved: target===clean(organizationId) && grant===auth &&
        brandKey==='evercraft-journal' && requestId==='journal-linkedin:'+safeSlug,
      grantRef:auth
    }),
    claimPublish:async({organizationId:target,authorizationRef:grant,requestId})=>{
      if (target!==clean(organizationId) || grant!==auth ||
          requestId!=='journal-linkedin:'+safeSlug) return {status:'denied'};
      claim=claimJournalPublish({
        repoRoot,stateRoot,slug:'linkedin-'+safeSlug,handoff,
      });
      if (claim.state!=='claimed') {
        duplicate=true;
        return {status:'duplicate_or_reconciliation_hold'};
      }
      return {status:'claimed',receiptRef:'clip-journal-linkedin:'+safeSlug};
    },
  });
  const receipt=await publishClipSocialPost({
    request,adapters:[adapter],
    policy:{
      allowPublishing:true,
      allowedDestinations:['linkedin-organization'],
      blockedBrandKeys:['rnb-chicken-and-soul'],
      publicLinkPreflight:{fetchImpl},
    },
  });

  let record=null;
  if (claim?.state==='claimed') {
    record=completeJournalPublishClaim({claim,receipt});
  }
  return {
    schema:'evercraft.home.clip-journal-linkedin-receipt.v1',
    state:duplicate?'duplicate_or_reconciliation_hold':receipt.status,
    destination:'linkedin-organization',slug:safeSlug,
    story_id:clean(handoff.story_id),
    resource_ref:'journal-story:'+safeSlug,
    canonical_url:clean(handoff.canonical_url),
    provider_post_url:receipt.status==='published'?clean(receipt.url):null,
    provider_remote_id:clean(receipt.remoteId)||null,
    provider_may_have_published:duplicate || Boolean(record) ||
      receipt.providerMayHavePublished===true,
    automatic_retry_allowed:false,
    manual_reconciliation_required:duplicate ||
      receipt.status==='reconciliation_required' ||
      Boolean(record && receipt.status!=='published'),
    durable_claim_recorded:Boolean(record),
    authorization_ref:auth,
    secret_material_returned:false,
    source_refs:receipt.sourceRefs||[],
    error:duplicate?'duplicate_or_reconciliation_hold':clean(receipt.error)||null,
  };
}
