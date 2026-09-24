import fs from 'node:fs';
import assert from 'node:assert/strict';

const directory = JSON.parse(fs.readFileSync('public/.well-known/evercraft-products.json','utf8'));
const robots = fs.readFileSync('public/robots.txt','utf8');
const chumIndex = fs.readFileSync('public/chum/index.html','utf8');

for (const token of ['OAI-SearchBot','ChatGPT-User','GPTBot','Claude-SearchBot','Claude-User','ClaudeBot','Googlebot','Google-Extended','bingbot','PerplexityBot']) {
  assert.ok(robots.includes(token), `robots.txt missing ${token}`);
}

assert.ok(chumIndex.includes('Evercraft'), 'CHUM HTML index missing');
assert.ok(chumIndex.includes('/llms'), 'CHUM index should expose an LLM-readable path');

for (const product of directory.products || []) {
  const key = String(product.product_key || '').trim();
  assert.ok(key, 'product key required');
  const root = `public/chum/products/${key}`;
  for (const file of ['index.html','llms.txt','ai-discovery.json','ai-conformance.json']) {
    assert.ok(fs.existsSync(`${root}/${file}`), `missing ${root}/${file}`);
  }
  const html = fs.readFileSync(`${root}/index.html`,'utf8');
  assert.ok(html.includes('name="robots"'), `${key} page missing crawler metadata`);
  assert.ok(html.includes('./llms.txt'), `${key} page does not link llms.txt`);
  assert.ok(html.includes('./ai-discovery.json'), `${key} page does not link discovery JSON`);
  const hasPain = (product.intents || []).some((intent) => html.includes(String(intent)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')));
  assert.ok(hasPain, `${key} page contains no declared pain language`);
}

const sensitivePatterns = [
  /password\s*[:=]\s*["'][^"']+/i,
  /api[_-]?key\s*[:=]\s*["'][^"']+/i,
  /authorization\s*:\s*bearer\s+[a-z0-9._-]{12,}/i
];
for (const product of directory.products || []) {
  const html = fs.readFileSync(`public/chum/products/${product.product_key}/index.html`,'utf8');
  for (const pattern of sensitivePatterns) assert.ok(!pattern.test(html), `secret-like content on public mirror for ${product.product_key}`);
}

console.log('CHUM PUBLIC DISCOVERY SURFACES PASS', JSON.stringify({products:(directory.products || []).length}));
