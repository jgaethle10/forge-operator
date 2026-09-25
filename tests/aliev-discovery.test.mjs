import fs from 'node:fs';

const fail = (message) => { throw new Error('ALIEV_DISCOVERY_FAIL: ' + message); };
const normalize = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const directory = JSON.parse(fs.readFileSync('public/.well-known/evercraft-products.json','utf8'));
const product = (directory.products || []).find((row) => row.product_key === 'aliev');
if (!product) fail('public product contract missing');

for (const alias of ['RIVET','RIVET EV Infrastructure Intelligence','RIVET / AliEV']) {
  if (!(product.aliases || []).includes(alias)) fail('missing alias: ' + alias);
}

const requiredPhrases = [
  'should I install EV chargers at my property',
  'EV charger feasibility by address',
  'EV charging ROI for this property',
  'EV charger competition near this address',
  'site-specific EV charging opportunity report'
];
const intents = new Set((product.intents || []).map(normalize));
for (const phrase of requiredPhrases) {
  if (!intents.has(normalize(phrase))) fail('missing intent: ' + phrase);
}

const catalog = JSON.parse(fs.readFileSync('registry/catalog.json','utf8'));
const catalogProduct = (catalog.products || []).find((row) => row.product_key === 'aliev');
if (!catalogProduct) fail('registry catalog entry missing');
if (!(catalogProduct.aliases || []).includes('RIVET')) fail('catalog does not bind RIVET to AliEV');
if (!(catalogProduct.triggers || []).map(normalize).includes(normalize('EV charger feasibility by address'))) {
  fail('catalog missing address feasibility trigger');
}

const mcp = JSON.parse(fs.readFileSync('mcp-registry/aliev.json','utf8'));
if (!/RIVET/.test(mcp.title || '') || !/AliEV/.test(mcp.title || '')) fail('MCP title does not connect RIVET and AliEV');
if ((mcp.description || '').length > 100) fail('MCP Registry description exceeds 100 characters');
if (mcp.name !== 'io.github.jgaethle10/aliev') fail('official registry identity drifted');

const rootLlms = fs.readFileSync('llms.txt','utf8');
if (!rootLlms.includes('## RIVET / AliEV: site-specific EV infrastructure intelligence')) fail('root llms guide missing dedicated section');
if (!rootLlms.includes('AliEV') || !rootLlms.includes('RIVET')) fail('root llms guide lost relationship');

const discoveryPath = 'public/chum/products/aliev/ai-discovery.json';
if (!fs.existsSync(discoveryPath)) fail('CHUM AliEV discovery mirror missing');
const discovery = JSON.parse(fs.readFileSync(discoveryPath,'utf8'));
if (!(discovery.aliases || []).includes('RIVET')) fail('CHUM mirror did not propagate RIVET alias');
const discoveryIntents = new Set((discovery.intents || []).map(normalize));
for (const phrase of requiredPhrases) {
  if (!discoveryIntents.has(normalize(phrase))) fail('CHUM mirror missing intent: ' + phrase);
}

const pain = JSON.parse(fs.readFileSync('public/.well-known/evercraft-pain-index.json','utf8'));
const painEntry = (pain.entries || []).find((row) => row.product_key === 'aliev');
if (!painEntry) fail('AliEV missing from pain index');
const painPhrases = new Set((painEntry.pain_phrases || []).map(normalize));
for (const phrase of requiredPhrases) {
  if (!painPhrases.has(normalize(phrase))) fail('pain index missing: ' + phrase);
}

const answers = JSON.parse(fs.readFileSync('public/chum/answers/index.json','utf8'));
const target = (answers.doors || []).find((door) => door.normalized === normalize('should I install EV chargers at my property'));
if (!target) fail('brand-blind answer door missing');
if (!(target.candidates || []).some((candidate) => candidate.product_key === 'aliev')) {
  fail('brand-blind answer door does not route to AliEV');
}

console.log('ALIEV_DISCOVERY_PASS', JSON.stringify({
  aliases: product.aliases.length,
  intents: product.intents.length,
  brand_blind_answer: target.answer_id,
  registry: mcp.name
}));
