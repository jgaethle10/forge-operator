#!/usr/bin/env node

const GATEWAY = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway';
const PUBLIC_ID = 'ibmi-rescue-v1';
const PRODUCT_ROUTE = 'https://findmypart.base44.app/ibmi-rescue';

async function get(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json,text/html;q=0.9,*/*;q=0.5',
        'user-agent': 'Evercraft-Systemia-IBMi-Rescue-Canary/1.0',
        'x-evercraft-source': 'synthetic_qa',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const offerUrl = new URL(GATEWAY);
offerUrl.searchParams.set('action', 'offer');
offerUrl.searchParams.set('public_id', PUBLIC_ID);
const offerResponse = await get(offerUrl);
assert(offerResponse.response.ok, `offer_http_${offerResponse.response.status}`);
const offerPayload = JSON.parse(offerResponse.text);
assert(offerPayload.ok === true, 'offer_not_ok');
assert(offerPayload.offer?.public_id === PUBLIC_ID, 'wrong_public_id');
assert(offerPayload.offer?.commercial_state === 'sell_now', 'not_sell_now');
assert(offerPayload.offer?.machine_state === 'human_handoff_ready', 'wrong_machine_state');
assert(offerPayload.continuation?.mode === 'fixed_price_human_handoff', 'wrong_continuation_mode');
assert(offerPayload.continuation?.next_tool === 'prepare_quote_ready_service_handoff', 'wrong_next_tool');
assert(Array.isArray(offerPayload.offer?.offers) && offerPayload.offer.offers.length === 2, 'offer_tiers_missing');

const handoffUrl = new URL(GATEWAY);
handoffUrl.searchParams.set('action', 'service_handoff');
handoffUrl.searchParams.set('public_id', PUBLIC_ID);
const handoffResponse = await get(handoffUrl);
assert(handoffResponse.response.ok, `handoff_http_${handoffResponse.response.status}`);
const handoffPayload = JSON.parse(handoffResponse.text);
assert(handoffPayload.ok === true, 'handoff_not_ok');
assert(handoffPayload.checkout_created === false, 'handoff_must_not_create_checkout');
assert(handoffPayload.payment_created === false, 'handoff_must_not_create_payment');
assert(handoffPayload.payment_obligation_created === false, 'handoff_must_not_create_payment_obligation');
assert(handoffPayload.human_action_required === true, 'handoff_must_require_human_action');
assert(typeof handoffPayload.handoff_url === 'string' && handoffPayload.handoff_url.includes('view=service'), 'handoff_review_url_missing');

const productRouteResponse = await get(PRODUCT_ROUTE);
assert(productRouteResponse.response.ok, `product_route_http_${productRouteResponse.response.status}`);
assert(/<html|<!doctype html/i.test(productRouteResponse.text), 'product_route_html_missing');

const reviewResponse = await get(handoffPayload.handoff_url);
assert(reviewResponse.response.ok, `review_http_${reviewResponse.response.status}`);
assert(/Evercraft IBM i Rescue/i.test(reviewResponse.text), 'review_page_name_missing');
assert(/\$250/.test(reviewResponse.text), 'review_page_xray_price_missing');
assert(/\$1,500/.test(reviewResponse.text), 'review_page_sprint_price_missing');
assert(/creates no invoice, checkout, entitlement, outreach, payment obligation/i.test(reviewResponse.text), 'review_page_payment_boundary_missing');

console.log(JSON.stringify({
  ok: true,
  public_id: PUBLIC_ID,
  commercial_state: offerPayload.offer.commercial_state,
  machine_state: offerPayload.offer.machine_state,
  continuation: offerPayload.continuation.mode,
  offer_count: offerPayload.offer.offers.length,
  service_handoff_verified: true,
  product_route_http_verified: true,
  product_specific_direct_checkout_verified: false,
  payment_created: false,
}));
