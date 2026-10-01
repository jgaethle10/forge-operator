import test from 'node:test';
import assert from 'node:assert/strict';
import {
  probeMcpRoute,
  runRuntimeCanary,
} from './runtime-canary.mjs';

function response(status,body){
  return {
    ok:status>=200&&status<300,
    status,
    headers:{get:()=> 'application/json'},
    text:async()=>JSON.stringify(body),
  };
}

function healthyFetch(url,options={}){
  const method=String(options.method||'GET').toUpperCase();
  if(method==='GET'){
    return Promise.resolve(response(200,{ok:true,service:'test'}));
  }
  const rpc=JSON.parse(options.body||'{}');
  if(rpc.method==='initialize'){
    return Promise.resolve(response(200,{jsonrpc:'2.0',id:rpc.id,result:{
      protocolVersion:'2025-03-26',
      capabilities:{tools:{}},
      serverInfo:{name:'test-mcp',version:'1.0.0'},
    }}));
  }
  if(rpc.method==='tools/list'){
    return Promise.resolve(response(200,{jsonrpc:'2.0',id:rpc.id,result:{
      tools:[{name:'get_test',inputSchema:{type:'object',properties:{}}}],
    }}));
  }
  if(rpc.method==='tools/call'){
    return Promise.resolve(response(200,{jsonrpc:'2.0',id:rpc.id,result:{
      content:[{type:'text',text:'{"ok":true}'}],
      structuredContent:{ok:true},
      isError:false,
    }}));
  }
  return Promise.resolve(response(400,{error:'unexpected'}));
}

test('runtime canary proves invoke and useful output separately',async()=>{
  const result=await probeMcpRoute({
    stable_id:'capability:test',
    slug:'test',
    path:'/mcp/test',
    required:true,
    expected_tool:'get_test',
    invocation:{name:'get_test',arguments:{}},
  },{fetchImpl:healthyFetch,baseOrigin:'https://example.test',timeoutMs:1000});

  assert.equal(result.route_state,'pass');
  assert.equal(result.stages.get,true);
  assert.equal(result.stages.initialize,true);
  assert.equal(result.stages.tools_list,true);
  assert.equal(result.stages.invoke,true);
  assert.equal(result.stages.useful_output,true);
  assert.equal(result.authority.mutation_authority,false);
  assert.ok(/^sha256:[a-f0-9]{64}$/.test(result.receipt_id));
});

test('runtime canary does not turn a listed tool into an invocation pass',async()=>{
  const fetchImpl=async(url,options={})=>{
    const method=String(options.method||'GET').toUpperCase();
    if(method==='GET') return response(200,{ok:true});
    const rpc=JSON.parse(options.body||'{}');
    if(rpc.method==='initialize') return response(200,{jsonrpc:'2.0',id:rpc.id,result:{serverInfo:{name:'x',version:'1'}}});
    if(rpc.method==='tools/list') return response(200,{jsonrpc:'2.0',id:rpc.id,result:{tools:[{name:'get_test'}]}});
    if(rpc.method==='tools/call') return response(503,{error:'downstream_failure'});
    return response(400,{});
  };
  const result=await probeMcpRoute({
    stable_id:'capability:test',
    slug:'test',
    path:'/mcp/test',
    required:true,
    expected_tool:'get_test',
    invocation:{name:'get_test',arguments:{}},
  },{fetchImpl,baseOrigin:'https://example.test',timeoutMs:1000});
  assert.equal(result.stages.tools_list,true);
  assert.equal(result.stages.invoke,false);
  assert.equal(result.stages.useful_output,false);
  assert.equal(result.route_state,'fail');
});

test('full canary reports required route failure without upgrading optional source routes',async()=>{
  const failingFetch=async()=>response(404,{error:'not_found'});
  const result=await runRuntimeCanary({
    fetchImpl:failingFetch,
    baseOrigin:'https://example.test',
    timeoutMs:1000,
  });
  assert.ok(result.summary.required_failures.includes('platform:evercraft-fabric'));
  assert.equal(result.summary.state,'required_route_failure');
  assert.equal(result.routes.find((x)=>x.stable_id==='product:daytrade-lens').required,false);
  assert.equal(result.routes.find((x)=>x.stable_id==='media:fallen').required,false);
});
