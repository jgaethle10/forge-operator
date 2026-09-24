import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const json = (p) => JSON.parse(read(p));
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const pass = (m) => console.log('PASS:', m);

const required = [
  'public/llms.txt',
  'public/llms-full.txt',
  'public/robots.txt',
  'public/sitemap.xml',
  'public/ai-discovery.json',
  'public/openapi.json',
  'public/.well-known/evercraft-capabilities.json',
  'public/.well-known/evercraft-products.json',
  'public/.well-known/evercraft-chum.json',
  'public/.well-known/evercraft-agent.json',
  'public/chum/index.html'
];

for (const p of required) {
  if (!fs.existsSync(p)) fail(`missing ${p}`);
  else pass(`present ${p}`);
}

const robots = read('public/robots.txt');
for (const bot of ['OAI-SearchBot','GPTBot','ClaudeBot','Claude-SearchBot','Googlebot','Google-Extended']) {
  if (!robots.includes(bot)) fail(`robots missing explicit ${bot} policy`);
  else pass(`robots exposes ${bot}`);
}

const discovery = json('public/ai-discovery.json');
if (!discovery.routes?.product_directory || !discovery.routes?.chum) fail('AI discovery index missing portfolio/CHUM routes');
else pass('AI discovery index routes portfolio + CHUM');

const agent = json('public/.well-known/evercraft-agent.json');
if (agent.invocation?.protocol !== 'MCP' || !agent.invocation?.endpoint) fail('cross-LLM descriptor missing MCP invocation');
else pass('cross-LLM descriptor exposes MCP invocation');

const chum = json('public/.well-known/evercraft-chum.json');
if (chum.name !== 'CHUM') fail('CHUM manifest identity mismatch');
else pass('CHUM manifest identity');

const api = json('public/openapi.json');
if (!api.paths?.['/api/forge'] || !api.paths?.['/api/resolve/media-overflow']) fail('OpenAPI missing public invocation paths');
else pass('OpenAPI exposes public invocation paths');

if (process.exitCode) throw new Error('CHUM watershed validation failed');
console.log('CHUM WATERSHED PASS');
