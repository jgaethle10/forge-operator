import fs from 'node:fs';

const fail = (message) => {
  console.error('FAIL:', message);
  process.exitCode = 1;
};
const pass = (message) => console.log('PASS:', message);
const read = (path) => fs.readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));

const server = read('server.ts');
const robots = read('public/robots.txt');
const llms = read('public/llms.txt');
const guide = read('AI-DISCOVERY.md');
const mirrorBuilder = read('systemia/chum/build-public-mirror.mjs');
const chum = json('public/.well-known/evercraft-chum.json');
const discovery = json('public/.well-known/evercraft-discovery.json');
const aiDiscovery = json('public/ai-discovery.json');
const agent = json('public/.well-known/evercraft-agent.json');
const capabilities = json('public/.well-known/evercraft-capabilities.json');
const openapi = json('public/openapi.json');

const requireText = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} missing ${needle}`);
  else pass(`${label}: ${needle}`);
};

requireText(server, "app.get('/api/resolve'", 'server');
requireText(server, "app.post('/api/resolve'", 'server');
requireText(server, "app.get('/sitemap.xml'", 'server');
requireText(server, "app.get('/robots.txt'", 'server');
requireText(server, "payment_obligation_created: false", 'resolver boundary');
requireText(mirrorBuilder, "fs.writeFileSync(path.join(dir, 'index.html')", 'CHUM mirror builder');

for (const token of ['OAI-SearchBot','ChatGPT-User','Claude-SearchBot','Claude-User','Googlebot','Google-Extended','bingbot','PerplexityBot']) {
  requireText(robots, token, 'robots');
}
requireText(robots, 'Allow: /api/resolve', 'robots');
requireText(robots, 'Allow: /chum/', 'robots');
requireText(llms, '/api/resolve', 'llms');
requireText(guide, '/api/resolve', 'AI-DISCOVERY');

if (chum.public_entrypoints?.llms !== 'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/llms.txt') {
  fail('CHUM raw llms entrypoint is stale or broken');
} else pass('CHUM raw llms entrypoint');

for (const [label, value] of [
  ['watershed resolver', discovery.machine_readable?.resolver],
  ['compact discovery resolver', aiDiscovery.start_here?.resolver],
  ['agent resolver', agent.start_here?.resolver],
  ['capability resolver', capabilities.discovery?.resolver],
]) {
  if (value !== '/api/resolve') fail(`${label} must be /api/resolve`);
  else pass(label);
}

if (!openapi.paths?.['/api/resolve']?.get || !openapi.paths?.['/api/resolve']?.post) {
  fail('OpenAPI must expose GET and POST /api/resolve');
} else pass('OpenAPI resolver');

if (chum.protocol_posture?.a2a !== 'not_advertised_until_required_protocol_operations_are_implemented') {
  fail('CHUM must not claim A2A before the protocol endpoint exists');
} else pass('A2A truth boundary');

if (process.exitCode) throw new Error('CHUM watershed contract validation failed');
console.log('CHUM WATERSHED CONTRACT PASS');
