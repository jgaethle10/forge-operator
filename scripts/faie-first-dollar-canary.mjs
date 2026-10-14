#!/usr/bin/env node
/**
 * Read-only, public-surface preflight for the existing FAIE $250 Signal Brief.
 *
 * Important: an HTML 200, a correct price catalog, and a human intake route
 * do NOT verify that a checkout can be created, paid, settled or fulfilled.
 * Never sends PII, submits a form or creates a checkout session.
 */
import { pathToFileURL } from 'node:url';

export const FAIE_DOORS = Object.freeze({
  owned_discovery: 'https://fabric.systemiacommandcenters.com/faie/',
  buyer_intake: 'https://faie.base44.app/start?offer=signal_brief_250',
  read_only_offers: 'https://faie.base44.app/functions/faieAgentGateway?view=offers',
});

const TARGET = Object.freeze({ offer_key: 'signal_brief_250', price_usd: 250 });

function failure(code, message) {
  return { ok: false, code, message };
}

async function readPublic(url, { fetchImpl, timeoutMs }) {
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { accept: 'text/html,application/json', 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return failure('http_error', `HTTP ${response.status}`);
    // Bound response read. A 200 SPA shell is *not* sufficient checkout proof.
    const text = (await response.text()).slice(0, 1024 * 512);
    return { ok: true, content_type: response.headers.get('content-type') || '', text };
  } catch (err) {
    return failure('network_error', String(err?.message || err).slice(0, 160));
  }
}

export async function checkFaieFirstDollar({ fetchImpl = globalThis.fetch, timeoutMs = 12000 } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60000) throw new RangeError('invalid timeoutMs');

  const [owned, intake, catalog] = await Promise.all([
    readPublic(FAIE_DOORS.owned_discovery, { fetchImpl, timeoutMs }),
    readPublic(FAIE_DOORS.buyer_intake, { fetchImpl, timeoutMs }),
    readPublic(FAIE_DOORS.read_only_offers, { fetchImpl, timeoutMs }),
  ]);

  const ownedHtml = owned.ok && /text\/html/i.test(owned.content_type) && /<html[\s>]/i.test(owned.text);
  const intakeHtml = intake.ok && /text\/html/i.test(intake.content_type) && /<html[\s>]/i.test(intake.text);

  let exactOffer = false;
  let explicitConfirmation = false;
  let offerReason = catalog.code || null;
  if (catalog.ok) {
    try {
      const body = JSON.parse(catalog.text);
      const offers = Array.isArray(body.offers) ? body.offers : [];
      const row = offers.find((offer) => offer.offer_key === TARGET.offer_key);
      exactOffer = body.ok === true && Number(row?.price_usd) === TARGET.price_usd && row?.billing === 'one_time';
      explicitConfirmation = body.confirmation_required === true;
      offerReason = exactOffer && explicitConfirmation ? null : 'price_or_confirmation_contract_mismatch';
    } catch {
      offerReason = 'catalog_not_json';
    }
  }

  const buyerPreflight = Boolean(ownedHtml && intakeHtml && exactOffer && explicitConfirmation);
  return {
    schema: 'evercraft.faie-first-dollar-read-only-canary.v1',
    product: 'FAIE Signal Brief',
    expected_offer: TARGET,
    public_surfaces: {
      owned_discovery: { url: FAIE_DOORS.owned_discovery, reachable_html: Boolean(ownedHtml), error: ownedHtml ? null : (owned.code || 'not_html') },
      buyer_intake: { url: FAIE_DOORS.buyer_intake, reachable_html: Boolean(intakeHtml), error: intakeHtml ? null : (intake.code || 'not_html') },
      catalog: { url: FAIE_DOORS.read_only_offers, exact_price_verified: exactOffer, explicit_confirmation: explicitConfirmation, error: offerReason },
    },
    buyer_preflight: buyerPreflight ? 'READY_FOR_MANUAL_END_TO_END_QA' : 'HELD',
    caveat: 'A reachable HTML route may be an SPA fallback, not a functioning buyer form. No checkout is created or exercised.',
    verified_checkout_creation: false,
    verified_processor_payment: false,
    verified_fulfillment: false,
    collected_revenue_usd: null,
    next_step: buyerPreflight
      ? 'Manually test the real buyer form and approved non-production payment/return flow, then separately reconcile authoritative order and fulfillment receipts.'
      : 'Repair the failed public read-only surface before inviting a buyer.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await checkFaieFirstDollar();
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.buyer_preflight !== 'READY_FOR_MANUAL_END_TO_END_QA') process.exitCode = 1;
}
