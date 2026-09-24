import fs from 'node:fs';

const robots = fs.readFileSync('public/robots.txt', 'utf8');
const policy = JSON.parse(fs.readFileSync('systemia/chum/crawler-policy.json', 'utf8'));
const fail = (message) => { console.error('FAIL:', message); process.exitCode = 1; };

for (const item of policy.providers || []) {
  if (item.allow && !robots.includes(`User-agent: ${item.robots_token}`)) {
    fail(`robots.txt missing explicitly allowed crawler ${item.robots_token}`);
  }
}
for (const path of policy.public_surface_scope || []) {
  if (path === '/') continue;
  if (!robots.includes(`Allow: ${path}`)) fail(`robots.txt missing public allow ${path}`);
}
for (const path of policy.protected_crawl_scope || []) {
  if (!robots.includes(`Disallow: ${path}`)) fail(`robots.txt missing protected prefix ${path}`);
}
for (const file of [
  'public/llms.txt',
  'public/llms-full.txt',
  'public/openapi.json',
  'public/.well-known/evercraft-chum.json',
  'public/.well-known/evercraft-products.json',
  'public/.well-known/evercraft-agent.json',
  'public/.well-known/evercraft-agent-interfaces.json'
]) {
  if (!fs.existsSync(file)) fail(`missing discovery artifact ${file}`);
}
const llms = fs.readFileSync('public/llms.txt','utf8');
for (const needle of ['/llms-full.txt','/openapi.json','/.well-known/evercraft-chum.json','/api/discovery']) {
  if (!llms.includes(needle)) fail(`public llms.txt missing ${needle}`);
}
if (process.exitCode) throw new Error('CHUM public discovery policy check failed');
console.log(JSON.stringify({ok:true,crawlers:policy.providers.length,public_surfaces:policy.public_surface_scope.length,protected_prefixes:policy.protected_crawl_scope.length}));
