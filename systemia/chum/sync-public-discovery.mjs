import fs from 'node:fs';
import path from 'node:path';

const CONFIGURED_CATALOG_URL = String(process.env.EVERCRAFT_MACHINE_CATALOG_URL || '').trim();
const CONFIGURED_GATEWAY_URL = String(process.env.EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL || '').trim();
const OUTPUT = 'public/.well-known/evercraft-machine-catalog.json';
const TIMEOUT_MS = 20000;
const CONFORMANCE_PATH = 'conformance/products.json';

const conformance = fs.existsSync(CONFORMANCE_PATH)
  ? JSON.parse(fs.readFileSync(CONFORMANCE_PATH, 'utf8'))
  : { products: [] };
const conformanceByCapabilityId = new Map(
  (conformance.products || [])
    .filter((product) => product?.machine_commerce_public_id)
    .map((product) => [String(product.machine_commerce_public_id), product])
);

function isLegacyProviderUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase();
    return host === 'base44.app' || host.endsWith('.base44.app');
  } catch {
    return false;
  }
}

function safeHttps(value) {
  const raw = String(value || '').trim();
  if (!raw || isLegacyProviderUrl(raw)) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

if (CONFIGURED_CATALOG_URL && !safeHttps(CONFIGURED_CATALOG_URL)) {
  throw new Error('EVERCRAFT_MACHINE_CATALOG_URL must be an Evercraft-owned HTTPS endpoint.');
}
if (CONFIGURED_GATEWAY_URL && !safeHttps(CONFIGURED_GATEWAY_URL)) {
  throw new Error('EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL must be an Evercraft-owned HTTPS endpoint.');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k, stable(v)]));
  }
  return value;
}

function semanticSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const { generated_at, source_generated_at, ...rest } = snapshot;
  return stable(rest);
}

function publicOffer(offer) {
  const publicId = String(offer.public_id || '');
  const productConformance = conformanceByCapabilityId.get(publicId) || null;
  const liveCanaryEvidence = String(
    offer?.live_canary_evidence || productConformance?.live_canary_evidence || ''
  ).trim() || null;
  const sourcePublicUrl = safeHttps(offer.public_url);
  const gateway = safeHttps(CONFIGURED_GATEWAY_URL);
  const staticPublicUrl = publicId
    ? 'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/capabilities/'
      + encodeURIComponent(publicId)
      + '/index.html'
    : '';
  const fallbackPublicUrl = publicId && gateway
    ? gateway + (gateway.includes('?') ? '&' : '?') + 'view=service&public_id=' + encodeURIComponent(publicId)
    : staticPublicUrl;
  return {
    public_id: publicId,
    name: String(offer.name || ''),
    intent_terms: Array.isArray(offer.intent_terms) ? offer.intent_terms.map(String) : [],
    problem: String(offer.problem || ''),
    inputs: String(offer.inputs || ''),
    outputs: String(offer.outputs || ''),
    commercial_state: String(offer.commercial_state || ''),
    machine_state: String(offer.machine_state || ''),
    pricing: String(offer.pricing || ''),
    offers: Array.isArray(offer.offers) ? offer.offers : [],
    human_ui_required: Boolean(offer.human_ui_required),
    confirmation: String(offer.confirmation || ''),
    public_url: sourcePublicUrl || fallbackPublicUrl,
    public_url_source: sourcePublicUrl
      ? 'source_catalog'
      : (gateway ? 'owned_gateway_fallback' : (staticPublicUrl ? 'owned_static_capability_page' : 'held_no_owned_public_url')),
    payment_authority: String(offer.payment_authority || ''),
    invocation_status: String(offer.invocation_status || ''),
    live_canary_evidence: liveCanaryEvidence,
    catalog_version: String(offer.catalog_version || '')
  };
}

let current = null;
if (fs.existsSync(OUTPUT)) {
  try { current = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch {}
}

let live = null;
if (CONFIGURED_CATALOG_URL) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(CONFIGURED_CATALOG_URL, {
      headers: { accept: 'application/json', 'user-agent': 'Evercraft-CHUM/0.3 (+owned-catalog-sync)' },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error('Owned catalog returned HTTP ' + response.status);
  live = await response.json();
  if (live?.ok !== true || !Array.isArray(live?.offers)) {
    throw new Error('Owned catalog response is not a valid Evercraft public catalog.');
  }
}

const sourceOffers = live?.offers || current?.offers || [];
if (!Array.isArray(sourceOffers)) throw new Error('No safe catalog snapshot is available.');

const offers = sourceOffers
  .map(publicOffer)
  .filter((x) => x.public_id && x.name)
  .sort((a,b) => a.public_id.localeCompare(b.public_id));

const next = {
  schema: 'evercraft.machine-catalog.snapshot.v1',
  provider: 'Evercraft LLC',
  purpose: 'Public-safe snapshot of the canonical Evercraft machine-commerce catalog for AI/search/agent discovery. This file grants no private access and creates no payment authority.',
  source_url: live ? safeHttps(CONFIGURED_CATALOG_URL) : null,
  source_state: live ? 'owned_runtime_live' : 'owned_runtime_unbound_snapshot_sanitized',
  source_schema_version: String(live?.schema_version || current?.source_schema_version || ''),
  gateway_version: String(live?.gateway_version || current?.gateway_version || ''),
  source_generated_at: String(live?.generated_at || current?.source_generated_at || ''),
  generated_at: new Date().toISOString(),
  offer_count: offers.length,
  sell_now_count: offers.filter((x) => x.commercial_state === 'sell_now').length,
  discovery_count: offers.filter((x) => x.commercial_state !== 'sell_now').length,
  safety: {
    discovery_creates_obligation: false,
    human_confirmation_required_for_checkout: true,
    checkout_is_payment_proof: false,
    provider_verification_required_for_paid_state: true,
    private_topology_exposed: false,
    legacy_provider_runtime_allowed: false,
    ...((live?.safety && typeof live.safety === 'object') ? live.safety : {})
  },
  offers
};

if (current && JSON.stringify(semanticSnapshot(current)) === JSON.stringify(semanticSnapshot(next))) {
  console.log(JSON.stringify({ changed:false, offer_count:offers.length, sell_now_count:next.sell_now_count, output:OUTPUT }));
} else {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive:true });
  fs.writeFileSync(OUTPUT, JSON.stringify(next,null,2) + '\n');
  console.log(JSON.stringify({ changed:true, offer_count:offers.length, sell_now_count:next.sell_now_count, output:OUTPUT }));
}
