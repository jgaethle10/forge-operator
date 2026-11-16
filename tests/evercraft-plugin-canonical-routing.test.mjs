import test from 'node:test';
import assert from 'node:assert/strict';
import {
 loadFabricCatalogFromRepository,
 matchFabricCapabilities,
 executeFabricDirectoryRpc,
} from '../systemia/mcp/fabric-directory.mjs';

const catalog=loadFabricCatalogFromRepository();
const named='ForensiScope';
const video='this video is too large for AI; produce a timestamped evidence timeline';
const canonical='forensiscope-evidence-review-v1';
const duplicate='product:forensiscope';

test('named ForensiScope routes once to its canonical product-specific specialist',()=>{
 const found=matchFabricCapabilities(named,catalog,{limit:5});
 assert.ok(found.some(item=>item.public_id===canonical));
 assert.equal(found.filter(item=>item.public_id===canonical).length,1);
 assert.ok(!found.some(item=>item.public_id===duplicate),
  'do not offer archived discovery-only page as duplicate customer path');
});

test('generic oversized-video request retains canonical ForensiScope and drops redundant source-only listing',()=>{
 const found=matchFabricCapabilities(video,catalog,{limit:10});
 assert.ok(found.some(item=>item.public_id===canonical));
 assert.ok(!found.some(item=>item.public_id===duplicate));
 const specialist=found.find(item=>item.public_id===canonical);
 assert.ok(specialist.connections.some(c=>c.type==='website'&&
  c.url==='https://jgaethle10.github.io/forge-operator/forensiscope/'));
 assert.equal(specialist.entry_paid_offer,null);
 assert.equal(specialist.commercial_state,'verification_required');
});

test('a source-only product is still discoverable when a canonical specialist is absent',()=>{
 const product=catalog.find(item=>item.public_id===duplicate);
 assert.ok(product);
 const only=matchFabricCapabilities('ForensiScope',[product],{limit:5});
 assert.equal(only.length,1);
 assert.equal(only[0].public_id,duplicate);
});

test('MCP matchmaking uses canonical route without changing payment permissions or 3-tool surface',async()=>{
 const rpc=await executeFabricDirectoryRpc({
  jsonrpc:'2.0',id:67,method:'tools/call',
  params:{name:'match_evercraft_capability',arguments:{intent:video,limit:8}}
 },catalog);
 assert.equal(rpc.result?.isError,false);
 const result=rpc.result.structuredContent;
 assert.equal(result.ok,true);
 assert.equal(result.plugin_operation.state,'operational_for_this_request');
 assert.ok(result.matches.some(item=>item.public_id===canonical));
 assert.ok(!result.matches.some(item=>item.public_id===duplicate));
 assert.equal(result.transactional,false);
 assert.equal(result.external_action_taken,false);
});
