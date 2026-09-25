import fs from 'node:fs';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const fail = (m) => { throw new Error(m); };

const machine = readJson('public/.well-known/evercraft-machine-catalog.json');
const capabilities = readJson('public/chum/capabilities.json');
const sellNow = readJson('public/chum/sell-now.json');
const sellNowText = fs.readFileSync('public/chum/sell-now.txt', 'utf8');

const canonical = (machine.offers || []).filter((x) => x?.public_id && x?.name);
const canonicalSellNow = canonical.filter((x) => x.commercial_state === 'sell_now');

if (capabilities.schema !== 'evercraft.chum.capabilities.v1') fail('unexpected capabilities schema');
if (sellNow.schema !== 'evercraft.chum.sell-now.v1') fail('unexpected sell-now schema');
if (capabilities.count !== canonical.length) fail(`capability count mismatch: ${capabilities.count} != ${canonical.length}`);
if (sellNow.count !== canonicalSellNow.length) fail(`sell-now count mismatch: ${sellNow.count} != ${canonicalSellNow.length}`);
if ((capabilities.capabilities || []).length !== canonical.length) fail('capabilities array length mismatch');
if ((sellNow.offers || []).length !== canonicalSellNow.length) fail('sell-now array length mismatch');

const capabilityIds = new Set((capabilities.capabilities || []).map((x) => x.public_id));
const sellNowIds = new Set((sellNow.offers || []).map((x) => x.public_id));

for (const offer of canonical) {
  if (!capabilityIds.has(offer.public_id)) fail(`missing capability: ${offer.public_id}`);
}
for (const offer of canonicalSellNow) {
  if (!sellNowIds.has(offer.public_id)) fail(`missing sell-now offer: ${offer.public_id}`);
  if (!sellNowText.includes(offer.name)) fail(`sell-now text missing offer name: ${offer.name}`);
  const compact = (sellNow.offers || []).find((x) => x.public_id === offer.public_id);
  if (!compact) fail(`missing compact sell-now offer: ${offer.public_id}`);
  if (JSON.stringify(compact.offers || []) !== JSON.stringify(offer.offers || [])) {
    fail(`structured tier mismatch: ${offer.public_id}`);
  }
  const canonicalPaidTiers = (offer.offers || []).filter((tier) => {
    const numeric = Number(tier?.price_usd);
    if (Number.isFinite(numeric) && numeric > 0) return true;
    const raw = String(tier?.price || '');
    const match = raw.match(/^\$([0-9][0-9,]*(?:\.[0-9]+)?)/);
    return Boolean(match && Number(match[1].replace(/,/g,'')) > 0);
  });
  if (canonicalPaidTiers.length && !compact.entry_paid_offer) {
    fail(`sell-now offer missing entry_paid_offer: ${offer.public_id}`);
  }
  let start;
  try { start = new URL(String(compact.start_url || '')); }
  catch { fail(`sell-now offer missing public Start URL: ${offer.public_id}`); }
  if (start.protocol !== 'https:') fail(`sell-now Start URL must use HTTPS: ${offer.public_id}`);
  if (start.hostname !== 'evercraft-ai-suite-08c4d2b8.base44.app') {
    fail(`sell-now Start URL must use the live Machine Commerce host: ${offer.public_id}`);
  }
  if (!start.pathname.endsWith('/functions/machineCommerceGateway')) {
    fail(`sell-now Start URL must use Machine Commerce gateway: ${offer.public_id}`);
  }
  if (start.searchParams.get('view') !== 'service') fail(`sell-now Start URL missing service view: ${offer.public_id}`);
  if (start.searchParams.get('public_id') !== offer.public_id) fail(`sell-now Start URL public_id mismatch: ${offer.public_id}`);
  if (start.searchParams.get('ec_source') !== 'chum') fail(`sell-now Start URL missing CHUM source: ${offer.public_id}`);
  if (start.searchParams.get('ec_surface') !== 'chum_pain_page') fail(`sell-now Start URL missing pain-page surface: ${offer.public_id}`);

  const slug = String(offer.public_id || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  const painPagePath = `public/chum/intents/${slug}/index.html`;
  if (!fs.existsSync(painPagePath)) fail(`sell-now pain page missing: ${offer.public_id}`);
  const painPage = fs.readFileSync(painPagePath, 'utf8');
  if (!painPage.includes('Start here')) fail(`sell-now pain page missing Start CTA: ${offer.public_id}`);
  if (canonicalPaidTiers.length && !painPage.includes('Easiest paid entry:')) {
    fail(`sell-now pain page missing entry offer: ${offer.public_id}`);
  }
}
for (const offer of sellNow.offers || []) {
  if (offer.commercial_state !== 'sell_now') fail(`non-sell-now offer leaked into sell-now directory: ${offer.public_id}`);
  if (!String(offer.problem || '').trim()) fail(`sell-now offer missing problem: ${offer.public_id}`);
  if (!String(offer.pricing || '').trim()) fail(`sell-now offer missing pricing: ${offer.public_id}`);
  if (!Array.isArray(offer.intent_terms) || offer.intent_terms.length < 1) fail(`sell-now offer missing intent language: ${offer.public_id}`);
  if (!String(offer.public_url || '').startsWith('http')) fail(`sell-now offer missing public URL: ${offer.public_id}`);
}

console.log(JSON.stringify({
  ok: true,
  capabilities: capabilities.count,
  sell_now: sellNow.count,
  compact_doors: [
    'public/chum/capabilities.json',
    'public/chum/sell-now.json',
    'public/chum/sell-now.txt'
  ]
}));
