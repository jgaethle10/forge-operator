import fs from 'node:fs';
import path from 'node:path';

const LIVE_CATALOG_URL =
  process.env.EVERCRAFT_MACHINE_CATALOG_URL ||
  'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway?action=catalog';
const OUTPUT = 'public/.well-known/evercraft-machine-catalog.json';
const ROUTING_OUTPUT = 'public/.well-known/evercraft-offers.json';
const TIMEOUT_MS = 20000;

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
  return {
    public_id: String(offer.public_id || ''),
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
    public_url: String(offer.public_url || ''),
    payment_authority: String(offer.payment_authority || ''),
    invocation_status: String(offer.invocation_status || ''),
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

const offers = live.offers.map(publicOffer).filter((x) => x.public_id && x.name).sort((a,b) => a.public_id.localeCompare(b.public_id));
const next = {
  schema: 'evercraft.machine-catalog.snapshot.v1',
  provider: 'Evercraft LLC',
  purpose: 'Public-safe snapshot of the canonical Evercraft machine-commerce catalog for AI/search/agent discovery. This file grants no private access and creates no payment authority.',
  source_url: LIVE_CATALOG_URL,
  source_schema_version: String(live.schema_version || ''),
  gateway_version: String(live.gateway_version || ''),
  source_generated_at: String(live.generated_at || ''),
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

// Refresh CHUM's stable product-key bindings from the live public catalog.
let routing = null;
if (fs.existsSync(ROUTING_OUTPUT)) {
  try { routing = JSON.parse(fs.readFileSync(ROUTING_OUTPUT, 'utf8')); } catch {}
}
if (routing && Array.isArray(routing.offers)) {
  const liveById = new Map(offers.map((offer) => [offer.public_id, offer]));
  const boundIds = new Set();
  const refreshed = routing.offers.map((bound) => {
    const liveOffer = liveById.get(String(bound.public_id || ''));
    if (!liveOffer) return bound;
    boundIds.add(liveOffer.public_id);
    return {
      ...bound,
      name: liveOffer.name || bound.name,
      problem: liveOffer.problem || bound.problem,
      intent_terms: liveOffer.intent_terms || bound.intent_terms,
      commercial_state: liveOffer.commercial_state || bound.commercial_state,
      machine_state: liveOffer.machine_state || bound.machine_state,
      pricing: liveOffer.pricing || bound.pricing,
      offers: liveOffer.offers || bound.offers,
      confirmation: liveOffer.confirmation || bound.confirmation,
      public_url: liveOffer.public_url || bound.public_url,
      payment_authority: liveOffer.payment_authority || bound.payment_authority,
      invocation_status: liveOffer.invocation_status || bound.invocation_status,
      catalog_version: liveOffer.catalog_version || bound.catalog_version
    };
  });
  const unboundPublicIds = offers.map((offer) => offer.public_id).filter((id) => !boundIds.has(id));
  const routingNext = {
    ...routing,
    updated_at: new Date().toISOString(),
    source: {
      kind: 'live_machine_commerce_catalog',
      url: LIVE_CATALOG_URL,
      source_schema_version: String(live.schema_version || ''),
      gateway_version: String(live.gateway_version || '')
    },
    rules: {
      ...(routing.rules || {}),
      discovery_creates_payment_obligation: false,
      explicit_human_confirmation_required_before_checkout: true,
      checkout_is_payment_proof: false,
      paid_fulfillment_requires_provider_verification: true,
      quote_ready_is_not_payment_ready: true
    },
    offers: refreshed,
    unbound_live_public_ids: unboundPublicIds
  };
  fs.writeFileSync(ROUTING_OUTPUT, JSON.stringify(routingNext, null, 2) + '\n');
}

let current = null;
if (fs.existsSync(OUTPUT)) {
  try { current = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch {}
}
if (current && JSON.stringify(semanticSnapshot(current)) === JSON.stringify(semanticSnapshot(next))) {
  console.log(JSON.stringify({ changed:false, offer_count:offers.length, sell_now_count:next.sell_now_count, output:OUTPUT, routing_output:ROUTING_OUTPUT, unbound_live_public_ids:routing?.unbound_live_public_ids || [] }));
} else {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive:true });
  fs.writeFileSync(OUTPUT, JSON.stringify(next,null,2) + '\n');
  console.log(JSON.stringify({ changed:true, offer_count:offers.length, sell_now_count:next.sell_now_count, output:OUTPUT, routing_output:ROUTING_OUTPUT }));
}
