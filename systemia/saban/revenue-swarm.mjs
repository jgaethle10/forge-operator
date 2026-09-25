#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const emit = args.has('--emit');
const strict = args.has('--strict');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 120);

function priceUsd(tier) {
  const direct = Number(tier?.price_usd);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = String(tier?.price || '').match(/\$([0-9][0-9,]*(?:\.[0-9]+)?)/);
  if (!match) return null;
  const n = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function entryPrice(offer) {
  const prices = (Array.isArray(offer?.offers) ? offer.offers : [])
    .map(priceUsd)
    .filter((n) => Number.isFinite(n))
    .sort((a,b) => a-b);
  if (prices.length) return prices[0];
  const fallback = String(offer?.pricing || '').match(/\$([0-9][0-9,]*(?:\.[0-9]+)?)/);
  return fallback ? Number(fallback[1].replace(/,/g, '')) : null;
}

const catalog = readJson('public/.well-known/evercraft-machine-catalog.json');
const revenue = readJson('public/chum/revenue.json');
const sellNow = (catalog.offers || []).filter((offer) => offer.commercial_state === 'sell_now');
const revenueById = new Map((revenue.offers || []).map((offer) => [offer.public_id, offer]));

const productResults = [];
let logicalAgents = 0;

for (const offer of sellNow) {
  const slug = slugify(offer.public_id);
  const pagePath = path.join('public','chum','intents',slug,'index.html');
  const offerPath = path.join('public','chum','intents',slug,'offer.json');
  const llmsPath = path.join('public','chum','intents',slug,'llms.txt');
  const page = fs.existsSync(pagePath) ? fs.readFileSync(pagePath,'utf8') : '';
  const door = fs.existsSync(offerPath) ? readJson(offerPath) : null;
  const llms = fs.existsSync(llmsPath) ? fs.readFileSync(llmsPath,'utf8') : '';
  const revenueOffer = revenueById.get(offer.public_id) || null;
  const expectedStart = '/api/chum/go/' + encodeURIComponent(String(offer.public_id)) + '?surface=chum_pain_page';

  const checks = {
    catalog_sell_now: offer.commercial_state === 'sell_now',
    priced: Number.isFinite(entryPrice(offer)),
    payment_authority_declared:
      Boolean(String(offer.payment_authority || '').trim()) &&
      !/no verified|not exposed|none/i.test(String(offer.payment_authority || '')),
    actionable_machine_state: /payment_ready|human_handoff_ready/i.test(String(offer.machine_state || '')),
    revenue_indexed: Boolean(revenueOffer),
    attributed_start_url: revenueOffer?.start_url === expectedStart,
    pain_page_exists: Boolean(page),
    pain_page_start_cta: page.includes(expectedStart) && /Start here/i.test(page),
    pain_door_json_start_url: door?.start_url === expectedStart,
    llms_start_url: llms.includes(expectedStart),
  };

  const intentTerms = Array.isArray(offer.intent_terms) && offer.intent_terms.length ? offer.intent_terms : [''];
  const agents = intentTerms.map((intent, index) => ({
    agent_id: `${offer.public_id}:intent:${index + 1}`,
    role: 'buyer-path verifier',
    intent,
    route: expectedStart,
    pass: Object.values(checks).every(Boolean),
  }));
  logicalAgents += agents.length + 1;

  const missing = Object.entries(checks).filter(([,ok]) => !ok).map(([key]) => key);
  productResults.push({
    public_id: offer.public_id,
    name: offer.name,
    entry_price_usd: entryPrice(offer),
    machine_state: offer.machine_state,
    intent_agents: agents.length,
    checks,
    status: missing.length ? 'repair_needed' : 'conversion_corridor_ready',
    missing,
  });
}

const broken = productResults.filter((item) => item.status !== 'conversion_corridor_ready');
const ready = productResults.filter((item) => item.status === 'conversion_corridor_ready');
const fastCash = [...ready]
  .filter((item) => Number.isFinite(item.entry_price_usd))
  .sort((a,b) => a.entry_price_usd - b.entry_price_usd)
  .slice(0, 8)
  .map((item) => ({
    public_id:item.public_id,
    name:item.name,
    entry_price_usd:item.entry_price_usd,
  }));

const receipt = {
  schema:'evercraft.saban.revenue-swarm.v1',
  generated_at:new Date().toISOString(),
  doctrine:{
    outbound_spam:false,
    buyer_intent_first:true,
    sell_now_only_for_start_corridors:true,
    attribution_before_payment_claims:true,
    checkout_is_not_payment:true,
    verified_revenue_requires_authoritative_payment_evidence:true,
  },
  summary:{
    sell_now_offers:sellNow.length,
    logical_agents:logicalAgents,
    conversion_corridors_ready:ready.length,
    repair_needed:broken.length,
  },
  fast_cash_candidates:fastCash,
  repair_queue:broken.map(({public_id,name,missing}) => ({public_id,name,missing})),
  products:productResults,
};

console.log(JSON.stringify(receipt.summary));

if (emit) {
  fs.mkdirSync('artifacts/saban-revenue',{recursive:true});
  fs.writeFileSync('artifacts/saban-revenue/latest.json',JSON.stringify(receipt,null,2)+'\n');
  const md=[
    '# Saban Revenue Swarm',
    '',
    `Generated: ${receipt.generated_at}`,
    `Sell-now offers: ${receipt.summary.sell_now_offers}`,
    `Logical agents: ${receipt.summary.logical_agents}`,
    `Ready corridors: ${receipt.summary.conversion_corridors_ready}`,
    `Repair needed: ${receipt.summary.repair_needed}`,
    '',
    '> This swarm does not send outreach. It verifies inbound discovery-to-conversion paths and never treats checkout as payment.',
    '',
    '## Fast-cash corridor',
    '',
    ...fastCash.map((item) => `- ${item.name}: entry ${item.entry_price_usd.toLocaleString('en-US',{style:'currency',currency:'USD'})}`),
    '',
    '## Repair queue',
    '',
    ...(broken.length ? broken.map((item) => `- ${item.name}: ${item.missing.join(', ')}`) : ['- No broken sell-now corridors detected.']),
    '',
  ];
  fs.writeFileSync('artifacts/saban-revenue/latest.md',md.join('\n'));
}

if (strict && broken.length) {
  throw new Error(`Saban revenue swarm found ${broken.length} broken sell-now conversion corridor(s).`);
}
