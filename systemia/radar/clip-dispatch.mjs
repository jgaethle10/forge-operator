import fs from 'node:fs';
import path from 'node:path';
import { publishClipSocialPost } from '../clip/social-publisher-runtime.mjs';
import { createFacebookPagePublisherAdapter } from '../clip/facebook-page-publisher.mjs';

const clean = (value) => String(value ?? '').trim();

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function atomicWrite(file, value) {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, file);
}

function safePublicOrigin(value) {
  try {
    const url = new URL(clean(value));
    if (url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function slugFromFile(file) {
  return path.basename(file, '.json');
}

function receiptPath(stateDir, slug, destination = 'facebook-page') {
  return path.join(stateDir, 'clip-receipts', `${slug}.${destination}.json`);
}

function publicReceipt(receipt) {
  if (!receipt) return null;
  return {
    schema: receipt.schema,
    status: receipt.status,
    requestId: receipt.requestId || null,
    releaseId: receipt.releaseId || null,
    destination: receipt.destination || null,
    brandKey: receipt.brandKey || null,
    contentDigest: receipt.contentDigest || null,
    remoteId: receipt.remoteId || null,
    url: receipt.url || null,
    authorizationRef: receipt.authorizationRef || null,
    error: receipt.error || null,
    startedAt: receipt.startedAt || null,
    publishedAt: receipt.publishedAt || null,
    failedAt: receipt.failedAt || null,
    heldAt: receipt.heldAt || null,
    reason: receipt.reason || null,
    boundaries: receipt.boundaries || null
  };
}

export function buildRadarFacebookRequest({
  clipPackage,
  publicOrigin,
  authorizationRef
} = {}) {
  if (clipPackage?.schema !== 'evercraft.clip.radar-release.v1') {
    throw new TypeError('Radar Clip release package v1 is required');
  }

  const derivative = (clipPackage.derivatives || []).find((row) =>
    clean(row.platform).toLowerCase() === 'facebook'
  );
  if (!derivative?.copy) {
    return {
      status: 'hold',
      reason: 'facebook_derivative_missing',
      request: null
    };
  }

  const origin = safePublicOrigin(publicOrigin);
  if (!origin) {
    return {
      status: 'hold',
      reason: 'radar_public_origin_missing',
      request: null
    };
  }

  const authRef = clean(authorizationRef);
  if (!authRef) {
    return {
      status: 'hold',
      reason: 'clip_authorization_ref_missing',
      request: null
    };
  }

  const canonicalPath = clean(clipPackage.canonical_path);
  if (!canonicalPath.startsWith('/')) {
    return {
      status: 'hold',
      reason: 'radar_canonical_path_invalid',
      request: null
    };
  }

  return {
    status: 'ready',
    reason: null,
    request: {
      schema: 'evercraft.clip.social-publish-request.v1',
      id: `radar:${clipPackage.release_id}:facebook-page`,
      destination: 'facebook-page',
      brandKey: clean(clipPackage.brand || 'evercraft'),
      authorization: {
        approved: true,
        authorizationRef: authRef
      },
      metadata: {
        title: 'Systemia Radar | Reality Before Narrative',
        message: derivative.copy,
        link: origin + canonicalPath,
        campaign: 'systemia-radar'
      }
    }
  };
}

export function createRadarClipDispatcher({
  stateDir = path.resolve('.runtime', 'radar'),
  enabled = false,
  publicOrigin = '',
  authorizationRef = '',
  fetchImpl = globalThis.fetch,
  facebook = {}
} = {}) {
  const outboxDir = path.join(stateDir, 'clip-outbox');
  const receiptsDir = path.join(stateDir, 'clip-receipts');
  let lastRun = null;

  function adapter() {
    return createFacebookPagePublisherAdapter({
      pageId: facebook.pageId,
      pageAccessToken: facebook.pageAccessToken,
      graphVersion: facebook.graphVersion || 'v26.0',
      graphBase: facebook.graphBase,
      verified: facebook.verified === true,
      allowPublish: enabled === true,
      fetchImpl
    });
  }

  function files() {
    if (!fs.existsSync(outboxDir)) return [];
    return fs.readdirSync(outboxDir)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => path.join(outboxDir, name));
  }

  function priorFor(slug) {
    return readJson(receiptPath(stateDir, slug), null);
  }

  function hold({ clipPackage, slug, reason, prior = null }) {
    const receipt = {
      schema: 'evercraft.clip.social-publish-receipt.v1',
      status: 'held',
      requestId: clipPackage?.release_id ? `radar:${clipPackage.release_id}:facebook-page` : null,
      releaseId: clipPackage?.release_id || null,
      destination: 'facebook-page',
      brandKey: clipPackage?.brand || 'evercraft',
      authorizationRef: clean(authorizationRef) || null,
      reason,
      priorStatus: prior?.status || null,
      heldAt: new Date().toISOString(),
      boundaries: {
        firstPartyClipRuntime: true,
        verifiedAdapterRequired: true,
        contentDigestBound: false,
        explicitAuthorizationRequired: true,
        providerReceiptRequired: true,
        publicationStateAssertedFromProviderResponse: false
      }
    };
    atomicWrite(receiptPath(stateDir, slug), receipt);
    return receipt;
  }

  async function dispatchFile(file, { retryFailed = false } = {}) {
    const slug = slugFromFile(file);
    const clipPackage = readJson(file, null);
    if (!clipPackage || clipPackage.schema !== 'evercraft.clip.radar-release.v1') {
      return hold({ clipPackage, slug, reason: 'clip_outbox_schema_invalid' });
    }

    const prior = priorFor(slug);
    if (prior?.status === 'published') return prior;
    if (prior?.status === 'failed' && !retryFailed) {
      return hold({
        clipPackage,
        slug,
        reason: 'prior_publish_failure_requires_explicit_retry',
        prior
      });
    }

    if (!enabled) {
      return hold({ clipPackage, slug, reason: 'radar_clip_autopublish_disabled', prior });
    }

    if (facebook.verified !== true) {
      return hold({ clipPackage, slug, reason: 'facebook_adapter_not_verified', prior });
    }
    if (!clean(facebook.pageId)) {
      return hold({ clipPackage, slug, reason: 'facebook_page_id_missing', prior });
    }
    if (!clean(facebook.pageAccessToken)) {
      return hold({ clipPackage, slug, reason: 'facebook_page_access_token_missing', prior });
    }

    const built = buildRadarFacebookRequest({
      clipPackage,
      publicOrigin,
      authorizationRef
    });
    if (built.status !== 'ready') {
      return hold({ clipPackage, slug, reason: built.reason, prior });
    }

    let receipt;
    try {
      receipt = await publishClipSocialPost({
        request: built.request,
        adapters: [adapter()],
        policy: {
          allowPublishing: true,
          allowedDestinations: ['facebook-page'],
          blockedBrandKeys: ['rnb-chicken-and-soul']
        }
      });
    } catch (error) {
      receipt = {
        schema: 'evercraft.clip.social-publish-receipt.v1',
        status: 'failed',
        requestId: built.request.id,
        destination: built.request.destination,
        brandKey: built.request.brandKey,
        authorizationRef: built.request.authorization.authorizationRef,
        error: error instanceof Error ? error.message : String(error),
        startedAt: new Date().toISOString(),
        failedAt: new Date().toISOString(),
        boundaries: {
          firstPartyClipRuntime: true,
          verifiedAdapterRequired: true,
          contentDigestBound: false,
          explicitAuthorizationRequired: true,
          providerReceiptRequired: true,
          publicationStateAssertedFromProviderResponse: false
        }
      };
    }

    const augmented = {
      ...receipt,
      releaseId: clipPackage.release_id,
      sourceEditionId: clipPackage.source_edition_id,
      canonicalPath: clipPackage.canonical_path,
      evidenceSha256: clipPackage.evidence_sha256
    };
    atomicWrite(receiptPath(stateDir, slug), augmented);
    return augmented;
  }

  async function runOnce({ maxItems = 1, retryFailed = false } = {}) {
    ensureDir(receiptsDir);
    const candidates = files();
    const receipts = [];
    let attempted = 0;

    for (const file of candidates) {
      const prior = priorFor(slugFromFile(file));
      if (prior?.status === 'published') continue;
      if (prior?.status === 'failed' && !retryFailed) continue;
      if (attempted >= Math.max(1, Math.min(10, Number(maxItems) || 1))) break;
      attempted += 1;
      receipts.push(await dispatchFile(file, { retryFailed }));
    }

    lastRun = {
      schema: 'evercraft.systemia-radar.clip-dispatch-run.v1',
      at: new Date().toISOString(),
      enabled: Boolean(enabled),
      public_origin_configured: Boolean(safePublicOrigin(publicOrigin)),
      authorization_configured: Boolean(clean(authorizationRef)),
      facebook_adapter_verified: facebook.verified === true,
      outbox_count: candidates.length,
      attempted,
      published: receipts.filter((row) => row.status === 'published').length,
      failed: receipts.filter((row) => row.status === 'failed').length,
      held: receipts.filter((row) => row.status === 'held').length,
      receipts: receipts.map(publicReceipt)
    };
    return lastRun;
  }

  function state() {
    const outbox = files().map((file) => {
      const slug = slugFromFile(file);
      const pkg = readJson(file, null);
      return {
        slug,
        release_id: pkg?.release_id || null,
        source_edition_id: pkg?.source_edition_id || null,
        receipt: publicReceipt(priorFor(slug))
      };
    });
    return {
      schema: 'evercraft.systemia-radar.clip-distribution-state.v1',
      enabled: Boolean(enabled),
      public_origin_configured: Boolean(safePublicOrigin(publicOrigin)),
      authorization_configured: Boolean(clean(authorizationRef)),
      facebook: {
        destination: 'facebook-page',
        adapter_verified: facebook.verified === true,
        page_id_configured: Boolean(clean(facebook.pageId)),
        access_token_configured: Boolean(clean(facebook.pageAccessToken))
      },
      outbox,
      last_run: lastRun
    };
  }

  return {
    runOnce,
    state
  };
}
