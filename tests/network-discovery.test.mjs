import fs from 'node:fs';

const fail=(m)=>{throw new Error('NETWORK_DISCOVERY_FAIL: '+m)};
const normalize=(v)=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const required=[
  'keep my application connected when Wi-Fi and cellular paths change',
  'application continuity across changing internet connections',
  'software network continuity without changing carriers',
  'household connectivity resilience software',
  'business connectivity resilience software',
  'device reconnect and health visibility',
  'continuity visibility when an authorized internet path changes',
  'resilient application identity across authorized network changes'
];

const directory=JSON.parse(fs.readFileSync('public/.well-known/evercraft-products.json','utf8'));
const product=(directory.products||[]).find((r)=>r.product_key==='evercraft-network');
if(!product) fail('canonical product contract missing');
const intents=new Set((product.intents||[]).map(normalize));
for(const phrase of required) if(!intents.has(normalize(phrase))) fail('missing canonical intent: '+phrase);

const root=fs.readFileSync('llms.txt','utf8');
if(!root.includes('## Evercraft Network: application continuity and network resilience')) fail('root llms Network section missing');
for(const tool of ['get_network_capabilities','get_network_presence','prepare_network_handoff']) if(!root.includes(tool)) fail('root llms missing '+tool);

const manifest=JSON.parse(fs.readFileSync('public/network/discovery.json','utf8'));
if(manifest.product_key!=='evercraft-network') fail('manifest product key drifted');
if(manifest.machine_routes?.invocation_state!=='source_wired_pending_independent_production_verification') fail('invocation truth boundary drifted');
if(manifest.commercial_state?.billing_live!==false) fail('billing must remain false until independently verified');
for(const tool of ['get_network_capabilities','get_network_presence','prepare_network_handoff']) if(!(manifest.machine_routes?.tools||[]).some((r)=>r.name===tool)) fail('manifest missing '+tool);

for(const path of ['public/network/index.html','public/network/llms.txt','public/network/discovery.json','public/.well-known/evercraft-network.json']) if(!fs.existsSync(path)) fail('surface missing: '+path);
const html=fs.readFileSync('public/network/index.html','utf8');
if(!html.includes('Application continuity across changing authorized internet paths')) fail('semantic landing category anchor missing');
if(!html.includes('application/ld+json')) fail('semantic landing JSON-LD missing');

const sitemap=fs.readFileSync('public/sitemap.xml','utf8');
for(const route of ['/network/','/network/llms.txt','/network/discovery.json','/.well-known/evercraft-network.json']) if(!sitemap.includes(route)) fail('sitemap missing '+route);

console.log('NETWORK_DISCOVERY_PASS',JSON.stringify({intents:product.intents.length,tools:manifest.machine_routes.tools.length,billing_live:manifest.commercial_state.billing_live}));
