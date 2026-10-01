import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

execFileSync(process.execPath,['systemia/chum/build-capability-mirror.mjs'],{stdio:'inherit'});

const specs=JSON.parse(fs.readFileSync('distribution/direct-plugin-specs.json','utf8'));
const index=JSON.parse(fs.readFileSync('public/chum/capabilities.json','utf8'));
const byId=new Map(index.capabilities.map(x=>[x.public_id,x]));
const LIVE_DIRECT_STATES=new Set([
  'registry_published_direct_mcp_existing',
  'public_https_verified_registry_pending',
]);
const isLegacyProvider=(value)=>typeof value==='string' && /(^https?:\/\/base44\.app(?:\/|$))|(^https?:\/\/[^/]+\.base44\.app(?:\/|$))/i.test(value);
const isDirectLive=(product)=>
  LIVE_DIRECT_STATES.has(product.state) &&
  typeof product.mcp_url==='string' &&
  product.mcp_url.startsWith('https://') &&
  !isLegacyProvider(product.mcp_url);
const isRegistryPublished=(product)=>
  product.state==='registry_published_direct_mcp_existing' &&
  typeof product.registry_name==='string';

let mapped=0;
for(const product of specs.products){
  for(const id of product.capability_public_ids||[]){
    const capability=byId.get(id);
    assert.ok(capability,'missing generated capability '+id);
    if(isDirectLive(product)){
      mapped++;
      assert.equal(capability.preferred_agent_route,'direct_specialist',id+': should prefer specialist');
      assert.ok(capability.direct_specialist,id+': missing direct_specialist');
      assert.equal(capability.direct_specialist.product,product.name,id+': specialist product drift');
      assert.equal(
        capability.direct_specialist.registry_name,
        isRegistryPublished(product)?product.registry_name:null,
        id+': registry drift'
      );
      assert.equal(
        capability.direct_specialist.registry_state,
        isRegistryPublished(product)?'published':'pending',
        id+': registry state drift'
      );
      assert.equal(capability.direct_specialist.mcp,product.mcp_url,id+': MCP drift');
      assert.equal(capability.direct_specialist.route_state,'preferred_when_available',id+': route state drift');
      assert.equal(capability.direct_specialist.fallback_mcp,index.universal_mcp,id+': fallback MCP drift');

      const llms=fs.readFileSync('public/chum/capabilities/'+id+'/llms.txt','utf8');
      assert.match(llms,/Preferred agent route: direct specialist/);
      assert.ok(llms.includes('Direct MCP: '+product.mcp_url),id+': llms direct MCP missing');
      assert.ok(llms.includes('Universal Evercraft fallback MCP: '+index.universal_mcp),id+': llms fallback missing');
      if(isRegistryPublished(product)){
        assert.ok(llms.includes('Official MCP Registry name: '+product.registry_name),id+': registry name missing');
      }else{
        assert.match(llms,/MCP Registry state: pending/);
      }
    }else{
      assert.equal(product.registry_name,null,product.slug+': held specialist must not claim registry publication');
      assert.equal(capability.preferred_agent_route,'universal_fallback',id+': held specialist must keep universal fallback');
      assert.equal(capability.direct_specialist,null,id+': held specialist must not expose direct route');
    }
  }
}

const control=byId.get('agent-proving-mission-v1');
assert.ok(control,'control capability missing');
assert.equal(control.preferred_agent_route,'universal_fallback');
assert.equal(control.direct_specialist,null);

const sellNow=JSON.parse(fs.readFileSync('public/chum/sell-now.json','utf8'));
const sellById=new Map(sellNow.offers.map(x=>[x.public_id,x]));
const specialistByCapability=new Map();
for(const product of specs.products){
  for(const id of product.capability_public_ids||[]) specialistByCapability.set(id,product);
}
for(const id of ['aliev-site-opportunity-snapshot-v1','audit-center-website-audit-machine-v1','eventwave-paid-promotion-v1']){
  const row=sellById.get(id);
  if(!row) continue;
  const product=specialistByCapability.get(id);
  if(product&&isDirectLive(product)){
    assert.equal(row.preferred_agent_route,'direct_specialist',id+': verified owned sell-now specialist should be direct');
    assert.ok(row.direct_specialist?.mcp,id+': verified owned specialist MCP missing');
  }else{
    assert.equal(row.preferred_agent_route,'universal_fallback',id+': unverified specialist must fail closed to fallback');
    assert.equal(row.direct_specialist,null,id+': unverified specialist must not expose a direct MCP');
  }
}

const expectedMapped=specs.products
  .filter(isDirectLive)
  .flatMap(p=>p.capability_public_ids||[]).length;
assert.equal(mapped,expectedMapped,'generated direct routes must exactly match verified owned specialist routes');

console.log('CHUM_DIRECT_SPECIALIST_ROUTING_PASS',JSON.stringify({
  mapped_capabilities:mapped,
  registry_pending_direct_capabilities:specs.products
    .filter(p=>isDirectLive(p)&&!isRegistryPublished(p))
    .flatMap(p=>p.capability_public_ids||[]).length,
  total_capabilities:index.capabilities.length,
  universal_fallback:index.universal_mcp
}));
