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
if(manifest.machine_routes?.invocation_state!=='production_mcp_verified_read_only_capability_call') fail('invocation truth boundary drifted');
if(manifest.commercial_state?.billing_live!==false) fail('billing must remain false until independently verified');
for(const tool of ['get_network_capabilities','get_network_presence','prepare_network_handoff']) if(!(manifest.machine_routes?.tools||[]).some((r)=>r.name===tool)) fail('manifest missing '+tool);
const capabilityTool=manifest.machine_routes.tools.find((r)=>r.name==='get_network_capabilities');
const presenceTool=manifest.machine_routes.tools.find((r)=>r.name==='get_network_presence');
const handoffTool=manifest.machine_routes.tools.find((r)=>r.name==='prepare_network_handoff');
if(capabilityTool?.verification!=='production_tools_list_and_read_only_call_verified') fail('capability call proof drifted');
if(presenceTool?.verification!=='production_tools_list_verified_execution_not_yet_canaried') fail('presence proof overstated or drifted');
if(handoffTool?.verification!=='production_tools_list_verified_execution_not_yet_canaried') fail('handoff proof overstated or drifted');
if(manifest.machine_routes?.verification?.executed_verified?.length!==1 || manifest.machine_routes.verification.executed_verified[0]!=='get_network_capabilities') fail('executed verification set drifted');

for(const path of ['public/network/index.html','public/network/llms.txt','public/network/discovery.json','public/.well-known/evercraft-network.json']) if(!fs.existsSync(path)) fail('surface missing: '+path);

const generated=JSON.parse(fs.readFileSync('public/chum/products/evercraft-network/ai-discovery.json','utf8'));
const generatedIntents=new Set((generated.intents||[]).map(normalize));
for(const phrase of required) if(!generatedIntents.has(normalize(phrase))) fail('CHUM mirror missing generated intent: '+phrase);

const registry=JSON.parse(fs.readFileSync('registry/catalog.json','utf8'));
const registryProduct=(registry.products||[]).find((r)=>r.product_key==='evercraft-network');
if(!registryProduct) fail('registry catalog Network entry missing');
if(registryProduct.mode!=='bounded_read_only_mcp') fail('registry mode is not verified bounded MCP');
if(registryProduct.registry_name!=='io.github.jgaethle10/evercraft-machine-commerce') fail('registry name drifted');
if(registryProduct.mcp!=='https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceMcp') fail('registry MCP route drifted');

const evidencePath='conformance/runtime-observations/2026-09-26-evercraft-network-mcp.json';
if(!fs.existsSync(evidencePath)) fail('live MCP evidence receipt missing');
const evidence=JSON.parse(fs.readFileSync(evidencePath,'utf8'));
if(evidence.github_actions?.workflow_run_id!==36214150440) fail('live MCP evidence workflow run drifted');
if(evidence.github_actions?.artifact?.digest!=='sha256:cf3dea0825b31fee765bf45ffde51c785fd704b39852ba9a85841c5c0c323a3b') fail('live MCP evidence digest drifted');
if(evidence.verification?.live_read_only_call?.tool!=='get_network_capabilities' || evidence.verification.live_read_only_call.status!=='pass') fail('live read-only call proof missing');

const generatedConformance=JSON.parse(fs.readFileSync('public/chum/products/evercraft-network/ai-conformance.json','utf8'));
if(generatedConformance.registry_name!=='io.github.jgaethle10/evercraft-machine-commerce') fail('generated Network conformance registry missing');
if(generatedConformance.mcp!==registryProduct.mcp) fail('generated Network conformance MCP route missing');
const generatedDiscovery=JSON.parse(fs.readFileSync('public/chum/products/evercraft-network/ai-discovery.json','utf8'));
if(generatedDiscovery.registry_name!=='io.github.jgaethle10/evercraft-machine-commerce') fail('generated Network discovery registry missing');
if(generatedDiscovery.mcp!==registryProduct.mcp) fail('generated Network discovery MCP route missing');

const capability=JSON.parse(fs.readFileSync('public/chum/capabilities/evercraft-network-resilience-membership-v1/capability.json','utf8'));
if(!String(capability.invocation_status||'').startsWith('LIVE READ-ONLY MCP VERIFIED:')) fail('generated Network capability did not preserve live MCP proof');
if(capability.commercial_state!=='discovery_only' || capability.offers?.[0]?.billing_live!==false) fail('machine route promotion accidentally changed billing state');

const watershed=JSON.parse(fs.readFileSync('public/.well-known/evercraft-discovery.json','utf8'));
if(watershed.start_here?.network!=='/.well-known/evercraft-network.json') fail('generated discovery watershed missing Network front door');

const sitemap=fs.readFileSync('public/sitemap.xml','utf8');
for(const route of ['/network/','/network/llms.txt','/network/discovery.json','/.well-known/evercraft-network.json']) if(!sitemap.includes(route)) fail('generated sitemap missing '+route);

const html=fs.readFileSync('public/network/index.html','utf8');
if(!html.includes('Application continuity across changing authorized internet paths')) fail('semantic landing category anchor missing');
if(!html.includes('application/ld+json')) fail('semantic landing JSON-LD missing');

console.log('NETWORK_DISCOVERY_PASS',JSON.stringify({
  canonical_intents:product.intents.length,
  generated_intents:generated.intents.length,
  tools:manifest.machine_routes.tools.length,
  registry_name:registryProduct.registry_name,
  live_read_only_call:evidence.verification.live_read_only_call.tool,
  billing_live:manifest.commercial_state.billing_live
}));
