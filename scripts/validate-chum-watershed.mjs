import fs from 'node:fs';

const fail = (message) => {
  console.error('FAIL:', message);
  process.exitCode = 1;
};
const pass = (message) => console.log('PASS:', message);
const read = (file) => fs.readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));

const server = read('server.ts');
const router = read('systemia/chum/discovery-router.mjs');
const mirrorBuilder = read('systemia/chum/build-public-mirror.mjs');
const robots = read('public/robots.txt');
const llms = read('public/llms.txt');
const guide = read('AI-DISCOVERY.md');
const chum = json('public/.well-known/evercraft-chum.json');
const discovery = json('public/.well-known/evercraft-discovery.json');
const aiDiscovery = json('public/ai-discovery.json');
const agent = json('public/.well-known/evercraft-agent.json');
const capabilities = json('public/.well-known/evercraft-capabilities.json');
const openapi = json('public/openapi.json');
const products = json('public/.well-known/evercraft-products.json');

const requireText = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} missing ${needle}`);
  else pass(`${label}: ${needle}`);
};

for (const needle of [
  "app.get('/api/discover'",
  "app.post('/api/discover'",
  "app.get('/api/resolve'",
  "app.post('/api/resolve'",
  "app.get('/robots.txt'",
  "app.get('/sitemap.xml'",
  "discovery_creates_obligation: false",
  "private_authority_granted: false"
]) requireText(server, needle, 'server');

requireText(router, 'export function rankOffers', 'router');
requireText(router, 'export function rankProducts', 'router');
requireText(mirrorBuilder, "fs.writeFileSync(path.join(dir, 'index.html')", 'product mirror generator');

for (const token of [
  'OAI-SearchBot',
  'ChatGPT-User',
  'Claude-SearchBot',
  'Claude-User',
  'Googlebot',
  'Google-Extended',
  'bingbot',
  'PerplexityBot'
]) requireText(robots, token, 'robots');

for (const path of ['/api/discover','/api/resolve','/chum/','/llms-full.txt','/openapi.json']) {
  requireText(robots, `Allow: ${path}`, 'robots');
}
requireText(llms, '/api/discover', 'llms');
requireText(llms, '/api/resolve', 'llms');
requireText(guide, '/api/discover', 'AI-DISCOVERY');

if (chum.public_entrypoints?.llms !== 'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/llms.txt') {
  fail('CHUM raw llms entrypoint is stale or broken');
} else pass('CHUM raw llms entrypoint');

if (chum.public_entrypoints?.llms_full !== 'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/llms-full.txt') {
  fail('CHUM raw llms-full entrypoint is stale or broken');
} else pass('CHUM raw llms-full entrypoint');

for (const [label, value] of [
  ['watershed discover', discovery.start_here?.discover],
  ['compact discovery discover', aiDiscovery.start_here?.discover],
  ['agent discover', agent.start_here?.discover],
]) {
  if (value !== '/api/discover?q={natural-language-problem}') fail(`${label} is not canonical CHUM discover`);
  else pass(label);
}

if (capabilities.discovery?.intentRouter?.path !== '/api/discover') fail('capability manifest discover path drifted');
else pass('capability manifest discover');

if (!openapi.paths?.['/api/discover']?.get || !openapi.paths?.['/api/discover']?.post) {
  fail('OpenAPI must expose GET and POST /api/discover');
} else pass('OpenAPI discover GET+POST');

if (!openapi.paths?.['/api/resolve']?.get || !openapi.paths?.['/api/resolve']?.post) {
  fail('OpenAPI must expose GET and POST /api/resolve alias');
} else pass('OpenAPI resolve alias GET+POST');

if (chum.protocol_posture?.a2a !== 'not_advertised_until_required_protocol_operations_are_implemented') {
  fail('CHUM must not claim A2A before the protocol endpoint exists');
} else pass('A2A truth boundary');

if (!Array.isArray(products.products) || products.products.length < 1) fail('public product directory is empty');
for (const product of products.products || []) {
  if (!product.product_key || !product.name) fail('public product is missing identity');
  if (!Array.isArray(product.intents) || !product.intents.length) fail(`${product.product_key} has no natural-language intents`);
}

if (process.exitCode) throw new Error('CHUM watershed contract validation failed');
console.log(`CHUM WATERSHED CONTRACT PASS: ${products.products.length} public product families`);
