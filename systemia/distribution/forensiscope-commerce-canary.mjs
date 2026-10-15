/**
 * ForensiScope Ship -> Evercraft Payments customer-readiness observer.
 * Read-only: no checkout creation, payment, lead submission, or customer file upload.
 * HTTP 200 is not proof the requested application asset exists.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const CONFIG = Object.freeze({
  ship: 'https://evercraft-forensiscope.base44.app/ship',
  parcel: 'https://evercraft-forensiscope.base44.app/parcel-desk.html',
  payment: 'https://base44.app/api/apps/692536fdd7bfe083fc4086fa/functions/evercraftPaymentsOps',
  paymentOffer: 'workflow_foundry.xray_250.v1',
});

const cleanError = (err) => err instanceof Error ? err.name : 'UnknownError';
const flags = (values) => [...new Set(values)];
const timeoutMs = 12000;

export function classifyShipDocument(response) {
  const failures = [];
  if (response.status !== 200) failures.push(`ship_http_${response.status}`);
  if (!/^text\/html\b/i.test(response.contentType)) failures.push('ship_wrong_content_type');
  const match = response.body.match(/<script\b[^>]*\bsrc=["'](\/assets\/index-[^"']+\.js)["']/i);
  if (!match) failures.push('ship_app_bundle_not_found');
  return { ok: failures.length === 0, failures, assetPath: match?.[1] || null };
}

export function classifyShipBundle(response) {
  const failures = [];
  if (response.status !== 200) failures.push(`ship_bundle_http_${response.status}`);
  if (!/\b(javascript|ecmascript)\b/i.test(response.contentType)) failures.push('ship_bundle_wrong_content_type');
  for (const phrase of ['Your file is too big.', 'Tap the problem you recognize.', 'Open exact-byte Parcel Desk', 'Request a scoped delivery pilot']) {
    if (!response.body.includes(phrase)) failures.push(`ship_bundle_missing:${phrase}`);
  }
  return { ok: failures.length === 0, failures };
}

export function classifyParcelDocument(response) {
  const failures = [];
  if (response.status !== 200) failures.push(`parcel_http_${response.status}`);
  if (!/^text\/html\b/i.test(response.contentType)) failures.push('parcel_wrong_content_type');
  // The code's own production release preflight uses this exact Parcel Desk version marker.
  if (!response.body.includes('evercraft-parcel-v0.1')) failures.push('parcel_actual_tool_missing_spa_fallback');
  return { ok: failures.length === 0, failures };
}

export function classifyPaymentQuote(response) {
  const failures = [];
  if (response.status !== 200) failures.push(`payment_quote_http_${response.status}`);
  let data;
  try { data = JSON.parse(response.body); } catch { failures.push('payment_quote_not_json'); }
  if (!data?.ok || data?.offer?.offer_key !== CONFIG.paymentOffer) failures.push('payment_quote_wrong_offer');
  if (data?.offer?.product_key !== 'workflow-foundry' || data?.offer?.amount_cents !== 25000 || String(data?.offer?.currency).toLowerCase() !== 'usd') failures.push('payment_quote_contract_mismatch');
  if (data?.fulfillment?.ready !== true || !data?.fulfillment?.contract_key) failures.push('payment_fulfillment_contract_not_ready');
  return { ok: failures.length === 0, failures, offer_key: CONFIG.paymentOffer, amount_cents: data?.offer?.amount_cents ?? null, fulfillment_ready: data?.fulfillment?.ready === true };
}

async function request(fetchImpl, url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, redirect: 'follow', signal: controller.signal });
    return { status: response.status, contentType: response.headers.get('content-type') || '', body: await response.text() };
  } catch (error) {
    return { status: 0, contentType: '', body: '', transportError: cleanError(error) };
  } finally { clearTimeout(timer); }
}

export async function runCanary(fetchImpl = fetch, now = new Date()) {
  const [shipDoc, parcelDoc, paymentDoc] = await Promise.all([
    request(fetchImpl, CONFIG.ship, { method: 'GET' }),
    request(fetchImpl, CONFIG.parcel, { method: 'GET' }),
    request(fetchImpl, CONFIG.payment, {
      method: 'POST', // read-only quote action, never create_checkout
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'quote', offer_key: CONFIG.paymentOffer }),
    }),
  ]);
  const ship = classifyShipDocument(shipDoc);
  const bundleDoc = ship.assetPath ? await request(fetchImpl, new URL(ship.assetPath, CONFIG.ship).href, { method: 'GET' }) : { status: 0, contentType: '', body: '' };
  const bundle = classifyShipBundle(bundleDoc);
  const parcel = classifyParcelDocument(parcelDoc);
  const payment = classifyPaymentQuote(paymentDoc);
  const failures = flags([...ship.failures, ...bundle.failures, ...parcel.failures, ...payment.failures, ...[shipDoc, bundleDoc, parcelDoc, paymentDoc].flatMap(x => x.transportError ? [`transport_${x.transportError}`] : [])]);
  return {
    schema: 'evercraft.distribution.forensiscope-commerce-canary.v1',
    checked_at: now.toISOString(),
    mode: 'read_only_external_observation',
    source_app: 'ForensiScope',
    // GREEN means only public demo and an unrelated diagnostic quote are retrievable.
    status: failures.length ? 'BLOCKED' : 'SURFACES_READABLE_PAYMENT_QUOTE_READY',
    checks: {
      ship_document: { valid: ship.ok, http: shipDoc.status, asset_path: ship.assetPath },
      ship_bundle: { valid: bundle.ok, http: bundleDoc.status },
      parcel_desk: { valid: parcel.ok, http: parcelDoc.status },
      existing_workflow_xray_quote: { valid: payment.ok, http: paymentDoc.status, amount_cents: payment.amount_cents, fulfillment_ready: payment.fulfillment_ready },
    },
    failures,
    unverified: ['public_production_publisher_revision', 'independent_external_buyer_comprehension', 'recipient_exact_byte_receive_and_sha256', 'delivery_rescue_pricing_and_offer_contract', 'provider_verified_paid_receipt', 'systemia_shipping_release', 'outbound_authorization'],
    customer_ready: false,
    revenue_verified: false,
    recipient_delivery_verified: false,
    public_distribution_authorized: false,
  };
}

async function main() {
  const strict = process.argv.includes('--strict');
  const receipt = await runCanary();
  const output = process.env.EVERCRAFT_CANARY_OUT || 'artifacts/distribution/forensiscope-commerce-canary.json';
  await mkdir(output.slice(0, output.lastIndexOf('/')) || '.', { recursive: true });
  await writeFile(output, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
  if (strict && receipt.status === 'BLOCKED') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {console.error(`Canary failed: ${cleanError(error)}`);process.exitCode=1;});
