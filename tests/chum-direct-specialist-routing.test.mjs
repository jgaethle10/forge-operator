import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

execFileSync(process.execPath,['systemia/chum/build-capability-mirror.mjs'],{stdio:'inherit'});

const specs=JSON.parse(fs.readFileSync('distribution/direct-plugin-specs.json','utf8'));
const index=JSON.parse(fs.readFileSync('public/chum/capabilities.json','utf8'));
const byId=new Map(index.capabilities.map(x=>[x.public_id,x]));

let mapped=0;
for(const product of specs.products){
  for(const id of product.capability_public_ids||[]){
    const capability=byId.get(id);
    assert.ok(capability,'missing generated capability '+id);
    if(product.state==='registry_published_direct_mcp_existing'){
      mapped++;
      assert.equal(capability.preferred_agent_route,'direct_specialist',id+': should prefer specialist');
      assert.ok(capability.direct_specialist,id+': missing direct_specialist');
      assert.equal(capability.direct_specialist.product,product.name,id+': specialist product drift');
      assert.equal(capability.direct_specialist.registry_name,product.registry_name,id+': registry drift');
      assert.equal(capability.direct_specialist.mcp,product.mcp_url,id+': MCP drift');
      assert.equal(capability.direct_specialist.route_state,'preferred_when_available',id+': route state drift');
      assert.equal(capability.direct_specialist.fallback_mcp,index.universal_mcp,id+': fallback MCP drift');

      const llms=fs.readFileSync('public/chum/capabilities/'+id+'/llms.txt','utf8');
      assert.match(llms,/Preferred agent route: direct specialist/);
      assert.ok(llms.includes('Direct MCP: '+product.mcp_url),id+': llms direct MCP missing');
      assert.ok(llms.includes('Universal Evercraft fallback MCP: '+index.universal_mcp),id+': llms fallback missing');
    }else{
      assert.equal(product.registry_name,null,product.slug+': held specialist must not claim registry publication');
    }
  }
}

const control=byId.get('agent-proving-mission-v1');
assert.ok(control,'control capability missing');
assert.equal(control.preferred_agent_route,'universal_fallback');
assert.equal(control.direct_specialist,null);

const sellNow=JSON.parse(fs.readFileSync('public/chum/sell-now.json','utf8'));
const sellById=new Map(sellNow.offers.map(x=>[x.public_id,x]));
for(const id of ['aliev-site-opportunity-snapshot-v1','audit-center-website-audit-machine-v1','eventwave-paid-promotion-v1']){
  const row=sellById.get(id);
  if(!row) continue;
  assert.equal(row.preferred_agent_route,'direct_specialist',id+': sell-now route should be direct');
  assert.ok(row.direct_specialist?.mcp,id+': sell-now specialist MCP missing');
}

assert.ok(mapped>=10,'expected at least ten capability records with direct specialist routing');

console.log('CHUM_DIRECT_SPECIALIST_ROUTING_PASS',JSON.stringify({
  mapped_capabilities:mapped,
  total_capabilities:index.capabilities.length,
  universal_fallback:index.universal_mcp
}));
