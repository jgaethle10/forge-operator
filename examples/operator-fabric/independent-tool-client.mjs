#!/usr/bin/env node
// A true external-client-style MCP exchange with a local, least-authority
// synthetic provider. No Evercraft runtime imports, network access or billing.
import {spawn} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import crypto from 'node:crypto';

export async function exerciseIndependentTool({serverPath=resolve(dirname(fileURLToPath(import.meta.url)),'local-test-tool.mjs'),nonce='test_operator_20261017'}={}){
  if(!/^[a-zA-Z0-9_-]{8,128}$/.test(nonce))throw Error('Only disposable non-sensitive nonces permitted');
  const child=spawn(process.execPath,[serverPath],{stdio:['pipe','pipe','pipe'],shell:false,windowsHide:true,env:{PATH:process.env.PATH||''}});
  const requests=new Map();
  let buffer='',bytes=0,id=0,closed=false,stderrBytes=0;
  const failAll=e=>{for(const entry of requests.values())entry.reject(e);requests.clear();};
  child.on('error',failAll);
  child.on('exit',code=>{if(!closed)failAll(Error('test MCP tool stopped, exit '+code));});
  child.stderr.on('data',c=>{stderrBytes+=c.length;if(stderrBytes>4096)child.kill();});
  child.stdout.on('data',c=>{
    bytes+=c.length;
    if(bytes>65536){failAll(Error('Test tool exceeded bounded output'));child.kill();return;}
    buffer+=c.toString('utf8');
    let pos;
    while((pos=buffer.indexOf('\n'))>=0){
      const line=buffer.slice(0,pos).trim();buffer=buffer.slice(pos+1);
      let msg;try{msg=JSON.parse(line);}catch{failAll(Error('Invalid response'));child.kill();return;}
      const entry=requests.get(msg?.id);
      if(!entry)continue;
      requests.delete(msg.id);
      if(msg.error)entry.reject(Error('MCP returned error code '+msg.error.code));
      else entry.resolve(msg.result);
    }
  });
  const timeout=setTimeout(()=>{failAll(Error('MCP local fixture timeout'));child.kill();},5000);
  async function call(method,params={}){
    const n=++id;
    const answer=new Promise((resolve,reject)=>requests.set(n,{resolve,reject}));
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params})+'\n');
    return answer;
  }
  try{
    const init=await call('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'independent-operator-test-client',version:'0.1.0'}});
    if(init?.serverInfo?.name!=='evercraft-operator-test-tool')throw Error('Wrong test server identity');
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized',params:{}})+'\n');
    const list=await call('tools/list',{});
    if(!Array.isArray(list?.tools)||list.tools.length!==1||list.tools[0].name!=='operator_probe_nonce')throw Error('Tool discovery mismatch');
    const result=await call('tools/call',{name:'operator_probe_nonce',arguments:{nonce}});
    const expected=crypto.createHash('sha256').update('evercraft-operator-test-v1:'+nonce).digest('hex');
    if(result?.content?.[0]?.text!==expected||result?.isError!==false)throw Error('Independent tool execution verification failed');
    return {schema:'evercraft.operator-third-party-local-proof.v1',state:'local_mcp_tool_invoked_and_verified',
      protocol:'2025-11-25',server:'evercraft-operator-test-tool',tool:'operator_probe_nonce',
      output_sha256:expected,local_subprocess:true,read_only:true,network_used:false,
      public_fabric_catalog_modified:false,external_partner_connected:false, payment_verified:false};
  }finally{closed=true;clearTimeout(timeout);child.kill();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  exerciseIndependentTool().then(r=>process.stdout.write(JSON.stringify(r,null,2)+'\n'))
    .catch(e=>{process.stderr.write('Independent MCP test failed: '+e.message+'\n');process.exitCode=1;});
}
