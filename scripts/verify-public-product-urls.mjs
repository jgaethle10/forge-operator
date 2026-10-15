import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const INVENTORY = path.join(root, 'distribution/public-product-url-gates.v1.json');
export const CANONICAL = Object.freeze({
  'findmypart-agent-docs': 'https://findmypart.base44.app/functions/findMyPartAgentGateway?view=docs',
  'career-sprint-offer': 'https://evercraft-career-command.base44.app/functions/careerAgentGateway?view=offers',
  'website-launch-docs': 'https://instant-website-builder-usa-6feac193.base44.app/functions/websiteServiceAgentGateway?view=docs',
  'systemia-free-domain-check': 'https://systemia-audit-pro.base44.app/functions/auditAgentGateway?view=check',
  'blackbox-free-crash-test': 'https://evercraft.base44.app/api/apps/6a9b99a2de0b9ce8e46ccf3c/functions/blackBoxExperienceDelivery',
});
const MIME = new Set(['text/html', 'application/json']);
const STATES = new Set(['held', 'review_ready', 'released']);
const PAYMENTS = new Set(['blocked', 'unverified', 'not_applicable', 'provider_verified']);
const MAX_BYTES = 98304;

export function validateInventory(inventory) {
  if (!inventory || inventory.schema !== 'evercraft.public-product-url-gates.v1' || !Array.isArray(inventory.offers)) throw Error('invalid_inventory_schema');
  const seen = new Set();
  for (const offer of inventory.offers) {
    if (!offer || !Object.hasOwn(CANONICAL, offer.id) || seen.has(offer.id)) throw Error('unknown_or_duplicate_product_id');
    seen.add(offer.id);
    if (offer.url !== CANONICAL[offer.id]) throw Error('canonical_url_drift:' + offer.id);
    const url = new URL(offer.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.href !== offer.url) throw Error('unsafe_url:' + offer.id);
    if (!MIME.has(offer.content_type) || !STATES.has(offer.distribution_state) || !PAYMENTS.has(offer.paid_checkout_state)) throw Error('unrecognized_state:' + offer.id);
    if (offer.content_type === 'text/html' && (!offer.marker || offer.marker.length < 12)) throw Error('missing_html_content_signature:' + offer.id);
    if (offer.content_type === 'application/json' && (!offer.json_equals || !Object.keys(offer.json_equals).length)) throw Error('missing_json_contract:' + offer.id);
    if (!offer.reason || offer.reason.length < 24) throw Error('missing_evidence_boundary:' + offer.id);
    if (offer.distribution_state === 'released' && !offer.publication_receipt) throw Error('released_without_publication_receipt:' + offer.id);
    if (offer.paid_promotion_allowed !== false && !(offer.paid_checkout_state === 'provider_verified' && offer.provider_payment_receipt)) throw Error('paid_promotion_without_payment_proof:' + offer.id);
    if (offer.paid_checkout_state === 'blocked' && offer.paid_promotion_allowed !== false) throw Error('blocked_payment_promoted:' + offer.id);
  }
  if (seen.size !== Object.keys(CANONICAL).length) throw Error('incomplete_url_manifest');
  return { ok: true, offer_count: seen.size, routes: [...seen] };
}

async function boundedBody(response) {
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_BYTES) throw Error('oversize_content_length');
  if (!response.body?.getReader) throw Error('response_stream_missing');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw Error('response_too_large');
      chunks.push(value);
    }
  } finally {
    try { await reader.cancel(); } catch {}
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map(x => Buffer.from(x))).toString('utf8');
}

function nested(obj, dotted) {
  return dotted.split('.').reduce((node, key) => (node === null || typeof node !== 'object') ? undefined : node[key], obj);
}

export async function probeOffer(offer, request = fetch) {
  // This check is GET-only. There are no checkout, lead, intake, publishing, or mutation calls.
  if (!Object.hasOwn(CANONICAL, offer.id) || offer.url !== CANONICAL[offer.id]) throw Error('unapproved_destination');
  const response = await request(offer.url, {
    method: 'GET',
    redirect: 'manual',
    headers: { accept: offer.content_type, 'user-agent': 'Evercraft-Product-URL-Gate/1.0' },
    signal: AbortSignal.timeout(9000),
  });
  if (response.status !== 200) throw Error('non_200_or_redirect:' + response.status);
  const actualMime = (response.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
  if (actualMime !== offer.content_type) throw Error('unexpected_mime:' + actualMime);
  const body = await boundedBody(response);
  if (offer.content_type === 'text/html') {
    if (!body.includes(offer.marker)) throw Error('html_product_signature_missing');
  } else {
    let parsed;
    try { parsed = JSON.parse(body); } catch { throw Error('invalid_json_response'); }
    for (const [key, value] of Object.entries(offer.json_equals)) {
      if (nested(parsed, key) !== value) throw Error('json_contract_mismatch:' + key);
    }
  }
  return {
    id: offer.id, url: offer.url, http_status: 200, content_type: actualMime,
    state: 'verified_http_content_only', distribution_state: offer.distribution_state,
    checkout_verified: false, mobile_buyer_tested: false, publication_verified: false,
  };
}

export async function main(args = process.argv.slice(2), request = fetch) {
  if (args.length && (args.length !== 1 || args[0] !== '--live')) throw Error('only_--live_is_supported');
  const inventory = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
  const preflight = validateInventory(inventory);
  if (!args.length) return { schema: 'evercraft.product-url-gate-receipt.v1', mode: 'offline', ...preflight, network_called: false };
  const results = [];
  for (const offer of inventory.offers) {
    try { results.push(await probeOffer(offer, request)); }
    catch (error) { results.push({ id: offer.id, url: offer.url, state: 'failed_closed', reason: String(error?.message || error) }); }
  }
  return { schema: 'evercraft.product-url-gate-receipt.v1', mode: 'read_only_live_get', checked_at: new Date().toISOString(), ok: results.every(x => x.state === 'verified_http_content_only'), results, payment_proof: false, publishing_proof: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then(result => {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (result.ok === false) process.exitCode = 1;
  }).catch(error => { process.stderr.write(String(error?.message || error) + '\n'); process.exitCode = 1; });
}
