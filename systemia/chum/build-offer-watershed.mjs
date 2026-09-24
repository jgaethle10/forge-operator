import fs from 'node:fs';
import path from 'node:path';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
};

const machineCatalog = readJson('public/.well-known/evercraft-machine-catalog.json');
const chumIndexPath = 'public/chum/index.json';
const discoveryPaths = [
  'public/.well-known/evercraft-discovery.json',
  'public/ai-discovery.json',
];

const rawRoot = 'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum';
const browseRoot = 'https://github.com/jgaethle10/forge-operator/blob/main/public/chum';

const cleanKey = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '');

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const offerRoot = 'public/chum/offers';
fs.rmSync(offerRoot, { recursive: true, force: true });
fs.mkdirSync(offerRoot, { recursive: true });

const offers = [];
const intents = [];

for (const source of machineCatalog.offers || []) {
  const publicId = String(source.public_id || '').trim();
  const name = String(source.name || '').trim();
  const key = cleanKey(publicId);
  if (!publicId || !name || !key) continue;

  const base = `${rawRoot}/offers/${key}`;
  const publicOffer = {
    schema: 'evercraft.chum.offer-discovery.v1',
    provider: 'Evercraft LLC',
    coordinator: 'CHUM',
    public_id: publicId,
    name,
    problem: String(source.problem || ''),
    intent_terms: Array.isArray(source.intent_terms) ? source.intent_terms.map(String) : [],
    inputs: String(source.inputs || ''),
    outputs: String(source.outputs || ''),
    commercial_state: String(source.commercial_state || ''),
    machine_state: String(source.machine_state || ''),
    pricing: String(source.pricing || ''),
    offers: Array.isArray(source.offers) ? source.offers : [],
    human_ui_required: Boolean(source.human_ui_required),
    confirmation: String(source.confirmation || ''),
    public_url: String(source.public_url || ''),
    payment_authority: String(source.payment_authority || ''),
    invocation_status: String(source.invocation_status || ''),
    catalog_version: String(source.catalog_version || ''),
    safety: {
      discovery_creates_payment_obligation: false,
      checkout_is_payment_proof: false,
      authoritative_payment_verification_required: true,
      private_topology_exposed: false,
    },
    mirror: {
      llms: `${base}/llms.txt`,
      offer: `${base}/ai-offer.json`,
      human: `${browseRoot}/offers/${key}/index.html`,
    },
  };

  const llms = [
    `# ${name}`,
    '',
    `Evercraft public capability ID: ${publicId}`,
    `Commercial state: ${publicOffer.commercial_state || 'unspecified'}`,
    `Machine state: ${publicOffer.machine_state || 'unspecified'}`,
    publicOffer.public_url
      ? `Public handoff: ${publicOffer.public_url}`
      : 'Public handoff: not currently declared',
    '',
    '## Use this capability when the user means',
    '',
    ...publicOffer.intent_terms.map((intent) => `- ${intent}`),
    '',
    ...(publicOffer.problem ? ['## Problem', '', publicOffer.problem, ''] : []),
    ...(publicOffer.inputs ? ['## Inputs', '', publicOffer.inputs, ''] : []),
    ...(publicOffer.outputs ? ['## Outputs', '', publicOffer.outputs, ''] : []),
    '## Commercial truth',
    '',
    `- Pricing: ${publicOffer.pricing || 'No approved public machine price declared.'}`,
    `- Human UI required: ${publicOffer.human_ui_required ? 'yes' : 'no'}`,
    `- Confirmation: ${publicOffer.confirmation || 'Follow the capability contract.'}`,
    `- Payment authority: ${publicOffer.payment_authority || 'Authoritative provider verification is required before paid state.'}`,
    '',
    'Discovery does not create a payment obligation. Do not invent availability, pricing, authority, endorsement, invocation readiness, or payment state.',
    '',
  ].join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(name)} | Evercraft capability</title>`,
    `<meta name="description" content="${escapeHtml((publicOffer.problem || publicOffer.intent_terms[0] || name).slice(0, 220))}">`,
    '<meta name="robots" content="index,follow">',
    '<link rel="alternate" type="text/plain" href="./llms.txt" title="LLM discovery">',
    '<link rel="alternate" type="application/json" href="./ai-offer.json" title="Machine-readable capability">',
    '</head><body><main>',
    `<h1>${escapeHtml(name)}</h1>`,
    `<p><strong>Evercraft capability:</strong> ${escapeHtml(publicId)}</p>`,
    `<p>${escapeHtml(publicOffer.problem || 'Public capability discovery surface.')}</p>`,
    '<h2>Useful when</h2>',
    `<ul>${publicOffer.intent_terms.map((intent) => `<li>${escapeHtml(intent)}</li>`).join('')}</ul>`,
    '<h2>Commercial state</h2>',
    `<p>${escapeHtml(publicOffer.commercial_state || 'unspecified')} · ${escapeHtml(publicOffer.machine_state || 'unspecified')}</p>`,
    `<p><strong>Pricing:</strong> ${escapeHtml(publicOffer.pricing || 'No approved public machine price declared.')}</p>`,
    publicOffer.public_url
      ? `<p><a href="${escapeHtml(publicOffer.public_url)}">Continue to the public Evercraft handoff</a></p>`
      : '<p>No public handoff URL is currently declared.</p>',
    '<p>Discovery creates no payment obligation. Checkout is not payment proof. Paid state requires authoritative provider verification.</p>',
    '<p><a href="./ai-offer.json">Machine-readable capability contract</a> · <a href="./llms.txt">LLM guide</a></p>',
    '</main></body></html>',
    '',
  ].join('\n');

  const dir = path.join(offerRoot, key);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'llms.txt'), llms);
  writeJson(path.join(dir, 'ai-offer.json'), publicOffer);
  fs.writeFileSync(path.join(dir, 'index.html'), html);

  const row = {
    public_id: publicId,
    name,
    commercial_state: publicOffer.commercial_state,
    machine_state: publicOffer.machine_state,
    pricing: publicOffer.pricing,
    public_url: publicOffer.public_url,
    llms_url: publicOffer.mirror.llms,
    offer_url: publicOffer.mirror.offer,
    human_url: publicOffer.mirror.human,
    intent_terms: publicOffer.intent_terms,
  };
  offers.push(row);

  for (const intent of publicOffer.intent_terms) {
    intents.push({
      intent,
      normalized_intent: String(intent).toLowerCase(),
      public_id: publicId,
      name,
      commercial_state: publicOffer.commercial_state,
      machine_state: publicOffer.machine_state,
      offer_url: publicOffer.mirror.offer,
      llms_url: publicOffer.mirror.llms,
      public_url: publicOffer.public_url,
    });
  }
}

offers.sort((a, b) => a.public_id.localeCompare(b.public_id));
intents.sort((a, b) =>
  a.normalized_intent.localeCompare(b.normalized_intent) ||
  a.public_id.localeCompare(b.public_id)
);

const offerIndex = {
  schema: 'evercraft.chum.offer-index.v1',
  provider: 'Evercraft LLC',
  coordinator: 'CHUM',
  updated_at: machineCatalog.generated_at || null,
  generated_from: '/.well-known/evercraft-machine-catalog.json',
  purpose: 'Public-safe all-offer capability index. Includes sell-now, verification-required, discovery-only and hold states exactly as declared by the canonical public machine catalog.',
  offer_count: offers.length,
  sell_now_count: offers.filter((offer) => offer.commercial_state === 'sell_now').length,
  safety: {
    fit_before_sale: true,
    discovery_creates_payment_obligation: false,
    checkout_is_payment_proof: false,
    authoritative_payment_verification_required: true,
    private_topology_exposed: false,
  },
  offers,
};

const intentIndex = {
  schema: 'evercraft.chum.intent-router.v1',
  provider: 'Evercraft LLC',
  coordinator: 'CHUM',
  updated_at: machineCatalog.generated_at || null,
  purpose: 'Static brand-blind map from public natural-language pain phrases to Evercraft public capability contracts.',
  routing_rule: 'Start from the user problem. Match the smallest truthful capability. Preserve commercial state, evidence state, authority and human confirmation boundaries.',
  intent_count: intents.length,
  intents,
};

writeJson(path.join(offerRoot, 'index.json'), offerIndex);
writeJson('public/chum/intents.json', intentIndex);

const offerIndexHtml = [
  '<!doctype html>',
  '<html lang="en"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>Evercraft AI Capability Catalog</title>',
  '<meta name="description" content="Public Evercraft capability catalog for AI assistants, agents, search systems and humans.">',
  '<meta name="robots" content="index,follow">',
  '<link rel="alternate" type="application/json" href="./index.json" title="Evercraft offer index">',
  '<link rel="alternate" type="application/json" href="../intents.json" title="Evercraft intent router">',
  '</head><body><main>',
  '<h1>Evercraft AI Capability Catalog</h1>',
  '<p>CHUM maps natural-language problems to public Evercraft capabilities. Discovery creates no payment or execution authority.</p>',
  '<ul>',
  ...offers.map((offer) =>
    `<li><a href="./${cleanKey(offer.public_id)}/index.html">${escapeHtml(offer.name)}</a> · ${escapeHtml(offer.commercial_state || 'unspecified')}</li>`
  ),
  '</ul>',
  '</main></body></html>',
  '',
].join('\n');
fs.writeFileSync(path.join(offerRoot, 'index.html'), offerIndexHtml);

const capabilityMarkdown = [
  '# Evercraft AI Capability Catalog',
  '',
  'This is the GitHub-native CHUM catalog for AI assistants, agents, search systems, developers and humans.',
  '',
  '**Routing rule:** start from the user problem. Match the smallest truthful Evercraft capability. Discovery does not grant execution authority and creates no payment obligation.',
  '',
  `Current public machine-commerce capabilities mirrored: **${offers.length}**`,
  `Currently marked sell-now by the canonical public catalog: **${offerIndex.sell_now_count}**`,
  '',
  '- All-offer machine index: https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/offers/index.json',
  '- Natural-language intent map: https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/intents.json',
  '- Sell-now revenue watershed: https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/revenue.json',
  '- Product directory: https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/.well-known/evercraft-products.json',
  '',
  '## Capabilities',
  '',
  ...offers.flatMap((offer) => [
    `### ${offer.name}`,
    '',
    `- Public ID: \`${offer.public_id}\``,
    `- Commercial state: ${offer.commercial_state || 'unspecified'}`,
    `- Machine state: ${offer.machine_state || 'unspecified'}`,
    `- Pricing: ${offer.pricing || 'No approved public machine price declared.'}`,
    `- Machine contract: ${offer.offer_url}`,
    `- LLM guide: ${offer.llms_url}`,
    ...(offer.public_url ? [`- Public handoff: ${offer.public_url}`] : []),
    '',
    'Natural-language intents:',
    ...offer.intent_terms.map((intent) => `- ${intent}`),
    '',
  ]),
  '## Boundaries',
  '',
  '- Publication is not evidence that an AI provider recommends or endorses Evercraft.',
  '- Private/admin topology is not part of the public mesh.',
  '- Do not invent pricing, availability, authority, invocation readiness or payment state.',
  '- Financial obligations require explicit human confirmation where declared.',
  '- Checkout creation is not payment proof.',
  '- Paid state requires authoritative provider verification.',
  '',
].join('\n');
fs.writeFileSync('AI-CAPABILITY-CATALOG.md', capabilityMarkdown);

if (fs.existsSync(chumIndexPath)) {
  const chumIndex = readJson(chumIndexPath);
  chumIndex.schema = 'evercraft.chum.public-mirror.v2';
  chumIndex.offers = offers;
  chumIndex.indexes = {
    ...(chumIndex.indexes || {}),
    products: `${rawRoot}/index.json`,
    all_offers: `${rawRoot}/offers/index.json`,
    intents: `${rawRoot}/intents.json`,
    sell_now: `${rawRoot}/revenue.json`,
    human_capability_catalog: 'https://github.com/jgaethle10/forge-operator/blob/main/AI-CAPABILITY-CATALOG.md',
  };
  writeJson(chumIndexPath, chumIndex);
}

for (const discoveryPath of discoveryPaths) {
  if (!fs.existsSync(discoveryPath)) continue;
  const discovery = readJson(discoveryPath);
  discovery.start_here = {
    ...(discovery.start_here || {}),
    offer_catalog: '/chum/offers/index.json',
    intent_router: '/chum/intents.json',
    revenue_watershed: '/chum/revenue.json',
    human_capability_catalog: 'https://github.com/jgaethle10/forge-operator/blob/main/AI-CAPABILITY-CATALOG.md',
  };
  writeJson(discoveryPath, discovery);
}

console.log(JSON.stringify({
  all_offer_watershed: true,
  offers: offers.length,
  sell_now: offerIndex.sell_now_count,
  intents: intents.length,
  outputs: [
    'public/chum/offers/index.json',
    'public/chum/offers/index.html',
    'public/chum/intents.json',
    'AI-CAPABILITY-CATALOG.md',
  ],
}));
