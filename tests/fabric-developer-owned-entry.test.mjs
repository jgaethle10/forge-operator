import test from 'node:test';
import assert from 'node:assert/strict';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';
import {ownedDeveloperStatus,renderOwnedDeveloperPage} from '../systemia/mcp/fabric-developer-site.mjs';

const catalog=[{
 public_id:'findmypart-paid-hunt-v1',
 name:'FindMyPart',
 description:'Identify and source obscure replacement parts with evidence.',
 state:'held_pending_owned_execution',
 commercial_state:'hold',
 keywords:['part','replacement','obsolete'],
 use_when:['I need a replacement industrial part'],
 connections:[
   {type:'mcp',label:'legacy',url:'https://findmypart.base44.app/functions/findMyPartMcp'},
   {type:'mcp',label:'owned',url:'https://fabric.systemiacommandcenters.com/mcp'}
 ]
}];

test('developer status refuses to advertise broken specialist MCP and transaction fees',()=>{
 const s=ownedDeveloperStatus(catalog);
 assert.equal(s.schema,'evercraft.fabric.owned-developer-entry.v1');
 assert.equal(s.read_only,true);
 assert.equal(s.purchases_created,false);
 assert.equal(s.enabled_mcp.url,'https://fabric.systemiacommandcenters.com/mcp');
 assert.equal(s.enabled_mcp.tool_names.length,3);
 assert.equal(s.legacy_specialists.length,6);
 assert.ok(s.legacy_specialists.every(x=>x.mcp_url===null&&x.do_not_route_new_users));
 assert.equal(s.commerce.platform_percent_fee_state,'design_only_not_active');
 assert.equal(s.exact_runtime_release.deployment_receipt_bound,false);
 assert.equal(s.exact_runtime_release.fully_attested_by_this_endpoint,false);
 assert.equal(JSON.stringify(s).includes('findmypart.base44.app'),false);
});
test('developer page is mobile, XSS safe and never links dead specialist URLs',()=>{
 const html=renderOwnedDeveloperPage({capabilities:catalog,intent:'<svg onload=alert(1)>',matches:[]});
 assert.match(html,/width=device-width,initial-scale=1/);
 assert.match(html,/Build your thing/);
 assert.match(html,/Borrow what is proven/);
 assert.match(html,/No confident catalog match/);
 assert.match(html,/&lt;svg onload=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<svg onload/);
 assert.doesNotMatch(html,/findmypart\.base44\.app/);
 assert.doesNotMatch(html,/name="user_confirmed"/);
 assert.match(html,/method="get" action="\/developers"/);
 assert.match(html,/@media\(max-width:680px\)/);
 assert.equal((html.match(/class="module"/g)||[]).length,6);
});
test('real owned Fabric local runtime serves read-only HTML and JSON, MCP remains unchanged',async()=>{
 const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog,faieSurfaceEnabled:false});
 try{
   let response=await fetch(runtime.url+'/developers');
   assert.equal(response.status,200);
   assert.match(response.headers.get('content-type')||'',/text\/html/);
   const html=await response.text();
   assert.match(html,/Evercraft \| Developer Integrations/);
   assert.match(html,/Specialist integration status/);
   assert.match(html,/fabric\.systemiacommandcenters\.com\/mcp/);
   assert.doesNotMatch(html,/findmypart\.base44\.app/);

   response=await fetch(runtime.url+'/developers?intent=obsolete%20replacement%20part');
   assert.equal(response.status,200);
   const searched=await response.text();
   assert.match(searched,/Closest research matches/);
   assert.match(searched,/\/capabilities\/findmypart-paid-hunt-v1/);

   response=await fetch(runtime.url+'/developers.json');
   assert.equal(response.status,200);
   const info=await response.json();
   assert.equal(info.reported_capabilities,1);
   assert.equal(info.legacy_specialists.length,6);
   assert.equal(info.purchases_created,false);
   assert.equal(info.commerce.create_checkout_available_here,false);
   assert.equal(info.exact_runtime_release.deployment_receipt_bound,false);

   response=await fetch(runtime.url+'/mcp',{method:'POST',
      headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});
   assert.equal(response.status,200);
   const mcp=await response.json();
   assert.deepEqual(mcp.result.tools.map(x=>x.name),[
     'match_evercraft_capability','list_evercraft_capabilities','get_evercraft_connection_options'
   ]);
 }finally{await runtime.close()}
});
