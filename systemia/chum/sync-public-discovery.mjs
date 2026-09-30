import fs from 'node:fs';
import path from 'node:path';
import { mergeMachineOfferSources } from './owned-machine-offers.mjs';

const LIVE_CATALOG_URL =
  process.env.EVERCRAFT_MACHINE_CATALOG_URL ||
  'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway?action=catalog';
const OUTPUT = 'public/.well-known/evercraft-machine-catalog.json';
const MACHINE_COMMERCE_GATEWAY_URL =
  process.env.EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL ||
  LIVE_CATALOG_URL.split('?', 1)[0];
const TIMEOUT_MS = 20000;
const CONFORMANCE_PATH = 'conformance/products.json';
const OWNED_OFFERS_PATH = process.env.EVERCRAFT_OWNED_MACHINE_OFFERS_PATH || 'registry/owned-machine-offers.json';
const conformance = fs.existsSync(CONFORMANCE_PATH)
  ? JSON.parse(fs.readFileSync(CONFORMANCE_PATH, 'utf8'))
  : { products: [] };
const conformanceByCapabilityId = new Map(
  (conformance.products || [])
    .filter((product) => product?.machine_commerce_public_id)
    .map((product) => [String(product.machine_commerce_public_id), product])
);

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

function publicOffer(offer, sourceAuthority = 'remote_legacy_catalog') {
  const publicId = String(offer.public_id || '');
  const productConformance = conformanceByCapabilityId.get(publicId) || null;
  const liveCanaryEvidence = String(
    offer?.live_canary_evidence || productConformance?.live_canary_evidence || ''
  ).trim() || null;
  const sourcePublicUrl = String(offer.public_url || '').trim();
  const fallbackPublicUrl = publicId
    ? `${MACHINE_COMMERCE_GATEWAY_URL}?view=service&public_id=${encodeURIComponent(publicId)}`
    : '';
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
      ? (sourceAuthority === 'forge_owned_source' ? 'forge_owned_registry' : 'source_catalog')
      : 'machine_commerce_review_fallback',
    source_authority: sourceAuthority,
    payment_authority: String(offer.payment_authority || ''),
    invocation_status: String(offer.invocation_status || ''),
    live_canary_evidence: liveCanaryEvidence,
    catalog_version: String(offer.catalog_version || '')
  };
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
let response;
try {
  response = await fetch(LIVE_CATALOG_URL, {
    headers: { accept: 'application/json', 'user-agent': 'Evercraft-CHUM/0.2 (+public-catalog-sync)' },
    signal: controller.signal
  });
} finally {
  clearTimeout(timer);
}
if (!response.ok) throw new Error(`Live catalog returned HTTP ${response.status}`);
const live = await response.json();
if (live?.ok !== true || !Array.isArray(live?.offers)) throw new Error('Live catalog response is not a valid Evercraft public catalog.');

const ownedRegistry = fs.existsSync(OWNED_OFFERS_PATH)
  ? JSON.parse(fs.readFileSync(OWNED_OFFERS_PATH, 'utf8'))
  : { schema:'evercraft.owned-machine-offers.v1', authority:'forge_owned_source', offers:[] };
const mergeReceipt = mergeMachineOfferSources(live.offers, ownedRegistry);
const offers = mergeReceipt.offers
  .map((row) => publicOffer(row.offer, row.source_authority))
  .filter((x) => x.public_id && x.name)
  .sort((a,b) => a.public_id.localeCompare(b.public_id));

const next = {
  schema: 'evercraft.machine-catalog.snapshot.v1',
  provider: 'Evercraft LLC',
  purpose: 'Public-safe snapshot of the canonical Evercraft machine-commerce catalog for AI/search/agent discovery. This file grants no private access and creates no payment authority.',
  source_url: LIVE_CATALOG_URL,
  source_schema_version: String(live.schema_version || ''),
  gateway_version: String(live.gateway_version || ''),
  source_generated_at: String(live.generated_at || ''),
  catalog_authority: 'remote_legacy_plus_forge_owned',
  owned_offer_registry: OWNED_OFFERS_PATH,
  source_merge: {
    remote_offer_count: mergeReceipt.remote_offer_count,
    owned_offer_count: mergeReceipt.owned_offer_count,
    owned_added_count: mergeReceipt.owned_added_count,
    owned_override_count: mergeReceipt.owned_override_count
  },
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
    ...(live.safety && typeof live.safety === 'object' ? live.safety : {})
  },
  offers
};

let current = null;
if (fs.existsSync(OUTPUT)) {
  try { current = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch {}
}
if (current && JSON.stringify(semanticSnapshot(current)) === JSON.stringify(semanticSnapshot(next))) {
  console.log(JSON.stringify({ changed:false, offer_count:offers.length, sell_now_count:next.sell_now_count, owned_offer_count:mergeReceipt.owned_offer_count, output:OUTPUT }));
} else {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive:true });
  fs.writeFileSync(OUTPUT, JSON.stringify(next,null,2) + '\n');
  console.log(JSON.stringify({ changed:true, offer_count:offers.length, sell_now_count:next.sell_now_count, owned_offer_count:mergeReceipt.owned_offer_count, output:OUTPUT }));
}
