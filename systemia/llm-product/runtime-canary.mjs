import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MODULE_DIR=path.dirname(fileURLToPath(import.meta.url));
const ROOT=process.env.EVERCRAFT_ROOT?path.resolve(process.env.EVERCRAFT_ROOT):path.resolve(MODULE_DIR,'../..');
const DEFAULT_ORIGIN='https://fabric.systemiacommandcenters.com';

function readJson(rel,fallback){
  try{return JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));}
  catch{return fallback;}
}
function sha(value){
  return 'sha256:'+crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function cleanOrigin(value){
  const raw=String(value||DEFAULT_ORIGIN).trim().replace(/\/+$/,'');
  const url=new URL(raw);
  if(url.protocol!=='https:') throw new Error('public_mcp_origin_must_be_https');
  if(url.username||url.password) throw new Error('public_mcp_origin_must_not_embed_credentials');
  return url.toString().replace(/\/+$/,'');
}
function directRequired(slug){
  const direct=readJson('public/.well-known/evercraft-direct-door-readiness.json',{products:[]});
  const row=(direct.products||[]).find((x)=>x.slug===slug);
  return Boolean(row?.registry_published===true&&row?.direct_callable===true);
}
function rpc(id,method,params={}){
  return {jsonrpc:'2.0',id,method,params};
}
async function fetchJson(fetchImpl,url,options,timeoutMs){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{...options,signal:controller.signal});
    const text=await response.text();
    let body=null;
    try{ body=text?JSON.parse(text):null; }catch{}
    return {
      ok:response.ok,
      status:response.status,
      content_type:response.headers?.get?.('content-type')||null,
      body,
      text:body?null:text.slice(0,1000),
    };
  }catch(error){
    return {
      ok:false,
      status:null,
      error:error instanceof Error?error.message:String(error),
      body:null,
      text:null,
    };
  }finally{
    clearTimeout(timer);
  }
}
function structuredUseful(call){
  const result=call?.body?.result;
  if(!result) return false;
  if(result.structuredContent&&typeof result.structuredContent==='object') return true;
  if(Array.isArray(result.content)&&result.content.some((x)=>x?.type==='text'&&String(x.text||'').trim())) return true;
  return false;
}
function toolNames(list){
  const tools=list?.body?.result?.tools;
  return Array.isArray(tools)?tools.map((x)=>String(x?.name||'')).filter(Boolean):[];
}

export const RUNTIME_CANARY_ROUTES=Object.freeze([
  {
    stable_id:'platform:evercraft-fabric',
    slug:'evercraft-fabric',
    path:'/mcp',
    required:true,
    expected_tool:'match_evercraft_capability',
    invocation:{
      name:'match_evercraft_capability',
      arguments:{intent:'I need to stress-test a paper-trading strategy before risking real money, with no autonomous trading.'},
    },
  },
  {
    stable_id:'product:daytrade-lens',
    slug:'daytrade-lens',
    path:'/mcp/daytrade-lens',
    required:null,
    expected_tool:'get_daytrade_lens_capabilities',
    invocation:{name:'get_daytrade_lens_capabilities',arguments:{}},
  },
  {
    stable_id:'media:fallen',
    slug:'fallen',
    path:'/mcp/fallen',
    required:null,
    expected_tool:'get_fallen_capabilities',
    invocation:{name:'get_fallen_capabilities',arguments:{}},
  },
]);

export async function probeMcpRoute(spec,{
  fetchImpl=fetch,
  baseOrigin=DEFAULT_ORIGIN,
  timeoutMs=12000,
}={}){
  const origin=cleanOrigin(baseOrigin);
  const url=origin+spec.path;
  const required=spec.required===null?directRequired(spec.slug):spec.required;
  const observedAt=new Date().toISOString();

  const get=await fetchJson(fetchImpl,url,{
    method:'GET',
    headers:{accept:'application/json','user-agent':'Evercraft-Systemia-LLM-Product-Canary/1.0'},
  },timeoutMs);

  const initialize=await fetchJson(fetchImpl,url,{
    method:'POST',
    headers:{'content-type':'application/json',accept:'application/json','user-agent':'Evercraft-Systemia-LLM-Product-Canary/1.0'},
    body:JSON.stringify(rpc(1,'initialize',{
      protocolVersion:'2025-03-26',
      capabilities:{},
      clientInfo:{name:'evercraft-llm-product-canary',version:'1.0.0'},
    })),
  },timeoutMs);

  const list=await fetchJson(fetchImpl,url,{
    method:'POST',
    headers:{'content-type':'application/json',accept:'application/json','user-agent':'Evercraft-Systemia-LLM-Product-Canary/1.0'},
    body:JSON.stringify(rpc(2,'tools/list',{})),
  },timeoutMs);

  const names=toolNames(list);
  let call={ok:false,status:null,body:null,error:'expected_tool_not_listed'};
  if(names.includes(spec.expected_tool)){
    call=await fetchJson(fetchImpl,url,{
      method:'POST',
      headers:{'content-type':'application/json',accept:'application/json','user-agent':'Evercraft-Systemia-LLM-Product-Canary/1.0'},
      body:JSON.stringify(rpc(3,'tools/call',spec.invocation)),
    },timeoutMs);
  }

  const initializePass=initialize.ok&&Boolean(initialize.body?.result?.serverInfo?.name);
  const listPass=list.ok&&names.includes(spec.expected_tool);
  const invokePass=call.ok&&!call.body?.error&&Boolean(call.body?.result);
  const usefulOutput=invokePass&&structuredUseful(call);
  const routePass=get.ok&&initializePass&&listPass&&invokePass&&usefulOutput;

  const receiptCore={
    stable_id:spec.stable_id,
    slug:spec.slug,
    route:url,
    required,
    observed_at:observedAt,
    stages:{
      get:get.ok,
      initialize:initializePass,
      tools_list:listPass,
      invoke:invokePass,
      useful_output:usefulOutput,
    },
    expected_tool:spec.expected_tool,
    tool_names:names,
    http:{
      get_status:get.status,
      initialize_status:initialize.status,
      tools_list_status:list.status,
      invoke_status:call.status,
    },
    errors:[
      get.error?('get:'+get.error):null,
      initialize.error?('initialize:'+initialize.error):null,
      list.error?('tools_list:'+list.error):null,
      call.error?('invoke:'+call.error):null,
      initialize.body?.error?('initialize_rpc:'+JSON.stringify(initialize.body.error)):null,
      list.body?.error?('tools_list_rpc:'+JSON.stringify(list.body.error)):null,
      call.body?.error?('invoke_rpc:'+JSON.stringify(call.body.error)):null,
    ].filter(Boolean),
    route_state:routePass?'pass':'fail',
    authority:{
      credential_supplied:false,
      checkout_authority:false,
      payment_authority:false,
      mutation_authority:false,
    },
  };
  return {...receiptCore,receipt_id:sha(receiptCore)};
}

export async function runRuntimeCanary({
  fetchImpl=fetch,
  baseOrigin=process.env.EVERCRAFT_PUBLIC_MCP_ORIGIN||DEFAULT_ORIGIN,
  timeoutMs=Number(process.env.EVERCRAFT_LLM_CANARY_TIMEOUT_MS||12000),
}={}){
  const routes=[];
  for(const spec of RUNTIME_CANARY_ROUTES){
    routes.push(await probeMcpRoute(spec,{fetchImpl,baseOrigin,timeoutMs}));
  }
  const requiredFailures=routes.filter((x)=>x.required&&x.route_state!=='pass');
  const body={
    schema:'evercraft.llm-product.runtime-canary.v1',
    generated_at:new Date().toISOString(),
    base_origin:cleanOrigin(baseOrigin),
    stages:['get','initialize','tools_list','invoke','useful_output'],
    truth_boundary:'A passing canary proves only the observed read-only route at the recorded time. It does not prove provider discovery, commercial conversion, future uptime, private-data authority, payment authority, or production mutation authority.',
    routes,
    summary:{
      route_count:routes.length,
      pass:routes.filter((x)=>x.route_state==='pass').length,
      fail:routes.filter((x)=>x.route_state==='fail').length,
      required_failures:requiredFailures.map((x)=>x.stable_id),
      state:requiredFailures.length?'required_route_failure':'no_required_route_failure',
    },
  };
  return {...body,receipt_id:sha({routes:body.routes,summary:body.summary})};
}

export function emitRuntimeCanary(canary){
  const dir=path.join(ROOT,'artifacts','llm-product');
  fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,'runtime-canary.json');
  fs.writeFileSync(file,JSON.stringify(canary,null,2)+'\n');
  return file;
}

const isCli=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isCli){
  const result=await runRuntimeCanary();
  if(process.argv.includes('--emit')) emitRuntimeCanary(result);
  process.stdout.write(JSON.stringify({summary:result.summary,receipt_id:result.receipt_id},null,2)+'\n');
  if(process.argv.includes('--strict')&&result.summary.required_failures.length) process.exitCode=1;
}
