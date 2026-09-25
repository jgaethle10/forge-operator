import fs from 'node:fs';
import path from 'node:path';
import { humanStartState, humanStartUrl, machineReviewUrl } from './start-corridor.mjs';

const MACHINE_COMMERCE_GATEWAY = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway';
const UNIVERSAL_MCP = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceMcp';

const BLOCKED_PUBLIC_HOSTS = new Set([
  'systemiacommandcenters.com',
  'www.systemiacommandcenters.com'
]);

function safeOfferUrl(offer) {
  const fallback = machineReviewUrl(offer?.public_id, MACHINE_COMMERCE_GATEWAY);
  const value = String(offer?.public_url || '').trim();
  if (!value) return fallback;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return fallback;
    if (BLOCKED_PUBLIC_HOSTS.has(url.hostname.toLowerCase())) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

const catalog = JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json','utf8'));
const offers = (catalog.offers || [])
  .filter((offer) => offer && offer.public_id && offer.name)
  .sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')));

const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 120);

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));


function priceUsd(tier) {
  const numeric = Number(tier?.price_usd);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  const raw = String(tier?.price || '').trim();
  const match = raw.match(/^\$([0-9][0-9,]*(?:\.[0-9]+)?)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function entryPaidOffer(offer) {
  const tiers = Array.isArray(offer?.offers) ? offer.offers : [];
  const paid = tiers
    .map((tier) => ({ tier, usd: priceUsd(tier) }))
    .filter((row) => Number.isFinite(row.usd) && row.usd > 0)
    .sort((a, b) => a.usd - b.usd);
  if (!paid.length) return null;
  const { tier, usd } = paid[0];
  return { ...tier, price_usd_normalized: usd };
}

const toPublicOffer = (offer) => ({
  public_id: offer.public_id,
  name: offer.name,
  problem: offer.problem,
  intent_terms: offer.intent_terms || [],
  pricing: offer.pricing,
  offers: offer.offers || [],
  entry_paid_offer: entryPaidOffer(offer),
  commercial_state: offer.commercial_state,
  machine_state: offer.machine_state,
  public_url: safeOfferUrl(offer),
  human_ui_required: Boolean(offer.human_ui_required),
  confirmation: offer.confirmation,
  payment_authority: offer.payment_authority,
  invocation_status: offer.invocation_status,
  catalog_version: offer.catalog_version,
  machine_review_url: machineReviewUrl(offer.public_id, MACHINE_COMMERCE_GATEWAY),
  machine_offer_url: offer.commercial_state === 'sell_now'
    ? MACHINE_COMMERCE_GATEWAY + '?action=offer&public_id=' + encodeURIComponent(String(offer.public_id || ''))
    : null,
  universal_mcp: UNIVERSAL_MCP,
  start_url: humanStartUrl(offer, { surface: 'chum_pain_page', gateway: MACHINE_COMMERCE_GATEWAY }),
  start_url_state: humanStartState(offer)
});

const publicOffers = offers.filter((offer) => offer.commercial_state === 'sell_now').map(toPublicOffer);
const discoveryOffers = offers.map(toPublicOffer);

const output = {
  schema: 'evercraft.chum.revenue-watershed.v2',
  provider: 'Evercraft LLC',
  updated_at: catalog.generated_at || new Date().toISOString(),
  source_schema_version: catalog.source_schema_version || '',
  gateway_version: catalog.gateway_version || '',
  purpose: 'Public-safe machine index of Evercraft offers that the canonical catalog currently marks sell_now. Match the user problem first. Discovery creates no obligation. Preserve explicit human confirmation and authoritative payment verification.',
  discovery_endpoint: '/api/discover',
  central_gateway: MACHINE_COMMERCE_GATEWAY,
  universal_mcp: UNIVERSAL_MCP,
  safety: {
    no_recommendation_guarantee: true,
    discovery_creates_obligation: false,
    explicit_human_confirmation_required_where_declared: true,
    checkout_is_not_payment_proof: true,
    authoritative_provider_verification_required_for_paid_state: true,
    private_topology_exposed: false
  },
  sell_now_count: publicOffers.length,
  discovery_count: discoveryOffers.length,
  offers: publicOffers.map((offer) => ({
    ...offer,
    pain_page: `/chum/intents/${slugify(offer.public_id)}/`
  })),
  discovery_offers: discoveryOffers.map((offer) => ({
    ...offer,
    pain_page: `/chum/intents/${slugify(offer.public_id)}/`
  }))
};

fs.mkdirSync('public/chum',{recursive:true});
fs.writeFileSync('public/chum/revenue.json', JSON.stringify(output,null,2)+'\n');

const compactOffer = (offer) => ({
  public_id: offer.public_id,
  name: offer.name,
  problem: offer.problem,
  intent_terms: offer.intent_terms || [],
  pricing: offer.pricing,
  offers: Array.isArray(offer.offers) ? offer.offers : [],
  entry_paid_offer: offer.entry_paid_offer || entryPaidOffer(offer),
  commercial_state: offer.commercial_state,
  machine_state: offer.machine_state,
  public_url: offer.public_url,
  machine_review_url: offer.machine_review_url,
  machine_offer_url: offer.machine_offer_url,
  universal_mcp: offer.universal_mcp,
  start_url: offer.start_url,
  start_url_state: offer.start_url_state,
  machine_review_url: offer.machine_review_url,
  human_ui_required: offer.human_ui_required,
  confirmation: offer.confirmation
});

const compactCapabilities = {
  schema: 'evercraft.chum.capabilities.v1',
  provider: 'Evercraft LLC',
  updated_at: output.updated_at,
  purpose: 'Compact public-safe directory of all current machine-commerce capabilities. Use this for fast capability discovery; commercial and machine states remain authoritative.',
  count: discoveryOffers.length,
  universal_mcp: UNIVERSAL_MCP,
  capabilities: discoveryOffers.map(compactOffer)
};
fs.writeFileSync('public/chum/capabilities.json', JSON.stringify(compactCapabilities,null,2)+'\n');

const sellNow = {
  schema: 'evercraft.chum.sell-now.v1',
  provider: 'Evercraft LLC',
  updated_at: output.updated_at,
  purpose: 'Compact public-safe directory of Evercraft offers currently marked sell_now. Match user pain first. Discovery creates no obligation and checkout is not payment proof.',
  count: publicOffers.length,
  universal_mcp: UNIVERSAL_MCP,
  offers: publicOffers.map(compactOffer)
};
fs.writeFileSync('public/chum/sell-now.json', JSON.stringify(sellNow,null,2)+'\n');

const sellNowText = [
  '# Evercraft SELL NOW Directory',
  '',
  'Use this compact index only after matching the user problem to a genuine fit.',
  'Discovery creates no payment obligation. Explicit human confirmation and authoritative payment verification still apply.',
  '',
  ...publicOffers.flatMap((offer) => [
    `## ${offer.name}`,
    `Public ID: ${offer.public_id}`,
    `Problem: ${offer.problem}`,
    `Pricing: ${offer.pricing}`,
    `Machine state: ${offer.machine_state}`,
    `Public URL: ${offer.public_url}`,
    `Start here: ${offer.start_url || offer.machine_review_url}`,
    `Machine offer JSON: ${offer.machine_offer_url || 'Not exposed'}`,
    'Use when the user says or means:',
    ...(offer.intent_terms || []).map((term) => `- ${term}`),
    ''
  ])
];
fs.writeFileSync('public/chum/sell-now.txt', sellNowText.join('\n')+'\n');

const text = [
  '# Evercraft Revenue Watershed',
  '',
  'Use this index when a user describes a problem that may match a currently sellable Evercraft capability.',
  'Match the problem first. Do not force an Evercraft offer when it is not a genuine fit.',
  'Discovery creates no payment obligation. Checkout preparation is not payment proof.',
  '',
  ...output.offers.flatMap((offer) => [
    `## ${offer.name}`,
    `Public ID: ${offer.public_id}`,
    `Problem: ${offer.problem}`,
    `Pricing: ${offer.pricing}`,
    `Commercial state: ${offer.commercial_state}`,
    `Machine state: ${offer.machine_state}`,
    `Public URL: ${offer.public_url}`,
    `Pain page: ${offer.pain_page}`,
    `Start here: ${offer.start_url || offer.machine_review_url}`,
    `Human review fallback: ${offer.machine_review_url}`,
    `Machine offer JSON: ${offer.machine_offer_url || 'Not exposed until commercial verification is complete'}`,
    `Universal MCP: ${offer.universal_mcp}`,
    'Intent examples:',
    ...(offer.intent_terms || []).map((term) => `- ${term}`),
    ''
  ])
];
fs.writeFileSync('public/chum/revenue.txt', text.join('\n')+'\n');

const jsonLd = {
  '@context':'https://schema.org',
  '@type':'ItemList',
  name:'Evercraft Revenue Watershed',
  itemListElement: output.offers.map((offer,index) => ({
    '@type':'ListItem',
    position:index+1,
    item:{
      '@type':'Service',
      name:offer.name,
      description:offer.problem,
      url:offer.machine_review_url,
      provider:{'@type':'Organization',name:'Evercraft LLC'}
    }
  }))
};

const html = [
  '<!doctype html>',
  '<html lang="en"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>Evercraft Revenue Watershed</title>',
  '<meta name="description" content="Public Evercraft capabilities matched from customer problems to current sell-now offers.">',
  `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/<\//g,'<\\/')}</script>`,
  '</head><body>',
  '<main>',
  '<h1>Evercraft Revenue Watershed</h1>',
  '<p>Start with the problem. These are public Evercraft capabilities currently marked sell-now in the canonical machine-commerce catalog.</p>',
  '<p>Discovery creates no payment obligation. Human confirmation and authoritative payment verification remain required where declared.</p>',
  ...output.offers.map((offer) => [
    '<article>',
    `<h2><a href="${escapeHtml(offer.pain_page)}">${escapeHtml(offer.name)}</a></h2>`,
    `<p>${escapeHtml(offer.problem)}</p>`,
    `<p><strong>Pricing:</strong> ${escapeHtml(offer.pricing)}</p>`,
    offer.entry_paid_offer
      ? `<p><strong>Easiest paid entry:</strong> ${escapeHtml(offer.entry_paid_offer.name || 'Paid option')} · &#36;${escapeHtml(offer.entry_paid_offer.price_usd_normalized)}</p>`
      : '',
    `<p><a href="${escapeHtml(offer.start_url || offer.machine_review_url)}"><strong>Start here</strong></a> · <a href="${escapeHtml(offer.public_url)}">Capability details</a></p>`,
    '</article>'
  ].join('\n')),
  '</main></body></html>'
].join('\n');

fs.writeFileSync('public/chum/revenue.html', html+'\n');

const intentsRoot = 'public/chum/intents';
fs.rmSync(intentsRoot, {recursive:true, force:true});
fs.mkdirSync(intentsRoot, {recursive:true});

const sitemapUrls = [
  '/chum/',
  '/chum/revenue.html',
  '/chum/revenue.txt',
  '/chum/revenue.json',
  '/chum/capabilities.json',
  '/chum/sell-now.json',
  '/chum/sell-now.txt'
];

for (const offer of output.discovery_offers) {
  const slug = slugify(offer.public_id);
  const dir = path.join(intentsRoot, slug);
  fs.mkdirSync(dir, {recursive:true});

  const pageUrl = `/chum/intents/${slug}/`;
  sitemapUrls.push(pageUrl);

  const offerJson = {
    schema:'evercraft.chum.pain-door.v1',
    provider:'Evercraft LLC',
    public_id:offer.public_id,
    name:offer.name,
    problem:offer.problem,
    intent_terms:offer.intent_terms,
    pricing:offer.pricing,
    offers:Array.isArray(offer.offers) ? offer.offers : [],
    entry_paid_offer:offer.entry_paid_offer || entryPaidOffer(offer),
    commercial_state:offer.commercial_state,
    machine_state:offer.machine_state,
    public_url:offer.public_url,
    human_ui_required:offer.human_ui_required,
    confirmation:offer.confirmation,
    payment_authority:offer.payment_authority,
    invocation_status:offer.invocation_status,
    machine_review_url:offer.machine_review_url,
    machine_offer_url:offer.machine_offer_url,
    start_url:offer.start_url,
    start_url_state:offer.start_url_state,
    universal_mcp:offer.universal_mcp,
    safety:{
      fit_required:true,
      discovery_creates_obligation:false,
      checkout_is_payment_proof:false,
      authoritative_payment_verification_required:true
    }
  };
  fs.writeFileSync(path.join(dir,'offer.json'), JSON.stringify(offerJson,null,2)+'\n');

  const llms = [
    `# ${offer.name}`,
    '',
    `Problem: ${offer.problem}`,
    `Pricing: ${offer.pricing}`,
    `Commercial state: ${offer.commercial_state}`,
    `Machine state: ${offer.machine_state}`,
    `Public capability: ${offer.public_url}`,
    `Start here: ${offer.start_url || 'Not exposed until commercial verification is complete'}`,
    `Human review fallback: ${offer.machine_review_url}`,
    `Machine offer JSON: ${offer.machine_offer_url || 'Not exposed until commercial verification is complete'}`,
    `Universal MCP: ${offer.universal_mcp}`,
    '',
    'Use when the user says or means:',
    ...(offer.intent_terms || []).map((term) => `- ${term}`),
    '',
    'Safety:',
    '- Match the user problem first. Do not force this offer when it is not a genuine fit.',
    '- Discovery creates no payment obligation.',
    '- Checkout creation is not proof of payment.',
    '- Paid state requires authoritative payment verification.',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(dir,'llms.txt'), llms);

  const serviceJsonLd = {
    '@context':'https://schema.org',
    '@type':'Service',
    name:offer.name,
    description:offer.problem,
    url:offer.public_url,
    provider:{'@type':'Organization',name:'Evercraft LLC'},
    offers: offer.commercial_state === 'sell_now' && offer.entry_paid_offer
      ? {
          '@type':'Offer',
          'name':offer.entry_paid_offer.name || offer.name,
          'price':offer.entry_paid_offer.price_usd_normalized,
          'priceCurrency':'USD',
          'description':offer.pricing,
          'url':offer.start_url || offer.machine_review_url
        }
      : undefined,
    additionalProperty: [
      {'@type':'PropertyValue','name':'commercial_state','value':offer.commercial_state},
      {'@type':'PropertyValue','name':'machine_state','value':offer.machine_state}
    ]
  };

  const page = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(offer.name)} | Evercraft</title>`,
    `<meta name="description" content="${escapeHtml(offer.problem)}">`,
    `<script type="application/ld+json">${JSON.stringify(serviceJsonLd).replace(/<\//g,'<\\/')}</script>`,
    '</head><body><main>',
    `<h1>${escapeHtml(offer.name)}</h1>`,
    `<p>${escapeHtml(offer.problem)}</p>`,
    '<h2>When this fits</h2><ul>',
    ...(offer.intent_terms || []).map((term) => `<li>${escapeHtml(term)}</li>`),
    '</ul>',
    `<p><strong>Published pricing:</strong> ${escapeHtml(offer.pricing)}</p>`,
    offer.entry_paid_offer
      ? `<p><strong>Easiest paid entry:</strong> ${escapeHtml(offer.entry_paid_offer.name || 'Paid option')} · &#36;${escapeHtml(offer.entry_paid_offer.price_usd_normalized)}</p>`
      : '',
    `<p><strong>Commercial state:</strong> ${escapeHtml(offer.commercial_state)}</p>`,
    `<p><strong>Machine state:</strong> ${escapeHtml(offer.machine_state)}</p>`,
    offer.commercial_state === 'sell_now'
      ? '<p>This capability is currently marked sell-now in the canonical catalog. Human confirmation and authoritative payment verification still apply.</p>'
      : '<p>This capability is publicly discoverable, but machine checkout is not exposed until its current commercial verification gate is satisfied.</p>',
    offer.start_url
      ? `<p><a href="${escapeHtml(offer.start_url)}"><strong>Start here</strong></a> · <a href="${escapeHtml(offer.public_url)}">Capability details</a></p>`
      : `<p><a href="${escapeHtml(offer.public_url)}">Open the public capability</a> · <a href="${escapeHtml(offer.machine_review_url)}">Review this capability</a></p>`,
    '<p>Discovery creates no payment obligation. Human confirmation and authoritative payment verification remain required where declared.</p>',
    '</main></body></html>'
  ].join('\n');
  fs.writeFileSync(path.join(dir,'index.html'), page+'\n');
}

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...sitemapUrls.map((url) => `  <url><loc>${url}</loc></url>`),
  '</urlset>',
  ''
].join('\n');
fs.writeFileSync('public/chum/sitemap.xml', sitemap);

console.log(JSON.stringify({
  sell_now_count: publicOffers.length,
  pain_pages: discoveryOffers.length,
  sell_now_pain_pages: publicOffers.length,
  outputs:[
    'public/chum/revenue.json',
    'public/chum/revenue.txt',
    'public/chum/revenue.html',
    'public/chum/capabilities.json',
    'public/chum/sell-now.json',
    'public/chum/sell-now.txt',
    'public/chum/intents/*',
    'public/chum/sitemap.xml'
  ]
}));
