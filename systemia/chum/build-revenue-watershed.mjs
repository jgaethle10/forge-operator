import fs from 'node:fs';
import path from 'node:path';

const catalog = JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json','utf8'));
const offers = (catalog.offers || [])
  .filter((offer) => offer.commercial_state === 'sell_now')
  .sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')));

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
  catalog_version: offer.catalog_version
}));

const output = {
  schema: 'evercraft.chum.revenue-watershed.v1',
  provider: 'Evercraft LLC',
  updated_at: catalog.generated_at || new Date().toISOString(),
  source_schema_version: catalog.source_schema_version || '',
  gateway_version: catalog.gateway_version || '',
  purpose: 'Public-safe machine index of Evercraft offers that the canonical catalog currently marks sell_now. Match the user problem first. Discovery creates no obligation. Preserve explicit human confirmation and authoritative payment verification.',
  discovery_endpoint: '/api/discover',
  safety: {
    no_recommendation_guarantee: true,
    discovery_creates_obligation: false,
    explicit_human_confirmation_required_where_declared: true,
    checkout_is_not_payment_proof: true,
    authoritative_provider_verification_required_for_paid_state: true,
    private_topology_exposed: false
  },
  sell_now_count: publicOffers.length,
  offers: publicOffers
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
  ...publicOffers.flatMap((offer) => [
    `## ${offer.name}`,
    `Public ID: ${offer.public_id}`,
    `Problem: ${offer.problem}`,
    `Pricing: ${offer.pricing}`,
    `Machine state: ${offer.machine_state}`,
    `Public URL: ${offer.public_url}`,
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
  itemListElement: publicOffers.map((offer,index) => ({
    '@type':'ListItem',
    position:index+1,
    item:{
      '@type':'Service',
      name:offer.name,
      description:offer.problem,
      url:offer.public_url,
      provider:{'@type':'Organization',name:'Evercraft LLC'}
    }
  }))
};

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
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
  ...publicOffers.map((offer) => [
    '<article>',
    `<h2>${escapeHtml(offer.name)}</h2>`,
    `<p>${escapeHtml(offer.problem)}</p>`,
    `<p><strong>Pricing:</strong> ${escapeHtml(offer.pricing)}</p>`,
    `<p><a href="${escapeHtml(offer.public_url)}">Public capability</a></p>`,
    '</article>'
  ].join('\n')),
  '</main></body></html>'
].join('\n');

fs.writeFileSync('public/chum/revenue.html', html+'\n');
console.log(JSON.stringify({ sell_now_count: publicOffers.length, outputs:['public/chum/revenue.json','public/chum/revenue.txt','public/chum/revenue.html'] }));
