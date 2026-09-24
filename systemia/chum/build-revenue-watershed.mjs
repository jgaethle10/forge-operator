import fs from 'node:fs';
import path from 'node:path';

const MACHINE_COMMERCE_GATEWAY = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway';
const UNIVERSAL_MCP = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceMcp';

const catalog = JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json','utf8'));
const offers = (catalog.offers || [])
  .filter((offer) => offer.commercial_state === 'sell_now')
  .sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')));

const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 120);

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));

const publicOffers = offers.map((offer) => ({
  public_id: offer.public_id,
  name: offer.name,
  problem: offer.problem,
  intent_terms: offer.intent_terms || [],
  pricing: offer.pricing,
  offers: offer.offers || [],
  machine_state: offer.machine_state,
  public_url: offer.public_url,
  human_ui_required: Boolean(offer.human_ui_required),
  confirmation: offer.confirmation,
  payment_authority: offer.payment_authority,
  invocation_status: offer.invocation_status,
  catalog_version: offer.catalog_version,
  machine_review_url: MACHINE_COMMERCE_GATEWAY + '?view=service&public_id=' + encodeURIComponent(String(offer.public_id || '')),
  machine_offer_url: MACHINE_COMMERCE_GATEWAY + '?action=offer&public_id=' + encodeURIComponent(String(offer.public_id || '')),
  universal_mcp: UNIVERSAL_MCP
}));

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
  offers: publicOffers.map((offer) => ({
    ...offer,
    pain_page: `/chum/intents/${slugify(offer.public_id)}/`
  }))
};

fs.mkdirSync('public/chum',{recursive:true});
fs.writeFileSync('public/chum/revenue.json', JSON.stringify(output,null,2)+'\n');

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
    `Machine state: ${offer.machine_state}`,
    `Public URL: ${offer.public_url}`,
    `Pain page: ${offer.pain_page}`,
    `Human review: ${offer.machine_review_url}`,
    `Machine offer JSON: ${offer.machine_offer_url}`,
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
    `<p><a href="${escapeHtml(offer.public_url)}">Public capability</a> · <a href="${escapeHtml(offer.machine_review_url)}">Review this capability</a></p>`,
    '</article>'
  ].join('\n')),
  '</main></body></html>'
].join('\n');

fs.writeFileSync('public/chum/revenue.html', html+'\n');

const intentsRoot = 'public/chum/intents';
fs.rmSync(intentsRoot, {recursive:true, force:true});
fs.mkdirSync(intentsRoot, {recursive:true});

const sitemapUrls = ['/chum/','/chum/revenue.html','/chum/revenue.txt','/chum/revenue.json'];

for (const offer of output.offers) {
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
    machine_state:offer.machine_state,
    public_url:offer.public_url,
    human_ui_required:offer.human_ui_required,
    confirmation:offer.confirmation,
    payment_authority:offer.payment_authority,
    invocation_status:offer.invocation_status,
    machine_review_url:offer.machine_review_url,
    machine_offer_url:offer.machine_offer_url,
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
    `Machine state: ${offer.machine_state}`,
    `Public capability: ${offer.public_url}`,
    `Human review: ${offer.machine_review_url}`,
    `Machine offer JSON: ${offer.machine_offer_url}`,
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
    offers: offer.pricing ? {'@type':'Offer','description':offer.pricing} : undefined
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
    `<p><strong>Pricing:</strong> ${escapeHtml(offer.pricing)}</p>`,
    `<p><strong>Machine state:</strong> ${escapeHtml(offer.machine_state)}</p>`,
    `<p><a href="${escapeHtml(offer.public_url)}">Open the public capability</a> · <a href="${escapeHtml(offer.machine_review_url)}">Review this capability</a></p>`,
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
  pain_pages: publicOffers.length,
  outputs:[
    'public/chum/revenue.json',
    'public/chum/revenue.txt',
    'public/chum/revenue.html',
    'public/chum/intents/*',
    'public/chum/sitemap.xml'
  ]
}));
