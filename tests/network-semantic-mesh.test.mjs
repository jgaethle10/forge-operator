import fs from 'node:fs';

const fail=(m)=>{throw new Error('NETWORK_SEMANTIC_MESH_FAIL: '+m)};
const expected=[
  'application-continuity',
  'wifi-cellular-transition',
  'device-reconnect-visibility',
  'business-connectivity-resilience',
  'household-connectivity-resilience',
  'civilian-air-relay'
];

const mesh=JSON.parse(fs.readFileSync('public/network/mesh/index.json','utf8'));
if(mesh.schema!=='evercraft.network.semantic-mesh.v1') fail('mesh schema drifted');
if(mesh.product_key!=='evercraft-network') fail('mesh product key drifted');
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
  if(/[\u2013\u2014]/.test(html)) fail('forbidden dash character: '+page.slug);
}

for(const slug of expected) if(!seen.has(slug)) fail('missing expected slug: '+slug);

const llms=fs.readFileSync('public/network/mesh/llms.txt','utf8');
if(!llms.includes('Shared truth boundary')) fail('mesh llms boundary missing');

const rootLlms=fs.readFileSync('public/network/llms.txt','utf8');
if(!rootLlms.includes('/network/mesh/')) fail('Network llms guide missing semantic mesh');
if(!rootLlms.includes('/network/mesh/civilian-air-relay/')) fail('Network llms guide missing Air Relay route');
const airHtml=fs.readFileSync('public/network/mesh/civilian-air-relay/index.html','utf8');
if(!airHtml.includes('not field verified') && !airHtml.includes('field-unverified')) fail('Air Relay field boundary missing');
if(!airHtml.includes('does not perform autonomous flight control')) fail('Air Relay flight-control boundary missing');

const sitemap=fs.readFileSync('public/sitemap.xml','utf8');
for(const route of ['/network/mesh/','/network/mesh/index.json','/network/mesh/llms.txt',...expected.map(s=>'/network/mesh/'+s+'/')]){
  if(!sitemap.includes(route)) fail('generated sitemap missing '+route);
}

console.log('NETWORK_SEMANTIC_MESH_PASS',JSON.stringify({pages:mesh.pages.length}));
