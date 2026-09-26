import fs from 'node:fs';
import assert from 'node:assert/strict';

const directory = JSON.parse(fs.readFileSync('public/.well-known/evercraft-products.json','utf8'));
const conformance = JSON.parse(fs.readFileSync('conformance/products.json','utf8'));
const conformanceByKey = new Map((conformance.products || []).map((row) => [row.product_key, row]));
const robots = fs.readFileSync('public/robots.txt','utf8');
const indexHtml = fs.readFileSync('public/chum/index.html','utf8');
const llmsFull = fs.readFileSync('public/llms-full.txt','utf8');

for (const token of [
  'OAI-SearchBot','ChatGPT-User','GPTBot',
  'Claude-SearchBot','Claude-User','ClaudeBot',
  'Googlebot','Google-Extended','bingbot','PerplexityBot',
  'Applebot','Applebot-Extended','Google-Agent'
]) {
  assert.ok(robots.includes(token), `robots.txt missing ${token}`);
}

assert.ok(indexHtml.includes('CHUM'), 'CHUM public index missing');
assert.ok(indexHtml.includes('Describe the problem'), 'CHUM public index missing pain-first form');
assert.ok(indexHtml.includes('/llms-full.txt'), 'CHUM public index missing full LLM directory link');
assert.ok(indexHtml.includes('/openapi.json'), 'CHUM public index missing OpenAPI link');

for (const product of directory.products || []) {
  const key = String(product.product_key || '').trim();
  assert.ok(key, 'product key required');
  const root = `public/chum/products/${key}`;

  for (const file of ['index.html','llms.txt','ai-discovery.json','ai-conformance.json']) {
    assert.ok(fs.existsSync(`${root}/${file}`), `missing ${root}/${file}`);
  }

  const html = fs.readFileSync(`${root}/index.html`,'utf8');
  const discovery = JSON.parse(fs.readFileSync(`${root}/ai-discovery.json`,'utf8'));
  const conf = conformanceByKey.get(key);
  const registryPublicationState = String(conf?.mcp_registry?.publication_state || '').toLowerCase();
  if (conf?.mcp_registry?.name && !registryPublicationState.startsWith('published')) {
    assert.equal(discovery.registry_name, null, `${key} exposed an unverified Official MCP Registry identity`);
    assert.ok(!html.includes('Official MCP Registry name:'), `${key} labeled a staged registry identity as official`);
    assert.ok(!llmsFull.includes(`Official MCP Registry: ${conf.mcp_registry.name}`), `${key} leaked a staged registry identity into llms-full`);
  }
  assert.ok(html.includes('name="robots"'), `${key} product page missing crawler metadata`);
  assert.ok(html.includes('./llms.txt'), `${key} product page missing llms.txt link`);
  assert.ok(html.includes('./ai-discovery.json'), `${key} product page missing discovery JSON link`);
  assert.ok(html.includes(`rel="canonical" href="/chum/products/${key}/"`), `${key} product page missing canonical link`);
  assert.ok(html.includes('/feed.xml'), `${key} product page missing RSS discovery link`);
  assert.ok(html.includes('/feed.json'), `${key} product page missing JSON Feed discovery link`);
  assert.ok(html.includes('/.well-known/agent-card.json'), `${key} product page missing A2A agent-card link`);

  const painPhrases = Array.isArray(product.intents) ? product.intents.filter(Boolean) : [];
  assert.ok(painPhrases.length > 0, `${key} has no public problem-language intents`);
}

const publicFiles = [
  'public/llms.txt',
  'public/llms-full.txt',
  'public/.well-known/evercraft-chum.json',
  'public/.well-known/evercraft-pain-index.json',
  'public/.well-known/evercraft-products.json',
  'public/.well-known/evercraft-machine-catalog.json'
];

const secretLike = [
  /authorization\s*:\s*bearer\s+[a-z0-9._-]{12,}/i,
  /api[_-]?key\s*[:=]\s*["'][^"']{8,}/i,
  /password\s*[:=]\s*["'][^"']{6,}/i
];

for (const file of publicFiles) {
  const content = fs.readFileSync(file,'utf8');
  for (const pattern of secretLike) {
    assert.ok(!pattern.test(content), `secret-like material found in ${file}`);
  }
}

const schemaGraph = JSON.parse(fs.readFileSync('public/schema.jsonld','utf8'));
assert.ok(
  schemaGraph['@graph']?.some((node) => node?.['@id'] === 'https://github.com/jgaethle10/forge-operator#evercraft-discovery-site' && node?.['@type'] === 'WebSite'),
  'schema graph missing Evercraft discovery WebSite node'
);
assert.ok(
  schemaGraph['@graph']?.some((node) => node?.['@type'] === 'WebSite' && node?.potentialAction?.['@type'] === 'SearchAction'),
  'schema graph missing SearchAction'
);

console.log('CHUM PUBLIC DISCOVERY SURFACES PASS', JSON.stringify({
  products: (directory.products || []).length,
  public_index: '/chum/',
  post_router: '/api/discover'
}));
