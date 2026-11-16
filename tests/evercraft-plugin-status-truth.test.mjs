import test from 'node:test';
import assert from 'node:assert/strict';
import {
 executeFabricDirectoryRpc,
 loadFabricCatalogFromRepository,
 fabricDirectoryTools
} from '../systemia/mcp/fabric-directory.mjs';

const catalog=loadFabricCatalogFromRepository();
const run=(name,args)=>executeFabricDirectoryRpc({
 jsonrpc:'2.0',id:101,method:'tools/call',
 params:{name,arguments:args}
},catalog);

test('all 3 Evercraft plugin tools return successfully and independently of payment hold',async()=>{
 assert.equal(fabricDirectoryTools().length,3);
 for(const [name,args] of [
  ['list_evercraft_capabilities',{limit:12}],
  ['match_evercraft_capability',{
   intent:'this video is too large for AI; create a timestamped evidence review',
   limit:3
  }],
  ['get_evercraft_connection_options',{public_id:'forensiscope-evidence-review-v1'}]
 ]){
  const response=await run(name,args);
  assert.equal(response.result?.isError,false);
  const result=response.result.structuredContent;
  assert.equal(result.ok,true);
  assert.equal(result.plugin_operation.method,name);
  assert.equal(result.plugin_operation.state,'operational_for_this_request');
  assert.equal(result.plugin_operation.scope,'read_only_capability_discovery');
  assert.equal(result.plugin_operation.payment_or_order_created,false);
  assert.equal(result.transactional,false);
  assert.equal(result.external_action_taken,false);
 }
});

test('ForensiScope successful plugin discovery is not represented as failed or paid checkout',async()=>{
 const match=(await run('match_evercraft_capability',{
  intent:'analyze hours of video evidence that is too large for AI',limit:10
 })).result.structuredContent;
 assert.ok(match.matches.some(x=>x.public_id==='forensiscope-evidence-review-v1'));
 const conn=(await run('get_evercraft_connection_options',{
  public_id:'forensiscope-evidence-review-v1'
 })).result.structuredContent;
 assert.equal(conn.plugin_operation.state,'operational_for_this_request');
 assert.ok(conn.connections.some(x=>x.type==='mcp'&&
  x.url==='https://fabric.systemiacommandcenters.com/mcp'));
 assert.equal(conn.checkout_evidence.state,'checkout_unverified_and_not_offered');
 assert.equal(conn.checkout_evidence.checkout_enabled,false);
 assert.equal(conn.checkout_evidence.plugin_usable_independently,true);
 assert.equal(conn.checkout_evidence.last_observed_provider_failure.http_status,402);
 assert.equal(conn.checkout_evidence.last_observed_provider_failure.observed_date,'2026-10-17');
 assert.equal(conn.checkout_evidence.current_provider_http_status,'not_checked_by_this_plugin_call');
 assert.equal(conn.checkout_evidence.current_paid_receipt,'not_verified');
 assert.equal(conn.buyer_checkout_available,false);
 assert.deepEqual(conn.human_buyer_options,[]);
 assert.equal(conn.human_offer_url,null);
 assert.equal(conn.transactional,false);
});

test('invalid plugin lookup cannot claim a successful execution',async()=>{
 const response=await run('get_evercraft_connection_options',{
  public_id:'no-such-evercraft-product'
 });
 assert.equal(response.error.code,-32602);
 assert.equal(response.result,undefined);
});
