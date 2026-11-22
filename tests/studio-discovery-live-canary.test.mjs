import test from 'node:test';
import assert from 'node:assert/strict';
import {observeStudioDiscovery} from '../scripts/studio-discovery-live-canary.mjs';
const ID='fallen-studios-founding-commercial-v1';
const URL='https://jgaethle10.github.io/forge-operator/commercial-studio/';
const json=x=>new Response(JSON.stringify(x),{status:200,headers:{'content-type':'application/json'}});
const envelope=x=>json({jsonrpc:'2.0',id:1,result:{structuredContent:x}});
function stub({missing=false,top=true,wrongUrl=false,checkout=false,offline=false}={}){
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    calls.push({url,method:options.method||'GET',body:options.body||null});
    if(url.endsWith('/health'))return json({source_release_ref:'a'.repeat(40),capability_count:128});
    if(offline)return new Response('unavailable',{status:503});
    const req=JSON.parse(options.body);
    assert.equal(req.method,'tools/call');
    if(req.params.name==='match_evercraft_capability'){
      return envelope({ok:true,transactional:false,external_action_taken:false,
        matches:top?[{public_id:ID},{public_id:'evercraft-clip-social-video-v1'}]:
        [{public_id:'evercraft-clip-social-video-v1'},{public_id:ID}]});
    }
    assert.equal(req.params.name,'get_evercraft_connection_options');
    if(missing)return json({jsonrpc:'2.0',id:2,error:{code:-32602,message:'unknown public_id'}});
    return envelope({ok:true,transactional:false,external_action_taken:false,
      public_id:ID,state:'human_project_brief_only',
      buyer_checkout_available:checkout,human_offer_url:null,
      connections:[{type:'website',url:wrongUrl?'https://example.com/':URL}]});
  };
  return {fetchImpl,calls};
}
test('passing live read-only buyer match does not authorize payment or customer contact',async()=>{
  const s=stub(),r=await observeStudioDiscovery({fetchImpl:s.fetchImpl});
  assert.equal(r.state,'LIVE_DISCOVERY_VERIFIED');
  assert.equal(r.matches_as_first,true);
  assert.equal(r.exact_first_party_inquiry,true);
  assert.equal(r.checkout_available,false);
  assert.equal(r.paid_order_verified,false);
  assert.equal(r.customer_contacted,false);
  assert.equal(s.calls.length,3);
  assert.equal(s.calls.filter(x=>x.method==='POST').length,2);
  assert.ok(s.calls.filter(x=>x.method==='POST').every(x=>JSON.parse(x.body).method==='tools/call'));
});
test('missing capability fails closed even if customer requests a commercial',async()=>{
  const r=await observeStudioDiscovery({fetchImpl:stub({missing:true,top:false}).fetchImpl});
  assert.equal(r.state,'NOT_YET_VERIFIED');
  assert.equal(r.stage,'CAPABILITY_MISSING_OR_DETAIL_UNAVAILABLE');
});
test('Fallen ranked below Clip is not counted as successful customer discovery',async()=>{
  const r=await observeStudioDiscovery({fetchImpl:stub({top:false}).fetchImpl});
  assert.equal(r.state,'NOT_YET_VERIFIED');
  assert.equal(r.stage,'BUYER_MATCH_RANKING_MISMATCH');
});
test('wrong buyer link or implicit checkout authority is rejected',async()=>{
  for(const options of [{wrongUrl:true},{checkout:true}]){
    const r=await observeStudioDiscovery({fetchImpl:stub(options).fetchImpl});
    assert.equal(r.stage,'CATALOG_CONNECTION_MISMATCH');
  }
});
test('unavailable live MCP never passes on synthetic information',async()=>{
  const r=await observeStudioDiscovery({fetchImpl:stub({offline:true}).fetchImpl});
  assert.equal(r.stage,'MCP_MATCH_UNAVAILABLE');
  assert.equal(r.state,'NOT_YET_VERIFIED');
});
