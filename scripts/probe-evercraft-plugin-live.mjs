#!/usr/bin/env node
/**
 * Evercraft's ChatGPT-facing MCP live read-only smoke test.
 * Sends ONLY the public MCP initialize/tool directory calls. It never
 * creates checkout, calls a product worker, loads customer data, or
 * invokes a provider/legacy-hosted endpoint.
 *
 * This proves the public endpoint answered these operations at the time
 * of observation, not that every customer or every downstream product
 * can purchase, upload or fulfill work.
 */
const MCP='https://fabric.systemiacommandcenters.com/mcp';
const EXPECTED=[
 'match_evercraft_capability',
 'list_evercraft_capabilities',
 'get_evercraft_connection_options'
];
async function call(id,name,args){
 const response=await fetch(MCP,{
  method:'POST',redirect:'error',
  headers:{
   'content-type':'application/json',
   'accept':'application/json',
   'user-agent':'Evercraft-Plugin-Public-ReadOnly-Canary/1.0'
  },
  body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',
   params:{name,arguments:args}}),
  signal:AbortSignal.timeout(16000)
 });
 if(response.status!==200)throw Error('plugin_http_'+response.status);
 const value=await response.json();
 if(value?.error||value?.result?.isError===true||
    value?.result?.structuredContent?.ok!==true)
  throw Error('plugin_tool_failure_'+name);
 const data=value.result.structuredContent;
 if(data.transactional!==false||data.external_action_taken!==false)
  throw Error('read_only_capability_contract_violated_'+name);
 return data;
}

async function main(){
 const listed=await call(101,'list_evercraft_capabilities',{limit:15});
 if(!Array.isArray(listed.capabilities)||listed.capabilities.length<1)
  throw Error('plugin_directory_empty');
 const matched=await call(102,'match_evercraft_capability',{
  intent:'my video is too large for AI; need a timestamped evidence review',
  limit:8
 });
 const expected='forensiscope-evidence-review-v1';
 if(!Array.isArray(matched.matches)||!matched.matches.some(x=>x.public_id===expected))
  throw Error('forensiscope_specialist_match_missing');
 const options=await call(103,'get_evercraft_connection_options',{
  public_id:expected
 });
 if(options.public_id!==expected||!Array.isArray(options.connections)||
   !options.connections.some(c=>c.type==='mcp'&&c.url===MCP)||
   !options.connections.some(c=>c.type==='website'&&
    c.url==='https://jgaethle10.github.io/forge-operator/forensiscope/'))
  throw Error('forensiscope_owned_connection_unavailable');
 if(options.buyer_checkout_available!==false||
    options.human_offer_url!==null)
  throw Error('unverified_checkout_leak');
 const pluginSuccess=(
  listed.plugin_operation?.state==='operational_for_this_request'&&
  matched.plugin_operation?.state==='operational_for_this_request'&&
  options.plugin_operation?.state==='operational_for_this_request'
 );
 const canonical=matched.matches.find(x=>x.public_id===expected);
 console.log(JSON.stringify({
  schema:'evercraft.plugin.live-discovery-canary.v1',
  observed_at:new Date().toISOString(),
  public_mcp:MCP,
  success:true,
  read_only_tools_tested:EXPECTED,
  capabilities_returned:listed.capabilities.length,
  forensiscope_canonical_found:true,
  forensiscope_rank:matched.matches.indexOf(canonical)+1,
  redundant_product_match_present:matched.matches.some(x=>x.public_id==='product:forensiscope'),
  explicit_operation_status_present:pluginSuccess,
  customer_payment_tested:false,
  provider_paid_receipt_tested:false,
  file_upload_tested:false,
  fulfillment_tested:false
 },null,2));
}
try{await main()}catch(e){
 console.error(JSON.stringify({
  schema:'evercraft.plugin.live-discovery-canary.v1',
  observed_at:new Date().toISOString(),
  success:false,error:String(e?.message||e).slice(0,220),
  payment_or_order_created:false
 },null,2));
 process.exitCode=1;
}
