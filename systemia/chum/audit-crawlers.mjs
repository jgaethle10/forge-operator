import fs from 'node:fs';

const robots = fs.readFileSync('public/robots.txt', 'utf8');
const policy = JSON.parse(fs.readFileSync('systemia/chum/crawler-policy.json', 'utf8'));
const fail = (message) => { console.error('FAIL:', message); process.exitCode = 1; };

const requiredPublic = [
  '/llms.txt',
  '/llms-full.txt',
  '/openapi.json',
  '/.well-known/',
  '/api/health',
  '/api/capabilities',
  '/api/discovery',
  '/api/commercial'
];

for (const provider of policy.providers || []) {
  const token = String(provider.robots_token || '').trim();
  if (!token) fail('crawler policy contains a provider without robots_token');
  if (provider.allow && !robots.includes(`User-agent: ${token}`)) {
    fail(`robots.txt does not explicitly name allowed crawler ${token}`);
  }
}

if (!robots.includes('User-agent: *')) fail('robots.txt missing wildcard fallback');
if (!robots.includes('Allow: /')) fail('robots.txt must keep the public root crawlable');

for (const path of requiredPublic) {
  if (!robots.includes(`Allow: ${path}`)) fail(`robots.txt missing public allow rule for ${path}`);
}
for (const path of ['/api/', '/admin/', '/internal/', '/systemia/']) {
  if (!robots.includes(`Disallow: ${path}`)) fail(`robots.txt missing protected crawl boundary ${path}`);
}

for (const path of [
  'public/llms.txt',
  'public/llms-full.txt',
  'public/openapi.json',
  'public/.well-known/evercraft-chum.json',
  'public/.well-known/evercraft-products.json'
]) {
  if (!fs.existsSync(path)) fail(`missing discovery artifact ${path}`);
}

const llms = fs.readFileSync('public/llms.txt', 'utf8');
for (const needle of ['/llms-full.txt', '/openapi.json', '/.well-known/evercraft-chum.json', '/api/discovery']) {
  if (!llms.includes(needle)) fail(`llms.txt missing discovery pointer ${needle}`);
}

if (process.exitCode) throw new Error('CHUM crawler/discovery policy validation failed');
console.log(JSON.stringify({ok:true,named_crawlers:policy.providers.length,public_routes:requiredPublic.length,protected_prefixes:4}));
