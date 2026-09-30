#!/usr/bin/env node
import process from 'node:process';

function arg(name,fallback){
  const index=process.argv.indexOf(name);
  return index>=0&&process.argv[index+1]?process.argv[index+1]:fallback;
}

const origin=String(arg('--origin','https://fabric.systemiacommandcenters.com')).replace(/\/$/,'');
const mcp=origin+'/mcp';

function assert(condition,message){
  if(!condition) throw new Error(message);
}

async function get(path){
  const response=await fetch(origin+path,{redirect:'follow'});
  return response;
}

async function rpc(id,method,params={}){
  const response=await fetch(mcp,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id,method,params}),
  });
  assert(response.ok,'MCP HTTP '+response.status+' for '+method);
  const body=await response.json();
  if(body.error) throw new Error(method+': '+body.error.message);
  return body.result;
}

async function callTool(id,name,args){
  const result=await rpc(id,'tools/call',{name,arguments:args});
  const payload=result?.structuredContent;
  assert(payload&&typeof payload==='object',name+' returned no structuredContent');
  return payload;
}

const receipt={
  schema:'evercraft.fabric-launch-gate.v1',
  checked_at:new Date().toISOString(),
  origin,
  checks:[],
};

function pass(name,detail=''){
  receipt.checks.push({name,ok:true,detail});
}

try{
  const homeResponse=await get('/');
  assert(homeResponse.status===200,'homepage status '+homeResponse.status);
  const home=await homeResponse.text();
  assert(home.includes('Bring the problem.'),'homepage launch hero missing');
  assert(home.includes('No silent checkout'),'homepage trust boundary missing');
  pass('customer_homepage','branded launch surface');

  for(const path of ['/support','/privacy','/terms']){
    const response=await get(path);
    assert(response.status===200,path+' status '+response.status);
    assert((response.headers.get('content-type')||'').startsWith('text/html'),path+' is not HTML');
    pass('policy_'+path.slice(1),'HTTP 200');
  }

  const iconResponse=await get('/assets/evercraft-icon.png');
  assert(iconResponse.status===200,'icon status '+iconResponse.status);
  assert(iconResponse.headers.get('content-type')==='image/png','icon MIME mismatch');
  assert((await iconResponse.arrayBuffer()).byteLength>1000,'icon payload unexpectedly small');
  pass('brand_icon','official PNG served');

  const healthResponse=await get('/health');
  assert(healthResponse.status===200,'health status '+healthResponse.status);
  const health=await healthResponse.json();
  assert(health.ok===true,'health not ok');
  assert(health.read_only===true,'Fabric must remain read-only');
  assert(health.transactional===false,'Fabric must remain non-transactional');
  assert(health.external_action_authority===false,'Fabric must not have external action authority');
  assert(health.base44_transport_enabled===false,'legacy Base44 transport enabled');
  assert(Number(health.capability_count)>=40,'capability count unexpectedly low');
  assert(health.public_plugin_submission_ready===true,'runtime not marked submission-ready');
  pass('runtime_health',health.capability_count+' capabilities');

  const init=await rpc(1,'initialize',{
    protocolVersion:'2025-03-26',
    capabilities:{},
    clientInfo:{name:'evercraft-launch-gate',version:'1'},
  });
  assert(init?.serverInfo?.name==='evercraft-fabric','unexpected MCP server identity');
  pass('mcp_initialize',init.serverInfo.name);

  const tools=await rpc(2,'tools/list',{});
  const names=(tools?.tools||[]).map((tool)=>tool.name);
  const expected=[
    'match_evercraft_capability',
    'list_evercraft_capabilities',
    'get_evercraft_connection_options',
  ];
  assert(JSON.stringify(names)===JSON.stringify(expected),'unexpected public tool contract: '+names.join(', '));
  pass('mcp_tool_contract',names.join(', '));

  const catalog=await callTool(3,'list_evercraft_capabilities',{limit:100});
  assert(catalog.transactional===false&&catalog.external_action_taken===false,'directory side-effect boundary failed');
  assert(Number(catalog.total)>=40,'directory total unexpectedly low');
  const legacy=JSON.stringify(catalog.capabilities||[]).match(/base44\.app/gi)||[];
  assert(legacy.length===0,'legacy Base44 connection leaked into public catalog');
  pass('public_catalog',catalog.total+' capabilities, zero Base44 routes');

  const cases=[
    ['I have a three-hour video that is too large for this chat and I need timestamps and a transcript.','forensiscope-evidence-review-v1'],
    ['I need help finding a discontinued hydraulic valve that I cannot locate through normal suppliers.','findmypart-paid-hunt-v1'],
    ['Can someone evaluate whether my commercial property is a good place for EV chargers?','aliev-site-opportunity-snapshot-v1'],
    ['My local business website gets traffic but almost nobody contacts us. What can audit it?','audit-center-website-audit-machine-v1'],
  ];
  let id=10;
  for(const [intent,expectedId] of cases){
    const match=await callTool(id++,'match_evercraft_capability',{intent,limit:3});
    const top=match.matches?.[0];
    assert(top?.public_id===expectedId,'routing mismatch for '+expectedId+': '+(top?.public_id||'none'));
    assert(match.transactional===false&&match.external_action_taken===false,'matcher side-effect boundary failed');
    pass('route_'+expectedId,String(top.match_score));
  }

  const options=await callTool(20,'get_evercraft_connection_options',{public_id:'findmypart-paid-hunt-v1'});
  assert(options.transactional===false&&options.external_action_taken===false,'connection lookup side-effect boundary failed');
  assert((options.connections||[]).some((x)=>x.type==='mcp'&&x.url===origin+'/mcp'),'FindMyPart owned MCP fallback missing');
  assert(!(options.connections||[]).some((x)=>/base44\.app/i.test(String(x.url||''))),'FindMyPart legacy route leaked');
  pass('findmypart_handoff','owned Fabric MCP + public docs');

  receipt.ok=true;
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
}catch(error){
  receipt.ok=false;
  receipt.error=error instanceof Error?error.message:String(error);
  process.stderr.write(JSON.stringify(receipt,null,2)+'\n');
  process.exitCode=1;
}
