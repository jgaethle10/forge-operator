import { createHash } from 'node:crypto';
import { normalizeEbayBrowseItem } from './ebay-browse-adapter.mjs';

/**
 * Bounded, read-only eBay Browse discovery. Source adapter only.
 * It never bids, buys, messages sellers, invents completed sales, or emits a
 * "qualified deal" from an asking price.
 *
 * Production use requires an independently approved eBay Browse license,
 * application credentials, and an explicit permission reference.
 */
const API = 'https://api.ebay.com';
const SCOPE = 'https://api.ebay.com/oauth/api_scope';
const MAX_QUERIES = 2;
const MAX_ITEMS = 4;
const TIMEOUT_MS = 8_000;

function validZip(value) { return typeof value === 'string' && /^\d{5}$/.test(value); }
function validQuery(value) {
  return typeof value === 'string' && value.trim().length >= 3 && value.trim().length <= 90 &&
    !/[\u0000-\u001f]/.test(value);
}
function jsonHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function errorCode(response) {
  if (response?.status === 401 || response?.status === 403) return 'source_access_denied';
  if (response?.status === 429) return 'source_rate_limited';
  return 'source_unavailable';
}
async function readJson(response) {
  if (!response?.ok) throw new Error(errorCode(response));
  try {
    const body = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('bad_payload');
    return body;
  } catch { throw new Error('source_malformed_json'); }
}

export async function collectEbayBrowseListings({
  queries,
  zip,
  client_id,
  client_secret,
  access_approved = false,
  permission_ref,
  fetch_impl = fetch,
  now = () => new Date(),
} = {}) {
  // No network request is allowed before every entry gate passes.
  if (access_approved !== true || !String(permission_ref || '').trim()) {
    throw new Error('ebay_browse_permission_not_verified');
  }
  if (!client_id || !client_secret || typeof client_id !== 'string' || typeof client_secret !== 'string') {
    throw new Error('ebay_application_credentials_missing');
  }
  if (!validZip(zip)) throw new Error('invalid_shipping_zip');
  if (!Array.isArray(queries) || queries.length < 1 || queries.length > MAX_QUERIES ||
      queries.some(q => !validQuery(q))) throw new Error('invalid_or_excessive_queries');
  if (typeof fetch_impl !== 'function' || typeof now !== 'function') throw new Error('invalid_collector_dependencies');
  const distinctQueries = [...new Set(queries.map(q => q.trim()))];
  const tokenResponse = await fetch_impl(API + '/identity/v1/oauth2/token', {
    method: 'POST',
    redirect: 'error',
    headers: {
      Authorization: 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: SCOPE }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const tokenBody = await readJson(tokenResponse);
  if (typeof tokenBody.access_token !== 'string' || tokenBody.access_token.length < 8) {
    throw new Error('ebay_application_token_invalid');
  }
  const headers = {
    Authorization: 'Bearer ' + tokenBody.access_token,
    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country=US,zip=' + zip,
    Accept: 'application/json',
  };
  const packets = [];
  const diagnostics = [];
  const seen = new Set();
  let detailCalls = 0;
  for (const query of distinctQueries) {
    if (detailCalls >= MAX_ITEMS) break;
    const params = new URLSearchParams({ q: query, limit: String(MAX_ITEMS), filter: 'buyingOptions:{FIXED_PRICE}' });
    const url = API + '/buy/browse/v1/item_summary/search?' + params;
    const searchResponse = await fetch_impl(url, {
      method: 'GET', redirect: 'error', headers, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await readJson(searchResponse);
    if (!Array.isArray(body.itemSummaries)) {
      diagnostics.push({ query, code: 'search_results_missing', count: 0 });
      continue;
    }
    diagnostics.push({ query, code: 'search_completed', count: body.itemSummaries.length });
    for (const item of body.itemSummaries) {
      if (detailCalls >= MAX_ITEMS) break;
      const id = item?.itemId;
      if (typeof id !== 'string' || !id || id.length > 200 || seen.has(id)) continue;
      seen.add(id);
      detailCalls++;
      const detailUrl = API + '/buy/browse/v1/item/' + encodeURIComponent(id);
      const detailResponse = await fetch_impl(detailUrl, {
        method: 'GET', redirect: 'error', headers, signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!detailResponse?.ok) {
        diagnostics.push({ code: errorCode(detailResponse), item_hash: jsonHash(id).slice(0, 16) });
        continue;
      }
      const detail = await readJson(detailResponse);
      if (detail.itemId !== id) {
        diagnostics.push({ code: 'item_id_mismatch', item_hash: jsonHash(id).slice(0, 16) });
        continue;
      }
      const fetched = now();
      if (!(fetched instanceof Date) || !Number.isFinite(fetched.getTime())) throw new Error('invalid_clock');
      const responseRef = 'ebay-browse-get-item:sha256:' + jsonHash(detail);
      packets.push(normalizeEbayBrowseItem(detail, {
        fetched_at: fetched.toISOString(),
        destination_postal_code: zip,
        source_access: {
          authorized: true,
          source: 'ebay_browse_get_item',
          response_status: 200,
          item_id: id,
          permission_ref,
          request_receipt_ref: responseRef,
        },
        // Explicitly missing until separately quoted or reviewed. This
        // collector cannot silently fill in tax, condition or authenticity.
      }));
    }
  }
  return {
    schema: 'evercraft.asset-radar.ebay-discovery-batch.v1',
    created_at: now().toISOString(),
    provider: 'ebay_browse',
    marketplace: 'EBAY_US',
    shipping_zip: zip,
    discovery_queries: distinctQueries,
    search_calls: distinctQueries.length,
    item_detail_calls: detailCalls,
    packet_count: packets.length,
    packets,
    diagnostics,
    sold_comps_collected: 0,
    bids_or_purchases_made: 0,
    seller_messages_sent: 0,
    is_production_sale_evidence: false,
  };
}
