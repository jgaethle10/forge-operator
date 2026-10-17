import readline from 'node:readline';
// Strict synthetic MCP 2026-only server. No legacy initialize support.
const io=readline.createInterface({input:process.stdin});
for await(const line of io){
  let msg;
  try{msg=JSON.parse(line);}catch{continue;}
  const meta=msg?.params?._meta;
  const correct=meta?.['io.modelcontextprotocol/protocolVersion']==='2026-07-28'
    && typeof meta?.['io.modelcontextprotocol/clientCapabilities']==='object';
  const respond=(data)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,...data})+'\n');
  if(!correct){respond({error:{code:-32602,message:'Modern MCP per-request metadata required'}});continue;}
  if(msg.method==='server/discover'){
    respond({result:{resultType:'complete',supportedVersions:['2026-07-28'],capabilities:{tools:{}},
      _meta:{'io.modelcontextprotocol/serverInfo':{name:'Modern math fixture',version:'2026-test'}}}});
  }else if(msg.method==='tools/list'){
    respond({result:{resultType:'complete',tools:[{name:'sum',description:'Adds two numbers',inputSchema:{type:'object',properties:{a:{type:'number'},b:{type:'number'}},required:['a','b']}}]}});
  }else if(msg.method==='tools/call'&&msg.params?.name==='sum'){
    const {a,b}=msg.params.arguments||{};
    if(!Number.isFinite(a)||!Number.isFinite(b)){respond({error:{code:-32602,message:'Invalid numbers'}});continue;}
    respond({result:{resultType:'complete',content:[{type:'text',text:String(a+b)}]}});
  }else{respond({error:{code:-32601,message:'Method not found'}});}
}
