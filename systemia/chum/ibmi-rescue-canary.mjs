#!/usr/bin/env node
import fs from 'node:fs';

function ownedGateway(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new URL(raw);
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:') throw new Error('IBM i canary gateway must use HTTPS.');
  if (host === 'base44.app' || host.endsWith('.base44.app')) {
    throw new Error('IBM i canary gateway points to retired Base44 infrastructure.');
  }
  return parsed.toString();
}

const GATEWAY = ownedGateway(
  process.env.EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL ||
  process.env.EVERCRAFT_MACHINE_COMMERCE_GATEWAY
);
const PUBLIC_ID = 'ibmi-rescue-v1';

if (!GATEWAY) {
  const receipt = {
    schema: 'evercraft.ibmi.machine-commerce-canary.v2',
    checked_at: new Date().toISOString(),
    status: 'held',
    route_state: 'held_no_owned_gateway',
    public_id: PUBLIC_ID,
    base44_used: false,
    checkout_attempted: false,
    payment_attempted: false,
  };
  fs.mkdirSync('artifacts/chum', { recursive: true });
  fs.writeFileSync('artifacts/chum/ibmi-rescue-canary-latest.json', JSON.stringify(receipt, null, 2) + '\n');
  console.log('IBMI_MACHINE_COMMERCE_CANARY_HELD', JSON.stringify(receipt));
  process.exit(0);
}

async function jsonRequest(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        accept: 'application/json',
        'user-agent': 'Evercraft-Systemia-IBMi-Rescue-Canary/2.0',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch {}
    return { response, payload, text };
  } finally {
    clearTimeout(timeout);
  }
}

function assert(condition, message, evidence = null) {
  if (!condition) {
    const suffix = evidence ? ' ' + JSON.stringify(evidence).slice(0, 2000) : '';
    throw new Error(message + suffix);
  }
}

const catalogUrl = new URL(GATEWAY);
catalogUrl.searchParams.set('action', 'offer');
catalogUrl.searchParams.set('public_id', PUBLIC_ID);
const catalog = await jsonRequest(catalogUrl);
assert(catalog.response.ok && catalog.payload?.ok === true, 'offer_lookup_failed', catalog.payload);
assert(catalog.payload?.offer?.public_id === PUBLIC_ID, 'wrong_public_id', catalog.payload?.offer);
assert(catalog.payload?.offer?.commercial_state === 'sell_now', 'not_sell_now', catalog.payload?.offer);
assert(catalog.payload?.offer?.machine_state === 'direct_checkout_ready', 'wrong_machine_state', catalog.payload?.offer);
assert(catalog.payload?.continuation?.mode === 'direct_checkout_capable', 'wrong_continuation_mode', catalog.payload?.continuation);
assert(catalog.payload?.continuation?.inspect_tool === 'get_live_checkout_offer', 'wrong_inspect_tool', catalog.payload?.continuation);
assert(catalog.payload?.continuation?.purchase_tool === 'prepare_verified_checkout', 'wrong_purchase_tool', catalog.payload?.continuation);
assert(catalog.payload?.continuation?.status_tool === 'get_verified_order_status', 'wrong_status_tool', catalog.payload?.continuation);
assert(Array.isArray(catalog.payload?.offer?.offers) && catalog.payload.offer.offers.length >= 3, 'offer_tiers_missing', catalog.payload?.offer?.offers);

const liveOfferUrl = new URL(GATEWAY);
liveOfferUrl.searchParams.set('action', 'get_live_checkout_offer');
liveOfferUrl.searchParams.set('public_id', PUBLIC_ID);
const liveOffer = await jsonRequest(liveOfferUrl);
assert(liveOffer.response.ok && liveOffer.payload?.ok === true, 'live_offer_failed', liveOffer.payload);
const tiers = liveOffer.payload?.offers?.offers || [];
assert(
  tiers.some((row) => row.offer_key === 'ibmi_estate_xray_250' && Number(row.amount_cents) === 25000),
  'ibmi_estate_xray_250_missing',
  tiers
);

const deadlineTier = tiers.find((row) =>
  row.offer_key === 'ibmi_74_deadline_xray_250' && Number(row.amount_cents) === 25000
);
assert(
  deadlineTier,
  'ibmi_74_deadline_xray_250_not_registered',
  tiers
);
// A generic Estate X-Ray synthetic checkout is NOT a payment-path verification
// for this distinct 7.4 SKU. Report tier listing separately from checkout proof.
const deadlineTierListed = true;

const requestId = `qa-ibmi-machine-commerce-${Date.now()}`;
const checkout = await jsonRequest(GATEWAY, {
  method: 'POST',
  body: JSON.stringify({
    action: 'prepare_verified_checkout',
    public_id: PUBLIC_ID,
    user_confirmed_payment: true,
    details: {
      offer_key: 'ibmi_estate_xray_250',
      customer_email: 'qa-ibmi-canary@example.com',
      business_name: 'Systemia Synthetic QA',
      request_id: requestId,
      acquisition_source: 'synthetic_qa',
      campaign_key: 'synthetic_qa',
      release: 'unknown',
      goal: 'assessment',
    },
  }),
});
assert(checkout.response.ok && checkout.payload?.ok === true, 'checkout_canary_failed', checkout.payload);
assert(checkout.payload?.payment_proof === false, 'checkout_must_not_claim_payment_proof', checkout.payload);
assert(checkout.payload?.payment_created === false, 'checkout_must_not_claim_payment_created', checkout.payload);
assert(
  typeof checkout.payload?.checkout?.checkout_url === 'string' &&
    /^https:\/\/checkout\.stripe\.com\//.test(checkout.payload.checkout.checkout_url),
  'checkout_url_invalid',
  checkout.payload?.checkout
);
assert(
  typeof checkout.payload?.checkout?.session_id === 'string' &&
    checkout.payload.checkout.session_id.startsWith('cs_'),
  'checkout_session_missing',
  checkout.payload?.checkout
);
assert(Number(checkout.payload?.checkout?.amount_cents) === 25000, 'checkout_amount_mismatch', checkout.payload?.checkout);

const receipt = {
  schema: 'evercraft.ibmi.machine-commerce-canary.v2',
  checked_at: new Date().toISOString(),
  status: 'pass',
  route_state: 'owned_gateway_probed',
  base44_used: false,
  public_id: PUBLIC_ID,
  machine_state: catalog.payload.offer.machine_state,
  continuation_mode: catalog.payload.continuation.mode,
  offer_key: checkout.payload.checkout.offer_key,
  deadline_offer_key: 'ibmi_74_deadline_xray_250',
  deadline_tier_listed: deadlineTierListed,
  deadline_checkout_verified: false,
  deadline_payment_verified: false,
  amount_cents: checkout.payload.checkout.amount_cents,
  payment_proof: checkout.payload.payment_proof,
  payment_created: checkout.payload.payment_created,
  verification_watch_key: checkout.payload.verification_watch_key || null,
  synthetic_request: true,
};
fs.mkdirSync('artifacts/chum', { recursive: true });
fs.writeFileSync('artifacts/chum/ibmi-rescue-canary-latest.json', JSON.stringify(receipt, null, 2) + '\n');
console.log('IBMI_MACHINE_COMMERCE_CANARY_PASS', JSON.stringify(receipt));
