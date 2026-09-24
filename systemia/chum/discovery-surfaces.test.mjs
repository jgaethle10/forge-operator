import fs from 'node:fs';
import assert from 'node:assert/strict';

const directory = JSON.parse(fs.readFileSync('public/.well-known/evercraft-products.json','utf8'));
const sitemap = JSON.parse(fs.readFileSync('public/chum/sitemap-paths.json','utf8'));
const robots = fs.readFileSync('public/robots.txt','utf8');
const index = fs.readFileSync('public/chum/index.html','utf8');

for (const token of ['OAI-SearchBot','ChatGPT-User','GPTBot','Claude-SearchBot','Claude-User','ClaudeBot','Googlebot','Google-Extended','bingbot','PerplexityBot']) {
  assert.ok(robots.includes(token), `robots.txt missing ${token}`);
}

assert.ok(index.includes('Evercraft CHUM'), 'CHUM HTML index missing');
assert.ok(index.includes('/llms-full.txt'), 'CHUM index must link full LLM directory');
assert.ok(index.includes('/ai-discovery.json'), 'CHUM index must link discovery map');

for (const product of directory.products || []) {
  const key = String(product.product_key || '').trim();
  assert.ok(key, 'product key required');
  const root = `public/chum/products/${key}`;
  for (const file of ['index.html','llms.txt','ai-discovery.json','ai-conformance.json']) {
    assert.ok(fs.existsSync(`${root}/${file}`), `missing ${root}/${file}`);
  }
  const html = fs.readFileSync(`${root}/index.html`,'utf8');
  assert.ok(html.includes('<meta name="robots" content="index,follow'), `${key} HTML page is not explicitly crawlable`);
  assert.ok(html.includes('./llms.txt'), `${key} HTML page does not link llms.txt`);
  assert.ok(html.includes('./ai-discovery.json'), `${key} HTML page does not link discovery JSON`);
  assert.ok((product.intents || []).some((intent) => html.includes(String(intent).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'))), `${key} HTML page contains no declared pain language`);
  assert.ok(sitemap.paths.includes(`/chum/products/${key}/`), `sitemap paths missing ${key}`);
}

const forbidden = [/password\s*[:=]/i,/api[_-]?key\s*[:=]/i,/bearer\s+[a-z0-9._-]{12,}/i];
for (const product of directory.products || []) {
  const html = fs.readFileSync(`public/chum/products/${product.product_key}/index.html`,'utf8');
  for (const pattern of forbidden) assert.ok(!pattern.test(html), `public mirror may expose secret-like content for ${product.product_key}`);
}

console.log('CHUM PUBLIC DISCOVERY SURFACES PASS', JSON.stringify({
  products: (directory.products || []).length,
  sitemap_paths: sitemap.paths.length
}));
