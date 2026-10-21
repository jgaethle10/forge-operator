#!/usr/bin/env node
// Purpose-built outside-developer MCP tool. Never imports Evercraft, touches network,
// reads customer data, accepts credentials, or executes commands from tool arguments.
import readline from 'node:readline';
import crypto from 'node:crypto';
const PROTOCOL='2025-11-25';
const TOOL='operator_probe_nonce';
const reader=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
const respond=(id,result,error)=>{
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,...(error?{error}: {result})})+'\n');
};
for await(const line of reader){
  if(Buffer.byteLength(line,'utf8')>4096)continue;
  let r; try{r=JSON.parse(line);}catch{continue;}
  if(r?.jsonrpc!=='2.0'||!Object.hasOwn(r,'id')){
    if(r?.method==='notifications/initialized')continue;
    continue;
  }
  const {method,id}=r;
  if(method==='initialize'){
    respond(id,{protocolVersion:PROTOCOL,capabilities:{tools:{}},serverInfo:{name:'evercraft-operator-test-tool',version:'0.1.0'}});
  }else if(method==='tools/list'){
    respond(id,{tools:[{name:TOOL,description:'Return a deterministic hash of a disposable test nonce. No network, file, command, money or account access.',inputSchema:{type:'object',additionalProperties:false,properties:{nonce:{type:'string',minLength:8,maxLength:128,pattern:'^[a-zA-Z0-9_-]+$'}},required:['nonce']}}]});
  }else if(method==='tools/call'&&r.params?.name===TOOL){
    const args=r.params?.arguments;
    if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).length!==1
      ||typeof args.nonce!=='string'||!/^[a-zA-Z0-9_-]{8,128}$/.test(args.nonce)){
      respond(id,null,{code:-32602,message:'Invalid disposable nonce'});continue;
    }
    const receipt=crypto.createHash('sha256').update('evercraft-operator-test-v1:'+args.nonce).digest('hex');
    respond(id,{content:[{type:'text',text:receipt}],isError:false});
  }else{
    respond(id,null,{code:-32601,message:'Unsupported read-only test method'});
  }
}
