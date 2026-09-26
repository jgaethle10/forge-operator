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
  'resilient application identity across authorized network changes',
  'temporary airborne network relay software for civilian disaster recovery',
  'authenticated airborne edge compute relay'
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
const airRelay=(manifest.software_capabilities||[]).find((r)=>r.id==='air-relay-planning-v2');
if(!airRelay) fail('Air Relay capability missing');
if(airRelay.state!=='source_verified_software_only') fail('Air Relay software evidence state drifted');
if(airRelay.field_state!=='not_field_verified') fail('Air Relay field truth boundary drifted');
if(airRelay.invocation_state!=='discovery_only_no_flight_control') fail('Air Relay invocation boundary drifted');
if(!(airRelay.verified_evidence||[]).includes('systemia/network/nodeseed-placement-label-proof.mjs')) fail('Air Relay placement proof missing');

for(const path of ['public/network/index.html','public/network/llms.txt','public/network/discovery.json','public/.well-known/evercraft-network.json','public/network/mesh/civilian-air-relay/index.html']) if(!fs.existsSync(path)) fail('surface missing: '+path);

const generated=JSON.parse(fs.readFileSync('public/chum/products/evercraft-network/ai-discovery.json','utf8'));
const generatedIntents=new Set((generated.intents||[]).map(normalize));
for(const phrase of required) if(!generatedIntents.has(normalize(phrase))) fail('CHUM mirror missing generated intent: '+phrase);

const watershed=JSON.parse(fs.readFileSync('public/.well-known/evercraft-discovery.json','utf8'));
if(watershed.start_here?.network!=='/.well-known/evercraft-network.json') fail('generated discovery watershed missing Network front door');

const sitemap=fs.readFileSync('public/sitemap.xml','utf8');
for(const route of ['/network/','/network/llms.txt','/network/discovery.json','/.well-known/evercraft-network.json','/network/mesh/civilian-air-relay/']) if(!sitemap.includes(route)) fail('generated sitemap missing '+route);

const html=fs.readFileSync('public/network/index.html','utf8');
if(!html.includes('Application continuity across changing authorized internet paths')) fail('semantic landing category anchor missing');
if(!html.includes('application/ld+json')) fail('semantic landing JSON-LD missing');

console.log('NETWORK_DISCOVERY_PASS',JSON.stringify({
  canonical_intents:product.intents.length,
  generated_intents:generated.intents.length,
  tools:manifest.machine_routes.tools.length,
  billing_live:manifest.commercial_state.billing_live,
  air_relay_state:airRelay.state,
  air_relay_field_state:airRelay.field_state
}));
