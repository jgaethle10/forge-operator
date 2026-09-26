import fs from 'node:fs';

const fail = (message) => { throw new Error('RIVET_DISCOVERY_FAIL: ' + message); };
const normalize = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const centralMcp = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceMcp';
const requiredPhrases = [
  'should I install EV chargers at my property',
  'EV charger feasibility by address',
  'EV charging ROI for this property',
  'EV charger competition near this address',
  'site-specific EV charging opportunity report'
];

const directory = JSON.parse(fs.readFileSync('public/.well-known/evercraft-products.json','utf8'));
const product = (directory.products || []).find((row) => row.product_key === 'aliev');
if (!product) fail('public EV product contract missing');
if (product.name !== 'RIVET') fail('public EV product identity must be RIVET');
if (product.canonical_url !== 'https://rivet.base44.app/') fail('RIVET canonical URL drifted');
if ((product.aliases || []).some((alias) => /AliEV/i.test(alias))) fail('backend identity leaked into RIVET aliases');
for (const alias of ['RIVET','RIVET EV Infrastructure Intelligence','Evercraft RIVET']) {
  if (!(product.aliases || []).includes(alias)) fail('missing RIVET alias: ' + alias);
}
const intents = new Set((product.intents || []).map(normalize));
for (const phrase of requiredPhrases) {
  if (!intents.has(normalize(phrase))) fail('missing intent: ' + phrase);
}
if (product.commercial?.status !== 'sell_now_human_confirmation_required') fail('RIVET product is not sell-now with human confirmation');
if (!(product.commercial?.offers || []).some((offer) => offer.offer_key === 'site_report_299' && offer.price === '$299')) fail('RIVET $299 offer missing');
if (!(product.commercial?.offers || []).some((offer) => offer.offer_key === 'site_report_750' && offer.price === '$750')) fail('RIVET $750 offer missing');

const catalog = JSON.parse(fs.readFileSync('registry/catalog.json','utf8'));
const catalogProduct = (catalog.products || []).find((row) => row.product_key === 'aliev');
if (!catalogProduct) fail('registry catalog entry missing');
if (catalogProduct.name !== 'RIVET') fail('registry public EV identity must be RIVET');
if (catalogProduct.canonical_url !== 'https://rivet.base44.app/') fail('registry RIVET canonical URL drifted');
if (catalogProduct.registry_name !== 'io.github.jgaethle10/evercraft-machine-commerce') fail('RIVET must use universal Machine Commerce registry');
if (catalogProduct.mcp !== centralMcp) fail('RIVET must use universal Machine Commerce MCP');
if ((catalogProduct.aliases || []).some((alias) => /AliEV/i.test(alias))) fail('registry aliases leaked backend identity');
if (!(catalogProduct.triggers || []).map(normalize).includes(normalize('EV charger feasibility by address'))) {
  fail('catalog missing address feasibility trigger');
}

const machine = JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json','utf8'));
const machineRivet = (machine.offers || []).find((row) => row.public_id === 'rivet-site-underwriting-v1');
if (!machineRivet) fail('RIVET machine commerce offer missing');
if (machineRivet.commercial_state !== 'sell_now') fail('RIVET machine commerce is not sell-now');
if (machineRivet.machine_state !== 'payment_ready_human_confirmation') fail('RIVET machine state drifted');
if ((machineRivet.offers || []).some((offer) => /AliEV/i.test(String(offer.name || '')))) fail('backend brand leaked into RIVET machine offers');

const mcp = JSON.parse(fs.readFileSync('mcp-registry/evercraft-machine-commerce.json','utf8'));
if (mcp.name !== 'io.github.jgaethle10/evercraft-machine-commerce') fail('universal registry identity drifted');
if (mcp.version !== '1.3.0') fail('RIVET commerce requires Machine Commerce 1.3.0 manifest');

const rootLlms = fs.readFileSync('llms.txt','utf8');
const sectionStart = rootLlms.indexOf('## RIVET: site-specific EV infrastructure intelligence');
const sectionEnd = rootLlms.indexOf('## Evercraft Network:', sectionStart);
if (sectionStart < 0 || sectionEnd < 0) fail('root llms guide missing dedicated RIVET section');
const rivetRootSection = rootLlms.slice(sectionStart, sectionEnd);
if (/AliEV|aliev\.base44\.app/i.test(rivetRootSection)) fail('root RIVET guide leaked backend identity');
if (!rivetRootSection.includes('/rivet/start/')) fail('root RIVET guide missing current report corridor');

const discoveryPath = 'public/chum/products/aliev/ai-discovery.json';
if (!fs.existsSync(discoveryPath)) fail('CHUM RIVET discovery mirror missing');
const discovery = JSON.parse(fs.readFileSync(discoveryPath,'utf8'));
if (discovery.name !== 'RIVET') fail('CHUM product mirror identity is not RIVET');
if (discovery.canonical_url !== 'https://rivet.base44.app/') fail('CHUM product mirror canonical URL drifted');
if (discovery.mcp !== centralMcp) fail('CHUM RIVET mirror did not route through universal MCP');
if ((discovery.aliases || []).some((alias) => /AliEV/i.test(alias))) fail('CHUM RIVET mirror leaked backend aliases');
const discoveryIntents = new Set((discovery.intents || []).map(normalize));
for (const phrase of requiredPhrases) {
  if (!discoveryIntents.has(normalize(phrase))) fail('CHUM mirror missing intent: ' + phrase);
}

const capability = JSON.parse(fs.readFileSync('public/chum/capabilities/rivet-site-underwriting-v1/capability.json','utf8'));
if (capability.name !== 'RIVET EV Infrastructure Intelligence') fail('RIVET capability identity drifted');
if (capability.preferred_agent_route !== 'universal_fallback') fail('RIVET must not route through the legacy specialist');
if (capability.direct_specialist !== null) fail('legacy direct specialist leaked into RIVET capability');
if (capability.machine_commerce_mcp !== centralMcp) fail('RIVET capability lost universal MCP');

const directSpecs = JSON.parse(fs.readFileSync('distribution/direct-plugin-specs.json','utf8'));
for (const row of directSpecs.products || []) {
  if ((row.capability_public_ids || []).includes('rivet-site-underwriting-v1')) {
    fail('RIVET capability is still mapped to a legacy direct specialist');
  }
}

const pain = JSON.parse(fs.readFileSync('public/.well-known/evercraft-pain-index.json','utf8'));
const painEntry = (pain.entries || []).find((row) => row.product_key === 'aliev');
if (!painEntry) fail('RIVET product missing from pain index');
if (painEntry.name !== 'RIVET') fail('pain index EV product identity is not RIVET');
const painPhrases = new Set((painEntry.pain_phrases || []).map(normalize));
for (const phrase of requiredPhrases) {
  if (!painPhrases.has(normalize(phrase))) fail('pain index missing: ' + phrase);
}

const answers = JSON.parse(fs.readFileSync('public/chum/answers/index.json','utf8'));
const target = (answers.doors || []).find((door) => door.normalized === normalize('should I install EV chargers at my property'));
if (!target) fail('brand-blind answer door missing');
if (!(target.candidates || []).some((candidate) => candidate.product_key === 'aliev')) {
  fail('brand-blind answer door does not route to RIVET product');
}

for (const pathname of [
  'public/rivet/index.html',
  'public/rivet/llms.txt',
  'public/rivet/discovery.json',
  'public/rivet/start/index.html',
  'public/rivet/start/llms.txt',
  'public/rivet/start/offer.json'
]) {
  if (!fs.existsSync(pathname)) fail('dedicated RIVET surface missing: ' + pathname);
  const value = fs.readFileSync(pathname,'utf8');
  if (/AliEV|aliev\.base44\.app/i.test(value)) fail('RIVET public surface leaked backend identity: ' + pathname);
}
const rivetDiscovery = JSON.parse(fs.readFileSync('public/rivet/discovery.json','utf8'));
if (rivetDiscovery.name !== 'RIVET') fail('RIVET landing canonical name drifted');
if (rivetDiscovery.machine_capability !== '/chum/capabilities/rivet-site-underwriting-v1/') fail('RIVET capability route drifted');
if (rivetDiscovery.start_surface !== '/rivet/start/') fail('RIVET start surface missing');
if (rivetDiscovery.current_offer_manifest !== '/rivet/start/offer.json') fail('RIVET offer manifest route missing');

const sitemap = fs.readFileSync('public/sitemap.xml','utf8');
for (const route of [
  '/rivet/','/rivet/llms.txt','/rivet/discovery.json','/rivet/brand.json',
  '/rivet/start/','/rivet/start/offer.json','/rivet/start/llms.txt'
]) {
  if (!sitemap.includes(route)) fail('sitemap missing dedicated RIVET route: ' + route);
}

console.log('RIVET_DISCOVERY_PASS', JSON.stringify({
  aliases: product.aliases.length,
  intents: product.intents.length,
  brand_blind_answer: target.answer_id,
  registry: mcp.name,
  version: mcp.version
}));
