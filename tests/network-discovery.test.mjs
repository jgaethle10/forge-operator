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
const MCP='https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceMcp';
const REGISTRY='io.github.jgaethle10/evercraft-machine-commerce';
const EVIDENCE='https://raw.githubusercontent.com/jgaethle10/forge-operator/main/conformance/runtime-observations/2026-09-26-evercraft-network-mcp.json';

const directory=JSON.parse(fs.readFileSync('public/.well-known/evercraft-products.json','utf8'));
const product=(directory.products||[]).find((r)=>r.product_key==='evercraft-network');
if(!product) fail('canonical product contract missing');
const intents=new Set((product.intents||[]).map(normalize));
for(const phrase of required) if(!intents.has(normalize(phrase))) fail('missing canonical intent: '+phrase);
if(!String(product.authority||'').includes('bounded read-only MCP capability inspection')) fail('canonical authority did not preserve bounded MCP inspection');

const root=fs.readFileSync('llms.txt','utf8');
if(!root.includes('## Evercraft Network: application continuity and network resilience')) fail('root llms Network section missing');
for(const tool of ['get_network_capabilities','get_network_presence','prepare_network_handoff']) if(!root.includes(tool)) fail('root llms missing '+tool);
if(!root.includes('Verified Network route:')) fail('root llms did not publish verified Network route');

const manifest=JSON.parse(fs.readFileSync('public/network/discovery.json','utf8'));
if(manifest.product_key!=='evercraft-network') fail('manifest product key drifted');
if(manifest.machine_routes?.invocation_state!=='production_mcp_verified_read_only_capability_call') fail('invocation truth boundary drifted');
if(manifest.machine_routes?.verification?.server?.version!=='1.3.1') fail('verified server version drifted');
if(manifest.commercial_state?.billing_live!==false) fail('billing must remain false until independently verified');
for(const tool of ['get_network_capabilities','get_network_presence','prepare_network_handoff']) if(!(manifest.machine_routes?.tools||[]).some((r)=>r.name===tool)) fail('manifest missing '+tool);
const capabilityTool=manifest.machine_routes.tools.find((r)=>r.name==='get_network_capabilities');
const presenceTool=manifest.machine_routes.tools.find((r)=>r.name==='get_network_presence');
const handoffTool=manifest.machine_routes.tools.find((r)=>r.name==='prepare_network_handoff');
if(capabilityTool?.verification!=='production_tools_list_and_read_only_call_verified') fail('capability call proof drifted');
if(presenceTool?.verification!=='production_tools_list_verified_execution_not_yet_canaried') fail('presence proof overstated or drifted');
if(handoffTool?.verification!=='production_tools_list_verified_execution_not_yet_canaried') fail('handoff proof overstated or drifted');

const registry=JSON.parse(fs.readFileSync('registry/catalog.json','utf8'));
const registryProduct=(registry.products||[]).find((r)=>r.product_key==='evercraft-network');
if(!registryProduct) fail('registry catalog Network entry missing');
if(registryProduct.mode!=='bounded_read_only_mcp') fail('registry mode is not verified bounded MCP');
if(registryProduct.registry_name!==REGISTRY) fail('registry name drifted');
if(registryProduct.mcp!==MCP) fail('registry MCP route drifted');
if(registryProduct.live_canary_evidence!==EVIDENCE) fail('registry evidence route drifted');

const conformance=JSON.parse(fs.readFileSync('conformance/products.json','utf8'));
const conf=(conformance.products||[]).find((r)=>r.product_key==='evercraft-network');
if(!conf) fail('Network conformance source missing');
if(conf.conformance_state!=='live_read_only_mcp_verified') fail('Network conformance state drifted');
if(conf.machine_commerce_handoff_state!=='bounded_read_only_mcp_verified') fail('Network handoff state drifted');
if(conf.mcp_registry?.name!==REGISTRY) fail('Network conformance registry missing');
if(conf.live_canary_evidence!==EVIDENCE) fail('Network conformance evidence missing');

const evidencePath='conformance/runtime-observations/2026-09-26-evercraft-network-mcp.json';
if(!fs.existsSync(evidencePath)) fail('live MCP evidence receipt missing');
const evidence=JSON.parse(fs.readFileSync(evidencePath,'utf8'));
if(evidence.server_info?.version!=='1.3.1') fail('latest live MCP receipt server version drifted');
if(evidence.github_actions?.workflow_run_id!==36280593232) fail('live MCP evidence workflow run drifted');
if(evidence.github_actions?.artifact?.digest!=='sha256:2f29bde87952d89399f7df09d05792b3b250bc1e12eba38e27b63747d9565ce8') fail('live MCP evidence digest drifted');
if(evidence.verification?.live_read_only_call?.tool!=='get_network_capabilities' || evidence.verification.live_read_only_call.status!=='pass') fail('live read-only call proof missing');

for(const path of ['public/network/index.html','public/network/llms.txt','public/network/discovery.json','public/.well-known/evercraft-network.json']) if(!fs.existsSync(path)) fail('surface missing: '+path);

const generated=JSON.parse(fs.readFileSync('public/chum/products/evercraft-network/ai-discovery.json','utf8'));
const generatedIntents=new Set((generated.intents||[]).map(normalize));
for(const phrase of required) if(!generatedIntents.has(normalize(phrase))) fail('CHUM mirror missing generated intent: '+phrase);
if(generated.registry_name!==REGISTRY) fail('generated Network discovery registry missing');
if(generated.mcp!==MCP) fail('generated Network discovery MCP route missing');

const generatedConformance=JSON.parse(fs.readFileSync('public/chum/products/evercraft-network/ai-conformance.json','utf8'));
if(generatedConformance.registry_name!==REGISTRY) fail('generated Network conformance registry missing');
if(generatedConformance.mcp!==MCP) fail('generated Network conformance MCP route missing');
if(generatedConformance.live_canary_evidence!==EVIDENCE) fail('generated Network conformance evidence missing');

const capability=JSON.parse(fs.readFileSync('public/chum/capabilities/evercraft-network-resilience-membership-v1/capability.json','utf8'));
if(!String(capability.invocation_status||'').startsWith('LIVE READ-ONLY MCP VERIFIED:')) fail('generated Network capability did not preserve live MCP proof');
if(capability.commercial_state!=='discovery_only' || capability.offers?.[0]?.billing_live!==false) fail('machine route promotion accidentally changed billing state');

const networkWorkflow=fs.readFileSync('.github/workflows/network-mcp-canary.yml','utf8');
if(!networkWorkflow.includes('name: Evercraft Network MCP Canary')) fail('dedicated Network MCP canary missing');
if(!networkWorkflow.includes('node systemia/network/public-mcp-canary.mjs')) fail('dedicated Network canary does not execute Network proof');
if(networkWorkflow.includes('Verify remote MCP handshakes')) fail('Network canary incorrectly depends on portfolio-wide MCP handshakes');

const broadWorkflow=fs.readFileSync('.github/workflows/evercraft-mcp-canary.yml','utf8');
if(broadWorkflow.includes('systemia/network/public-mcp-canary.mjs')) fail('portfolio MCP canary still owns Network proof');
if(broadWorkflow.includes('public/network/**')) fail('portfolio MCP canary still triggers on Network-only changes');

const watershed=JSON.parse(fs.readFileSync('public/.well-known/evercraft-discovery.json','utf8'));
if(watershed.start_here?.network!=='/.well-known/evercraft-network.json') fail('generated discovery watershed missing Network front door');

const sitemap=fs.readFileSync('public/sitemap.xml','utf8');
for(const route of ['/network/','/network/llms.txt','/network/discovery.json','/.well-known/evercraft-network.json']) if(!sitemap.includes(route)) fail('generated sitemap missing '+route);

const html=fs.readFileSync('public/network/index.html','utf8');
if(!html.includes('Application continuity across changing authorized internet paths')) fail('semantic landing category anchor missing');
if(!html.includes('application/ld+json')) fail('semantic landing JSON-LD missing');
if(!html.includes('Live MCP evidence')) fail('semantic landing live evidence missing');

console.log('NETWORK_DISCOVERY_PASS',JSON.stringify({
  canonical_intents:product.intents.length,
  generated_intents:generated.intents.length,
  tools:manifest.machine_routes.tools.length,
  registry_name:registryProduct.registry_name,
  live_read_only_call:evidence.verification.live_read_only_call.tool,
  network_canary:'dedicated',
  billing_live:manifest.commercial_state.billing_live
}));
