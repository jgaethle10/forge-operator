#!/usr/bin/env node
// Read-only commercial surface canary. NEVER initiates checkout or a payment.
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../public/.well-known/evercraft-payments-buyer-doors.json', import.meta.url), 'utf8'));
const offers = catalog.offers;

async function inspect(offer) {
  const time = Date.now();
  try {
    const response = await fetch(offer.buyer_url, {
      method: 'GET',
      redirect: 'error',
      headers: { 'accept': 'text/html', 'user-agent': 'Evercraft-Payments-BuyerDoor-ReadOnly/1.0' },
      signal: AbortSignal.timeout(12000),
    });
    const body = (await response.text()).slice(0, 250000);
    const reasons = [];
    if (response.status !== 200) reasons.push('http_' + response.status);
    if (!/text\/html/i.test(response.headers.get('content-type') || '')) reasons.push('unexpected_media_type');
    if (!body.includes('name="offer" value="' + offer.slug + '"')) reasons.push('selected_offer_form_missing');
    if (!body.includes('<form method="post"')) reasons.push('purchase_intake_missing');
    if (!body.includes('name="email"')) reasons.push('email_intake_missing');
    if (offer.slug === 'website-audit' && !body.includes('name="audit_site_url" type="url"')) reasons.push('website_audit_https_target_missing');
    if (!body.includes('Continue to secure checkout')) reasons.push('checkout_action_missing');
    if (!body.includes('$' + (offer.amount_cents / 100).toLocaleString('en-US'))) reasons.push('expected_price_missing');
    return { slug: offer.slug, ok: reasons.length === 0, http_status: response.status, duration_ms: Date.now() - time, reasons };
  } catch (error) {
    return { slug: offer.slug, ok: false, http_status: null, duration_ms: Date.now() - time, reasons: [String(error?.name || 'request_error')] };
  }
}

// A payment return without Stripe session/order evidence must fail closed.
// GET only: no provider charge and no payment order creation.
async function inspectIncompleteReturn() {
  const url = new URL(offers[0].buyer_url);
  url.searchParams.set('payment', 'processing');
  const time = Date.now();
  try {
    const response = await fetch(url, {
      method: 'GET', redirect: 'error',
      headers: { accept: 'text/html', 'user-agent': 'Evercraft-Payments-BuyerDoor-ReadOnly/1.0' },
      signal: AbortSignal.timeout(12000),
    });
    const body = (await response.text()).slice(0, 250000);
    const reasons = [];
    if (response.status !== 400) reasons.push('unattributed_checkout_return_not_rejected');
    if (body.includes('<form method="post"')) reasons.push('double_charge_form_on_unverified_return');
    if (!body.includes('Do not pay twice')) reasons.push('missing_safe_buyer_guidance');
    return { ok: reasons.length === 0, status: response.status, duration_ms: Date.now() - time, reasons };
  } catch (error) {
    return { ok: false, status: null, duration_ms: Date.now() - time, reasons: [String(error?.name || 'return_read_error')] };
  }
}

const findings = [];
for (let index = 0; index < offers.length; index += 4) {
  findings.push(...await Promise.all(offers.slice(index, index + 4).map(inspect)));
}
const returnGate = await inspectIncompleteReturn();
const passed = findings.filter(x => x.ok).length;
const output = {
  schema: 'evercraft.payments.read-only-buyer-canary.v1',
  observed_at: new Date().toISOString(),
  action: 'http_get_only',
  no_checkout_created: true,
  no_payment_attempted: true,
  tested: findings.length,
  passed,
  failed: findings.length - passed,
  findings,
  incomplete_return_gate: returnGate,
  caveat: 'Buyer-page availability does not prove POST checkout, provider settlement, canonical paid receipt, fulfillment, or customer acceptance.',
};
console.log(JSON.stringify(output, null, 2));
if (passed !== offers.length || !returnGate.ok) process.exitCode = 1;
