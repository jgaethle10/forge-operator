import fs from 'node:fs';
import assert from 'node:assert/strict';

const readJson=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));
const specs=readJson('distribution/direct-plugin-specs.json');
const publicDoors=readJson('public/.well-known/evercraft-direct-doors.json');
const distributionDoors=readJson('distribution/direct-product-doors.json');

assert.equal(publicDoors.schema,'evercraft.direct-product-doors.v1');
assert.equal(publicDoors.generated_from,'distribution/direct-plugin-specs.json');
assert.deepEqual(publicDoors.routing_policy,specs.routing_policy);
assert.deepEqual(distributionDoors,publicDoors);

const specByName=new Map(specs.products.map(p=>[p.name,p]));
const doorByName=new Map(publicDoors.doors.map(d=>[d.product,d]));

assert.equal(doorByName.size,specByName.size,'door count must equal canonical product spec count');

for(const [name,p] of specByName){
  const door=doorByName.get(name);
  assert.ok(door,'missing direct door: '+name);
  assert.equal(door.intent,p.intent,name+': intent drift');
  assert.equal(door.registry_name,p.registry_name,name+': registry drift');
  const expectedMcp=p.state==='registry_published_direct_mcp_existing'?p.mcp_url:null;
  assert.equal(door.remote_mcp,expectedMcp,name+': MCP URL drift');
  assert.equal(door.runtime_path||null,p.runtime_path||null,name+': runtime path drift');
  assert.equal(door.runtime_workload_class||null,p.runtime_workload_class||null,name+': runtime workload drift');
  assert.equal(door.public_origin_state||null,p.public_origin_state||null,name+': public origin state drift');
  assert.equal(door.plugin_package,'plugins/'+p.slug,name+': plugin package drift');
  assert.equal(door.state,p.state,name+': state drift');
  assert.equal(door.truth_boundary,p.truth_boundary,name+': truth-boundary drift');

  for(const rel of [
    'plugin.json',
    'mcp.json',
    '.mcp.json',
    '.codex-plugin/plugin.json',
    'skills/'+p.slug+'-direct/SKILL.md'
  ]){
    assert.ok(fs.existsSync('plugins/'+p.slug+'/'+rel),name+': missing '+rel);
  }

  const plugin=readJson('plugins/'+p.slug+'/plugin.json');
  assert.equal(plugin.name,p.slug,name+': plugin name drift');

  const mcp=readJson('plugins/'+p.slug+'/mcp.json');
  const servers=Object.values(mcp.mcpServers||{});
  if(p.state==='registry_published_direct_mcp_existing'){
    const server=servers[0];
    assert.ok(server,name+': missing MCP server config');
    assert.equal(server.url,p.mcp_url,name+': plugin MCP URL drift');
  }else{
    assert.equal(servers.length,0,name+': held package must not expose an MCP server');
  }

  const codex=readJson('plugins/'+p.slug+'/.codex-plugin/plugin.json');
  assert.equal(codex.interface?.displayName,p.name,name+': display name drift');
  assert.equal(codex.interface?.websiteURL,p.website_url,name+': website drift');

  if(p.state==='registry_published_direct_mcp_existing'){
    assert.match(p.registry_name,/^io\.github\.jgaethle10\//,name+': registry-backed product must have official namespace');
  }else{
    assert.equal(p.registry_name,null,name+': held product must not claim registry publication');
    assert.ok(plugin.releaseState,name+': held product must expose releaseState');
    assert.ok(codex.releaseState,name+': held Codex plugin must expose releaseState');
    if(p.runtime_path){
      assert.equal(plugin.pendingRuntimePath,p.runtime_path,name+': plugin pending runtime path drift');
      assert.equal(codex.pendingRuntimePath,p.runtime_path,name+': Codex pending runtime path drift');
    }
    if(p.public_origin_state){
      assert.equal(plugin.publicOriginState,p.public_origin_state,name+': plugin public origin state drift');
      assert.equal(codex.publicOriginState,p.public_origin_state,name+': Codex public origin state drift');
    }
  }
}

const aiDiscovery=fs.readFileSync('AI-DISCOVERY.md','utf8');
assert.match(aiDiscovery,/direct-door-first routing model/i);
assert.match(aiDiscovery,/universal Evercraft router exists for ambiguity/i);
assert.match(aiDiscovery,/evercraft-direct-doors\.json/i);

const suiteSkill=fs.readFileSync('plugins/evercraft-ai-suite/skills/evercraft-ai-router/SKILL.md','utf8');
assert.match(suiteSkill,/dedicated Evercraft specialist plugin or MCP/i);
assert.match(suiteSkill,/fallback when no dedicated specialist is available/i);

console.log('DIRECT_PRODUCT_DOORS_PASS',JSON.stringify({
  direct_doors:publicDoors.doors.length,
  registry_backed_specialists:specs.products.filter(p=>p.state==='registry_published_direct_mcp_existing').length,
  held:specs.products.filter(p=>p.state!=='registry_published_direct_mcp_existing').map(p=>p.slug)
}));
