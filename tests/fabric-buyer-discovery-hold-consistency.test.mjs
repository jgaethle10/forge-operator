import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadFabricCatalogFromRepository,normalizeFabricCatalog,
  executeFabricDirectoryRpc,
} from '../systemia/mcp/fabric-directory.mjs';

const catalog=loadFabricCatalogFromRepository();
const call=async(name,args)=> {
  const response=await executeFabricDirectoryRpc({
    jsonrpc:'2.0',id:42,method:'tools/call',
    params:{name,arguments:args},
  },catalog);
  assert.equal(response.result?.isError,false);
  return response.result.structuredContent;
};

test('advertised offer pages are separated from payment-verified buyer URLs for all six owned routes',()=>{
  const rows=catalog.filter(x=>x.advertised_offer_page_url);
  assert.equal(rows.length,6);
  for(const row of rows){
    assert.match(row.advertised_offer_page_url,/^https:\/\/fabric\.systemiacommandcenters\.com\/offers\/[a-z0-9-]+$/);
    assert.equal(row.advertised_offer_page_state,'catalog_route_only_not_live_checkout_proof');
    assert.equal(row.human_offer_url,null);
    assert.equal(row.buyer_checkout_available,false);
    assert.equal(row.start_url_state,'checkout_held_provider_http_402');
    assert.equal(row.human_buyer_options_state,'held_provider_http_402_requires_new_payment_receipt');
  }
});

test('list, match and connection-options RPCs never disagree that provider-held checkout is unavailable',async()=>{
  const listed=await call('list_evercraft_capabilities',{limit:100});
  assert.equal(listed.total,catalog.length);
  const owned=listed.capabilities.filter(x=>x.advertised_offer_page_url);
  assert.equal(owned.length,6);
  for(const row of owned){
    assert.equal(row.buyer_checkout_available,false);
    assert.equal(row.human_offer_url,null);
    assert.equal(row.start_url_state,'checkout_held_provider_http_402');
    const detail=await call('get_evercraft_connection_options',{public_id:row.public_id});
    assert.equal(detail.buyer_checkout_available,false);
    assert.equal(detail.human_offer_url,null);
    assert.deepEqual(detail.owned_human_buyer_options,[]);
    assert.deepEqual(detail.human_buyer_options,[]);
    assert.equal(detail.human_buyer_options_state,row.human_buyer_options_state);
    assert.equal(detail.transactional,false);
    assert.equal(detail.external_action_taken,false);
  }
  const matches=await call('match_evercraft_capability',{intent:'I want a website conversion audit for my small business',limit:10});
  assert.ok(matches.match_count>0);
  assert.ok(matches.matches.every(row=>row.human_offer_url===null && row.buyer_checkout_available===false));
  assert.equal(matches.transactional,false);
  assert.equal(matches.external_action_taken,false);
});

test('a catalog hold or price mismatch cannot inject a buyer link',()=>{
  const audit=catalog.find(x=>x.public_id==='audit-center-website-audit-machine-v1');
  const blocked=normalizeFabricCatalog([{...audit,commercial_state:'hold'}]);
  assert.equal(blocked[0].advertised_offer_page_url,null);
  assert.equal(blocked[0].human_offer_url,null);
  assert.equal(blocked[0].buyer_checkout_available,false);
  const mismatch=normalizeFabricCatalog([{...audit,entry_paid_offer:{...audit.entry_paid_offer,price_usd_normalized:50}}]);
  assert.equal(mismatch[0].advertised_offer_page_url,null);
  assert.equal(mismatch[0].buyer_checkout_available,false);
});
