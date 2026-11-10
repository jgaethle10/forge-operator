import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadFabricCatalogFromRepository,matchFabricCapabilities,executeFabricDirectoryRpc} from '../systemia/mcp/fabric-directory.mjs';
const source=JSON.parse(readFileSync(new URL('../systemia/mcp/fabric-catalog-supplements.json',import.meta.url),'utf8'));
test('Work Saban is included as an honest discovery-only capability',()=>{
  assert.equal(source.schema,'evercraft.fabric.catalog-supplements.v1');
  const catalog=loadFabricCatalogFromRepository();
  const item=catalog.find(x=>x.public_id==='work-saban-reporting-pilot-v1');
  assert.ok(item,'Work Saban missing from public MCP catalog');
  assert.equal(catalog.filter(x=>x.public_id===item.public_id).length,1);
  assert.equal(item.commercial_state,'discovery_only');
  assert.equal(item.state,'private_pilot_interest');
  assert.equal(item.entry_paid_offer,null);
  assert.equal(item.human_offer_url,null);
  assert.equal(item.start_url_state,'not_sell_now');
  assert.ok(item.connections.some(x=>x.type==='mcp'&&x.url==='https://fabric.systemiacommandcenters.com/mcp'&&x.state==='fallback_available'));
  assert.ok(!item.connections.some(x=>x.type==='mcp'&&x.state==='execution_ready'));
  assert.ok(item.connections.some(x=>x.type==='website'&&x.url==='https://jgaethle10.github.io/forge-operator/work-saban/'));
  assert.ok(!item.connections.some(x=>/base44\.app|buy\.stripe\.com/i.test(x.url||'')));
});
test('an explicit Work Saban request routes to Work Saban rather than an unrelated capability',()=>{
  const matches=matchFabricCapabilities('Work Saban private pilot: coordinated office task plan and checked report',loadFabricCatalogFromRepository(),{limit:6});
  assert.equal(matches[0]?.public_id,'work-saban-reporting-pilot-v1');
  assert.equal(matches[0]?.commercial_state,'discovery_only');
});
test('natural report demand finds Work Saban without knowing the brand',()=>{
  const matches=matchFabricCapabilities('I need a team of specialists to turn my monthly sales CSV into a checked management report',loadFabricCatalogFromRepository(),{limit:6});
  assert.ok(matches.slice(0,3).some(x=>x.public_id==='work-saban-reporting-pilot-v1'),'Work Saban did not surface for its bounded customer problem');
});
test('read-only MCP discovery does not create a buy button or execution authority',async()=>{
  const result=await executeFabricDirectoryRpc({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'match_evercraft_capability',arguments:{intent:'Work Saban monthly sales report team',limit:5}}},loadFabricCatalogFromRepository());
  assert.equal(result?.result?.isError,false);
  const m=result?.result?.structuredContent?.matches||[];
  assert.ok(m.some(x=>x.public_id==='work-saban-reporting-pilot-v1'));
  const entry=m.find(x=>x.public_id==='work-saban-reporting-pilot-v1');
  assert.equal(entry.human_offer_url,null);
  assert.equal(result.result.structuredContent.external_action_taken,false);
});
