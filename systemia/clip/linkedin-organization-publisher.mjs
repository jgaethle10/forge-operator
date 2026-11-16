import { assertEvercraftFamilySocialSafe } from './family-social-safety.mjs';
import { assertPublicLinkShape } from './public-link-preflight.mjs';

// Owned LinkedIn organization publisher. Never accepts a token, author, or provider
// origin from a public publication request. All of them come from private config.
const clean = value => String(value ?? '').trim();
const SHA256 = /^[a-f0-9]{64}$/i;
const ORG_ID = /^[1-9][0-9]{1,19}$/;
const POST_ID = /^urn:li:(?:share|ugcPost):[0-9]+$/;
const VERSION = /^20[0-9]{4}$/;
const API_ORIGIN = 'https://api.linkedin.com';
const DOCUMENTATION = 'https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api';

function blocked(reason) { throw new Error('clip_linkedin_' + reason); }
function receiptHold(reason, remoteId=null, claimRef=null) {
  return {
    state: 'reconciliation_required',
    reason,
    remoteId,
    url: null,
    claimRef,
    providerMayHavePublished: true,
    manualReconciliationRequired: true,
    automaticRetryAllowed: false,
    sourceRefs: ['provider:linkedin-rest-posts'],
  };
}

export function createLinkedInOrganizationPublisherAdapter(config = {}) {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const organizationId = clean(config.organizationId);
  const token = clean(config.accessToken);
  const apiVersion = clean(config.linkedinVersion);
  const author = 'urn:li:organization:' + organizationId;
  const headers = {
    Authorization: 'Bearer ' + token,
    'X-Restli-Protocol-Version': '2.0.0',
    'Linkedin-Version': apiVersion,
    'Content-Type': 'application/json',
  };
  return {
    id: 'linkedin-organization-posts-' + apiVersion,
    destination: 'linkedin-organization',
    verified: config.verified === true,
    requiredPermissions: ['w_organization_social','r_organization_social'],
    async publish(input) {
      if (config.verified !== true || config.allowPublish !== true)
        blocked('publishing_not_enabled');
      if (!ORG_ID.test(organizationId) || !token) blocked('organization_credential_missing');
      if (!VERSION.test(apiVersion)) blocked('api_version_required');
      if (!Array.isArray(config.allowedOrganizationIds) ||
          !config.allowedOrganizationIds.map(clean).includes(organizationId))
        blocked('organization_not_allowlisted');
      if (config.organizationAccessVerified !== true ||
          config.writePermissionVerified !== true ||
          config.readPermissionVerified !== true)
        blocked('provider_rights_not_verified');
      const brand = clean(input?.brandKey);
      if (!Array.isArray(config.allowedBrandKeys) ||
          !config.allowedBrandKeys.map(clean).includes(brand))
        blocked('brand_not_allowlisted');
      const authorizationRef = clean(input?.authorizationRef);
      const contentDigest = clean(input?.contentDigest);
      const requestId = clean(input?.requestId);
      if (!requestId || !authorizationRef || !SHA256.test(contentDigest))
        blocked('bounded_request_required');

      const message = clean(input?.metadata?.message);
      const link = clean(input?.metadata?.link);
      if (!message) blocked('message_missing');
      if (link) assertPublicLinkShape(link);
      assertEvercraftFamilySocialSafe({message,link});
      const commentary = message + (link && !message.includes(link) ? '\n\n' + link : '');
      if (commentary.length > 3000) blocked('commentary_too_long');
      if (typeof config.verifyAuthority !== 'function' ||
          typeof config.claimPublish !== 'function')
        blocked('private_authority_and_durable_claim_required');

      // The caller must verify this exact account/brand/content/permission grant,
      // not trust a request's "approved" boolean or a made-up authorizationRef.
      const authority = await config.verifyAuthority({
        organizationId, author, brandKey: brand, authorizationRef,
        contentDigest, requestId, scope: 'home.clip.publish'
      });
      if (authority?.approved !== true || !clean(authority?.grantRef))
        blocked('authorization_unverified');

      // Durable, atomic idempotency claim MUST be persisted before any provider POST.
      // An ambiguous POST is never retried with the same campaign identity.
      const claim = await config.claimPublish({
        provider: 'linkedin', organizationId, brandKey: brand,
        authorizationRef, contentDigest, requestId
      });
      if (claim?.status !== 'claimed' || !clean(claim?.receiptRef))
        blocked('duplicate_or_claim_unavailable');
      const claimRef = clean(claim.receiptRef);

      const payload = {
        author, commentary, visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      };

      let remoteId=null;
      try {
        const created=await fetchImpl(API_ORIGIN + '/rest/posts', {
          method: 'POST', headers, body: JSON.stringify(payload),
          redirect: 'error',
        });
        if (created.status !== 201)
          return receiptHold('linkedin_create_not_confirmed', null, claimRef);
        remoteId=clean(created.headers?.get('x-restli-id'));
        if (!POST_ID.test(remoteId))
          return receiptHold('linkedin_create_id_missing', null, claimRef);
      } catch {
        return receiptHold('linkedin_create_ambiguous', null, claimRef);
      }
      // LinkedIn may create a post even if a subsequent GET fails.
      // Only the authenticated READER view of the same post, author, and exact
      // text can promote an attempt into a provider-confirmed publication.
      try {
        const readback=await fetchImpl(
          API_ORIGIN + '/rest/posts/' + encodeURIComponent(remoteId) + '?viewContext=READER',
          {method: 'GET', headers, redirect: 'error'}
        );
        if (readback.status !== 200)
          return receiptHold('linkedin_readback_http_unconfirmed', remoteId, claimRef);
        const data=await readback.json();
        if (clean(data?.id) !== remoteId ||
            clean(data?.author) !== author ||
            clean(data?.commentary) !== commentary ||
            data?.lifecycleState !== 'PUBLISHED' ||
            data?.visibility !== 'PUBLIC' ||
            data?.distribution?.feedDistribution !== 'MAIN_FEED')
          return receiptHold('linkedin_readback_identity_mismatch', remoteId, claimRef);
        return {
          state: 'published',
          remoteId,
          providerRequestId: remoteId,
          url: 'https://www.linkedin.com/feed/update/' + remoteId + '/',
          claimRef,
          providerReadbackVerified: true,
          externalAnonymousVisibilityVerified: false,
          sourceRefs: [
            'provider:linkedin-rest-posts',
            'provider:linkedin-reader-view-identity',
            'provider-doc:' + DOCUMENTATION,
          ],
        };
      } catch {
        return receiptHold('linkedin_readback_ambiguous', remoteId, claimRef);
      }
    },
  };
}
