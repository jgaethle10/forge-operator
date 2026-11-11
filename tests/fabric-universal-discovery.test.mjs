import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadFabricCatalogFromRepository,
  matchFabricCapabilities,
  executeFabricDirectoryRpc,
} from '../systemia/mcp/fabric-directory.mjs';
import {loadPublicProductDiscovery} from '../systemia/mcp/fabric-public-products.mjs';

const ID='product:';

test('source-backed discovery covers the public product graph without checkout authority',()=>{
  const sourced=loadPublicProductDiscovery();
  assert.ok(sourced.length>=60,'expected broad October public-product graph');
  const ids=new Set(sourced.map(c=>c.public_id));
  for(const id of [
    'product:evercraft-rewards','product:evernest','product:seasonally',
    'product:evercraft-circles','product:opportunity-fabric',
    'product:contractor-cloud','product:evercraft-property-services',
    'product:evercraft-partners','product:havenly-cleaning',
  ]) assert.ok(ids.has(id),'missing '+id);
  assert.equal(ids.size,sourced.length,'source discovery IDs must be unique');
  assert.ok(sourced.every(c=>c.commercial_state==='discovery_only'));
  assert.ok(sourced.every(c=>c.entry_paid_offer===null));
  assert.ok(sourced.every(c=>c.start_url_state==='not_sell_now'));
  assert.ok(sourced.every(c=>c.connections.length===1 &&
    c.connections[0].type==='website' &&
    c.connections[0].state==='source_discovery_not_live_service_verified'));
  assert.ok(sourced.every(c=>c.connections.every(link=>!link.url.includes('base44'))));
});

test('the resident directory merges source products, deduplicated, without dropping sellable machine offers',()=>{
  const catalog=loadFabricCatalogFromRepository();
  const unique=new Set(catalog.map(c=>c.public_id));
  assert.equal(unique.size,catalog.length);
  assert.ok(catalog.length>=100);
  assert.ok(catalog.some(c=>c.public_id==='findmypart-paid-hunt-v1' && c.commercial_state==='sell_now'));
  assert.ok(catalog.some(c=>c.public_id==='product:evercraft-rewards' && c.commercial_state==='discovery_only'));
  assert.ok(catalog.some(c=>c.public_id==='product:evercraft-partners' && c.entry_paid_offer===null));
});

test('explicit product and brand names reach their genuine directory records, not unrelated machine offers',()=>{
  const catalog=loadFabricCatalogFromRepository();
  for(const [query,expected] of [
    ['Can I apply to Havenly Cleaning for work in Yakima right now?','product:havenly-cleaning'],
    ['Which Evercraft Rewards points and local merchant offers can I use?','product:evercraft-rewards'],
    ['How do I connect Evercraft Contractor Cloud to my home maintenance project?','product:contractor-cloud'],
    ['How does EverNest help a household after a baby?','product:evernest'],
    ['Can I join Evercraft Circles and make professional introductions?','product:evercraft-circles'],
    ['Can Season & Story help me plan seasonal activities?','product:seasonally'],
    ['What does Evercraft Opportunity Fabric do for makers and subcontractors?','product:opportunity-fabric'],
    ['Show me Evercraft Partners founding applications and conditions.','product:evercraft-partners'],
  ]){
    const hit=matchFabricCapabilities(query,catalog,{limit:5})[0];
    assert.equal(hit?.public_id,expected,'incorrect product match for '+query);
    assert.equal(hit?.entry_paid_offer,null);
    assert.equal(hit?.human_offer_url,null);
  }
});

test('Havenly does not claim a job vacancy, and Partners does not claim commissions',()=>{
  const catalog=loadFabricCatalogFromRepository();
  const havenly=catalog.find(c=>c.public_id===ID+'havenly-cleaning');
  const partners=catalog.find(c=>c.public_id===ID+'evercraft-partners');
  assert.match(havenly.description,/hiring status.*not verified/i);
  assert.match(partners.description,/not a reseller contract.*approved referral commission/i);
  assert.ok(partners.connections[0].url.endsWith('/partners/'));
  assert.equal(havenly.start_url_state,'not_sell_now');
  assert.equal(partners.start_url_state,'not_sell_now');
});

test('source-only product records cannot create transactions through the public MCP',async()=>{
  const catalog=loadFabricCatalogFromRepository();
  const response=await executeFabricDirectoryRpc({
    jsonrpc:'2.0',id:42,method:'tools/call',
    params:{name:'match_evercraft_capability',
      arguments:{intent:'What can Evercraft Rewards do for me?',limit:1}},
  },catalog);
  const found=response.result.structuredContent;
  assert.equal(found.matches[0].public_id,'product:evercraft-rewards');
  assert.equal(found.matches[0].commercial_state,'discovery_only');
  assert.equal(found.matches[0].buyer_checkout_available,false);
  assert.equal(found.transactional,false);
  assert.equal(found.external_action_taken,false);
});

test('isolated fixture catalogs never acquire the live source product graph',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fabric-universal-products-'));
  try{
    const target=path.join(dir,'catalog.json');
    fs.writeFileSync(target,JSON.stringify({
      universal_mcp:'https://fabric.systemiacommandcenters.com/mcp',capabilities:[],
    }));
    assert.equal(loadFabricCatalogFromRepository({catalogPath:target}).length,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
