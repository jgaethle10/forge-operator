import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { claimJournalPublish, completeJournalPublishClaim } from '../../evercraft-home/clip-journal-claim.mjs';
import { createFacebookPagePublisherAdapter } from '../../clip/facebook-page-publisher.mjs';
import { resolveFacebookPageCredential } from '../../clip/facebook-page-credential-resolver.mjs';
import { assertEvercraftFamilySocialSafe } from '../../clip/family-social-safety.mjs';
import { assertPublicLinkShape } from '../../clip/public-link-preflight.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');

export function validateFacebookJob(bytes) {
  if (Buffer.byteLength(bytes) > 32768) throw new Error('harbor_job_too_large');
  const job = JSON.parse(bytes);
  if (job?.schema !== 'evercraft.harbor.facebook-page-job.v1'
    || typeof job.page_id !== 'string' || !/^\d{5,32}$/.test(job.page_id)
    || typeof job.message !== 'string' || !job.message.trim() || job.message.length > 5000
    || (job.link !== undefined && typeof job.link !== 'string')
    || Object.keys(job).some(key => !['schema', 'page_id', 'message', 'link'].includes(key))) {
    throw new Error('harbor_job_invalid');
  }
  assertEvercraftFamilySocialSafe({message: job.message, link: job.link ?? ''});
  if (job.link) assertPublicLinkShape(job.link);
  return {job, digest: sha256(bytes)};
}

export async function runFacebookJob(bytes, {
  publish = false, env = process.env, fetchImpl = globalThis.fetch,
  credentialResolver = resolveFacebookPageCredential,
  repoRoot = fileURLToPath(new URL('../../../', import.meta.url)),
} = {}) {
  const {job, digest} = validateFacebookJob(bytes);
  const receipt = {page_id: job.page_id, job_sha256: digest};
  if (!publish) return {...receipt, status: 'validated'};
  if (env.HARBOR_FACEBOOK_APPROVED_SHA256 !== digest
    || env.HARBOR_FACEBOOK_APPROVED_PAGE_ID !== job.page_id
    || !env.CLIP_FACEBOOK_CREDENTIAL_REF) throw new Error('harbor_approval_or_credential_ref_missing');

  const {config} = credentialResolver({env});
  if (config.pageId !== job.page_id || !config.pageAccessToken) throw new Error('harbor_credential_page_mismatch');
  const graphVersion = env.HARBOR_FACEBOOK_GRAPH_VERSION ?? 'v26.0';
  if (!/^v\d+\.\d+$/.test(graphVersion)) throw new Error('harbor_graph_version_invalid');
  const identity = await fetchImpl('https://graph.facebook.com/'+graphVersion+'/me?fields=id', {
    headers: {Authorization: 'Bearer '+config.pageAccessToken},
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!identity.ok || String((await identity.json()).id) !== job.page_id) {
    throw new Error('harbor_provider_page_mismatch');
  }

  const slug = 'harbor-fb-'+sha256(JSON.stringify([job.page_id, job.message.trim(), (job.link ?? '').trim()]));
  const claim = claimJournalPublish({repoRoot, stateRoot: env.HARBOR_FACEBOOK_STATE_DIR, slug, handoff: job});
  if (claim.state !== 'claimed') return {...receipt, status: claim.state,
    prior_status: claim.prior_state, url: claim.prior_provider_post_url};

  const adapter = createFacebookPagePublisherAdapter({...config, graphVersion, allowPublish: true, verified: true,
    fetchImpl: (url, options) => fetchImpl(url, {...options, redirect: 'error', signal: AbortSignal.timeout(20000)})});
  let outcome;
  try {
    const result = await adapter.publish({metadata: {message: job.message, link: job.link}});
    outcome = {status: result.state, remoteId: result.remoteId, url: result.url};
  } catch {
    // The provider request may have succeeded. The durable claim blocks a second POST.
    outcome = {status: 'reconciliation_required'};
  }
  const final = completeJournalPublishClaim({claim, receipt: outcome});
  return {...receipt, status: final.state, post_id: final.remote_id, url: final.provider_post_url};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [mode, file, ...rest] = process.argv.slice(2);
    if (!['validate', 'publish'].includes(mode) || !file || rest.length) {
      throw new Error('usage: node facebook-job.mjs validate|publish JOB.json');
    }
    const result = await runFacebookJob(await readFile(file), {publish: mode === 'publish'});
    console.log(JSON.stringify(result));
    if (!['validated', 'published'].includes(result.status)) process.exitCode = 1;
  } catch (error) {
    const message = String(error.message);
    console.error(/^(harbor_[a-z_]+|usage: node facebook-job\.mjs validate\|publish JOB\.json)$/.test(message)
      ? message : 'harbor_facebook_job_failed');
    process.exitCode = 1;
  }
}
