import fs from 'node:fs';

const fail=(m)=>{throw new Error('NETWORK_SEMANTIC_MESH_FAIL: '+m)};
const expected=[
  'application-continuity',
  'wifi-cellular-transition',
  'device-reconnect-visibility',
  'business-connectivity-resilience',
  'household-connectivity-resilience'
];

const mesh=JSON.parse(fs.readFileSync('public/network/mesh/index.json','utf8'));
if(mesh.schema!=='evercraft.network.semantic-mesh.v1') fail('mesh schema drifted');
if(mesh.product_key!=='evercraft-network') fail('mesh product key drifted');
if(mesh.machine_route?.state!=='production_mcp_verified_read_only_capability_call') fail('mesh machine route state drifted');
if(mesh.machine_route?.registry_name!=='io.github.jgaethle10/evercraft-machine-commerce') fail('mesh registry route drifted');
if(mesh.machine_route?.executed_verified?.length!==1 || mesh.machine_route.executed_verified[0]!=='get_network_capabilities') fail('mesh executed proof drifted');
if(!String(mesh.machine_route?.evidence||'').includes('2026-09-26-evercraft-network-mcp.json')) fail('machine route evidence missing');
if(!Array.isArray(mesh.pages) || mesh.pages.length!==expected.length) fail('unexpected mesh page count');

const seen=new Set();
for(const page of mesh.pages){
  if(seen.has(page.slug)) fail('duplicate slug: '+page.slug);
  seen.add(page.slug);
  if(!expected.includes(page.slug)) fail('unexpected slug: '+page.slug);
  const file='public'+page.url+'index.html';
  if(!fs.existsSync(file)) fail('missing mesh page: '+file);
  const html=fs.readFileSync(file,'utf8');
  if(!html.includes('Evercraft Network')) fail('missing product anchor: '+page.slug);
  if(!html.includes('Truth boundary')) fail('missing truth boundary: '+page.slug);
  if(!html.includes('/network/discovery.json')) fail('missing machine discovery link: '+page.slug);
  if(!html.includes('application/ld+json')) fail('missing JSON-LD: '+page.slug);
  if(!html.includes('Live MCP evidence')) fail('missing live MCP evidence link: '+page.slug);
  if(!html.includes('get_network_capabilities')) fail('missing verified capability tool: '+page.slug);
  if(/[\u2013\u2014]/.test(html)) fail('forbidden dash character: '+page.slug);
}

for(const slug of expected) if(!seen.has(slug)) fail('missing expected slug: '+slug);

const llms=fs.readFileSync('public/network/mesh/llms.txt','utf8');
if(!llms.includes('Shared truth boundary')) fail('mesh llms boundary missing');
if(!llms.includes('## Verified machine route')) fail('mesh llms verified route missing');
if(!llms.includes('get_network_capabilities')) fail('mesh llms capability proof missing');

const rootLlms=fs.readFileSync('public/network/llms.txt','utf8');
if(!rootLlms.includes('/network/mesh/')) fail('Network llms guide missing semantic mesh');

const sitemap=fs.readFileSync('public/sitemap.xml','utf8');
for(const route of ['/network/mesh/','/network/mesh/index.json','/network/mesh/llms.txt',...expected.map(s=>'/network/mesh/'+s+'/')]){
  if(!sitemap.includes(route)) fail('generated sitemap missing '+route);
}

console.log('NETWORK_SEMANTIC_MESH_PASS',JSON.stringify({pages:mesh.pages.length}));
