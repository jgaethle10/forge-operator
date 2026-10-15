import test from 'node:test';
import assert from 'node:assert/strict';
import {runFabricReadOnlyCanary} from './fabric-mcp-public-canary.mjs';
const tools=[
  'match_evercraft_capability',
  'list_evercraft_capabilities',
  'get_evercraft_connection_options',
].map(name=>({name,annotations:{readOnlyHint:true}}));
function fakeFetch({bound=true,flipped=false,healthy=true,status=200}={}){
 return async (url,init)=>{
   let body;
   const method=init.method?'POST':'GET';
   if(method==='GET')body={ok:healthy,server:'evercraft-fabric',read_only:true,
     deployment_receipt_bound:bound,deployment_receipt_ref:bound?'YARD-VERIFIED-001':null};
   else{
     const req=JSON.parse(init.body);
     if(req.method==='initialize')body={jsonrpc:'2.0',id:1,result:{
        protocolVersion:'2025-03-26',serverInfo:{name:'evercraft-fabric'}}};
     else if(req.method==='tools/list')body={jsonrpc:'2.0',id:2,result:{tools:flipped?
       tools.map(t=>({...t,annotations:{readOnlyHint:false}})):tools}};
     else if(req.method==='tools/call')body={jsonrpc:'2.0',id:3,result:{
       content:[{type:'text',text:JSON.stringify({ok:true,matches:[{
        public_id:'forensiscope-evidence-review-v1',state:'discovery_only',
        commercial_state:'verification_required'}]})}]}};
     else throw new Error('unexpected action '+req.method);
   }
   const raw=method==='GET'?JSON.stringify(body):'event: message\ndata: '+JSON.stringify(body)+'\n\n';
   return {ok:status===200,status,headers:{get:k=>k==='content-type'?
    (method==='GET'?'application/json':'text/event-stream'):null},text:async()=>raw};
 };
}
test('fully verified read-only MCP may be transport-ready with authentic Yard reference',async()=>{
 const r=await runFabricReadOnlyCanary({fetcher:fakeFetch()});
 assert.equal(r.production_ready,true);
 assert.equal(r.external_actions_performed,false);
 assert.equal(r.reasons.length,0);
});
test('healthy protocol without Yard receipt remains blocked, no green promotion',async()=>{
 const r=await runFabricReadOnlyCanary({fetcher:fakeFetch({bound:false})});
 assert.equal(r.transport_verified,true);
 assert.equal(r.tool_registry_verified,true);
 assert.equal(r.read_only_response_verified,true);
 assert.equal(r.yard_deployment_receipt_bound,false);
 assert.equal(r.production_ready,false);
 assert.ok(r.reasons.includes('yard_deployment_receipt_unbound'));
});
test('mutating or misclassified tools deny protocol readiness',async()=>{
 const r=await runFabricReadOnlyCanary({fetcher:fakeFetch({flipped:true})});
 assert.equal(r.tool_registry_verified,false);
 assert.equal(r.production_ready,false);
 assert.ok(r.reasons.includes('read_only_tool_registry_not_verified'));
});
test('unhealthy or unreachable origin fails closed without claiming transactions',async()=>{
 const r=await runFabricReadOnlyCanary({fetcher:fakeFetch({healthy:false})});
 assert.equal(r.production_ready,false);
 assert.equal(r.external_actions_performed,false);
 assert.ok(r.reasons.includes('health_claim_invalid'));
 const down=await runFabricReadOnlyCanary({fetcher:async()=>{throw Error('network_unreachable')}});
 assert.equal(down.production_ready,false);
 assert.ok(down.reasons.includes('network_unreachable'));
});
