#!/usr/bin/env node
// Standalone read-only remote MCP example. No Evercraft internal imports or credentials.
// This is an outsider-developer proof, not a production connector or commercial transaction.
import {pathToFileURL} from 'node:url';

export const OWNED_ORIGIN='https://fabric.systemiacommandcenters.com';
export const EXPECTED_TOOLS=[
  'list_evercraft_capabilities',
  'match_evercraft_capability',
  'get_evercraft_connection_options',
];
export const INTENT='Source an identified discontinued obsolete machine part';
export const EXPECTED_ID='findmypart-paid-hunt-v1';

export function validateOrigin(input,{allowLoopback=false}={}){
  const u=new URL(String(input));
  if(u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname)){
    throw Error('Origin must not contain credentials, path, query or fragment');
  }
  if(u.protocol==='https:'&&u.origin===OWNED_ORIGIN)return OWNED_ORIGIN;
  if(allowLoopback&&u.protocol==='http:'&&['127.0.0.1','[::1]'].includes(u.hostname)){
    return u.origin;
  }
  throw Error('Only canonical owned HTTPS Fabric or explicit test loopback origin permitted');
}
function unpack(raw){
  if(!raw||typeof raw!=='object'||raw.error)throw Error('MCP returned an error');
  const value=raw.result?.structuredContent??raw.result;
  if(value===undefined)throw Error('MCP result missing');
  if(raw.result?.content?.[0]?.text&&!raw.result?.structuredContent){
    try{return JSON.parse(raw.result.content[0].text);}catch{}
  }
  return value;
}
function parseRpc(body){
  try {return JSON.parse(body);}catch{}
  const chunks=body.split(/\r?\n\r?\n/);
  for(let i=chunks.length-1;i>=0;i--){
    const data=chunks[i].split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');
    if(!data)continue;
    try{return JSON.parse(data);}catch{}
  }
  throw Error('MCP response was neither JSON nor a valid SSE message');
}
export async function probeFabric({origin=OWNED_ORIGIN,allowLoopback=false,fetchImpl=fetch}={}){
  const base=validateOrigin(origin,{allowLoopback});
  let id=0;
  let session=null;
  const rpc=async(method,params={})=>{
    const requestId=++id;
    const headers={
      'content-type':'application/json',
      accept:'application/json, text/event-stream',
      'mcp-protocol-version':'2025-03-26',
    };
    if(session)headers['mcp-session-id']=session;
    const response=await fetchImpl(base+'/mcp',{
      method:'POST',
      headers,
      body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),
      redirect:'manual',
      signal:AbortSignal.timeout(10000),
    });
    if(response.status>=300&&response.status<400)throw Error('MCP redirect refused');
    if(!response.ok)throw Error('MCP HTTP status '+response.status);
    if(!session){
      const sid=response.headers.get('mcp-session-id');
      if(sid){
        if(!/^[\x21-\x7e]{1,128}$/.test(sid))throw Error('Invalid MCP session id');
        session=sid;
      }
    }
    const data=parseRpc(await response.text());
    if(data.id!==requestId||data.jsonrpc!=='2.0')throw Error('Unexpected MCP response identity');
    return unpack(data);
  };
  const initialized=await rpc('initialize',{
    protocolVersion:'2025-03-26',
    capabilities:{},
    clientInfo:{name:'evercraft-outsider-proof',version:'0.1.0'},
  });
  if(initialized?.serverInfo?.name!=='evercraft-fabric')throw Error('Owned Fabric MCP server identity mismatch');
  const tools=await rpc('tools/list');
  const names=Array.isArray(tools?.tools)?tools.tools.map(x=>x.name):[];
  if(!EXPECTED_TOOLS.every(name=>names.includes(name)))throw Error('Expected read-only Fabric discovery tools missing');
  const match=await rpc('tools/call',{
    name:'match_evercraft_capability',
    arguments:{intent:INTENT,limit:1},
  });
  const first=match?.matches?.[0];
  if(first?.public_id!==EXPECTED_ID)throw Error('Brand-blind matching result did not meet test expectation');
  const options=await rpc('tools/call',{
    name:'get_evercraft_connection_options',
    arguments:{public_id:EXPECTED_ID},
  });
  if(!options||typeof options!=='object')throw Error('Connection options missing');
  const url=options.human_offer_url??first.human_offer_url??null;
  if(url!==null){
    const parsed=new URL(url);
    if(parsed.protocol!=='https:'||parsed.hostname!=='fabric.systemiacommandcenters.com')throw Error('Unexpected external buyer URL');
  }
  return {
    schema:'evercraft.operator-outsider-public-discovery.v1',
    observed_at:new Date().toISOString(),
    origin:base,
    protocol:'2025-03-26',
    client:'standalone_node_dependency_free',
    state:'read_only_public_discovery_verified',
    server_name:initialized.serverInfo.name,
    available_read_only_tools:EXPECTED_TOOLS,
    matched_public_id:first.public_id,
    human_offer_url:url,
    human_offer_present:!!url,
    verified_payment:false,
    checkout_created:false,
    tool_execution_authorized:false,
    published_capability:false,
    external_operator_connected:false,
    explanation:'MCP remote discovery proof only. No human purchase, provider settlement, service fulfillment or actual third-party adoption tested.',
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2);
  if(args.length!==0){
    console.error('Usage: node public-discovery.mjs (canonical Fabric URL only; no custom targets)');
    process.exitCode=2;
  }else{
    probeFabric().then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
      .catch(e=>{console.error('Public Fabric proof failed: '+e.message);process.exitCode=1;});
  }
}
