// Loopback-only, test-reviewed MCP-over-HTTP bridge. This is NOT Fabric and must
// never listen on a public interface, advertise production capacity or accept money.
import http from 'node:http';
import crypto from 'node:crypto';
import {exerciseIndependentTool} from './independent-tool-client.mjs';
import {TEST_TOOL} from './review-gate.mjs';
const PROTOCOL='2025-03-26';
const reply=(res,status,obj)=>{const body=JSON.stringify(obj);
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(body);
};
export async function startLabBridge({gate,host='127.0.0.1'}={}){
  if(!gate||typeof gate.check!=='function'||typeof gate.evidence!=='function')throw Error('Review gate required');
  if(host!=='127.0.0.1')throw Error('Lab bridge must bind to literal 127.0.0.1');
  const server=http.createServer(async(req,res)=>{
    if(req.method==='GET'&&req.url==='/health'){
      return reply(res,200,{schema:'evercraft.operator-lab-bridge.v1',state:gate.state,
        ...gate.evidence(),loopback_only:true,
        public_directory_authority:false,provider_payment_authority:false});
    }
    if(req.url!=='/mcp'||req.method!=='POST')return reply(res,404,{error:'not_found'});
    const ct=String(req.headers['content-type']||'').toLowerCase().split(';')[0];
    if(ct!=='application/json')return reply(res,415,{error:'json_only'});
    let body='',bytes=0;
    try{
      for await(const part of req){
        bytes+=part.length;
        if(bytes>4096)return reply(res,413,{error:'request_too_large'});
        body+=part.toString('utf8');
      }
      const rpc=JSON.parse(body);
      if(!rpc||rpc.jsonrpc!=='2.0'||typeof rpc.method!=='string'
        ||!Number.isSafeInteger(rpc.id)||rpc.id<0)return reply(res,400,{error:'jsonrpc_invalid'});
      const done=result=>reply(res,200,{jsonrpc:'2.0',id:rpc.id,result});
      const error=(code,message)=>reply(res,200,{jsonrpc:'2.0',id:rpc.id,error:{code,message}});
      if(rpc.method==='initialize')return done({protocolVersion:PROTOCOL,
        serverInfo:{name:'independent-operator-reviewed-lab',version:'0.1.0'},
        capabilities:{tools:{}}});
      if(rpc.method==='tools/list'){
        try{gate.check();}catch{return done({tools:[]});}
        return done({tools:[{name:TEST_TOOL,description:'Test-reviewed disposable nonce hashing; no external effects',
          inputSchema:{type:'object',additionalProperties:false,required:['nonce'],
          properties:{nonce:{type:'string',minLength:8,maxLength:128,pattern:'^[a-zA-Z0-9_-]+$'}}}}]});
      }
      if(rpc.method==='tools/call'){
        try{gate.check();}catch{return error(-32003,'Review gate is held, expired or revoked');}
        if(rpc.params?.name!==TEST_TOOL)return error(-32601,'Tool not approved');
        const args=rpc.params?.arguments;
        if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).length!==1
          ||typeof args.nonce!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(args.nonce))
          return error(-32602,'Disposable test nonce required');
        const local=await exerciseIndependentTool({nonce:args.nonce});
        return done({content:[{type:'text',text:local.output_sha256}],isError:false});
      }
      return error(-32601,'Method unavailable in test lab');
    }catch{return reply(res,400,{error:'invalid_or_failed_request'});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,host,resolve);});
  const address=server.address();
  return {origin:'http://127.0.0.1:'+address.port,server,
    close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}

export async function exerciseReviewedRemoteTool({origin,nonce='remote_operator_test_1026',fetchImpl=fetch}={}){
  if(typeof origin!=='string'||!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(origin))
    throw Error('Independent client only accepts loopback lab bridge');
  if(!/^[A-Za-z0-9_-]{8,128}$/.test(nonce))throw Error('Disposable nonce required');
  let id=0;
  const rpc=async(method,params={})=>{
    const rid=++id;
    const r=await fetchImpl(origin+'/mcp',{method:'POST',
      headers:{accept:'application/json','content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:rid,method,params}),redirect:'manual',
      signal:AbortSignal.timeout(5000)});
    if(!r.ok)throw Error('Lab MCP HTTP '+r.status);
    const response=await r.json();
    if(response.jsonrpc!=='2.0'||response.id!==rid)throw Error('Lab MCP correlation mismatch');
    if(response.error)throw Error('Lab MCP failure '+response.error.code);
    return response.result;
  };
  const hello=await rpc('initialize',{protocolVersion:PROTOCOL,clientInfo:{name:'independent-reviewed-remote-client',version:'1'},capabilities:{}});
  if(hello?.serverInfo?.name!=='independent-operator-reviewed-lab')throw Error('Unexpected test lab identity');
  const tools=await rpc('tools/list');
  if(!Array.isArray(tools?.tools)||tools.tools.length!==1||tools.tools[0].name!==TEST_TOOL)
    throw Error('Review gate has not listed the test tool');
  const response=await rpc('tools/call',{name:TEST_TOOL,arguments:{nonce}});
  if(response?.isError||!Array.isArray(response?.content)||!response.content[0]?.text)throw Error('Test receipt missing');
  const expected=crypto.createHash('sha256').update('evercraft-operator-test-v1:'+nonce).digest('hex');
  if(response.content[0].text!==expected)throw Error('Independent remote test receipt does not verify');
  return {schema:'evercraft.operator-reviewed-remote-lab-proof.v1',state:'reviewed_loopback_remote_invocation_verified',
    tool:TEST_TOOL,returned_digest:response.content[0].text,
    real_http_transport:true,real_separate_stdio_process:true,
    public_fabric_modified:false,outside_publisher_adopted:false,
    production_permission_granted:false,external_action_taken:false,checkout_created:false,
    payment_verified:false};
}
