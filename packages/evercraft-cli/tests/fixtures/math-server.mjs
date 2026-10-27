import readline from 'node:readline';
const reader=readline.createInterface({input:process.stdin});
for await(const line of reader){
  let request;
  try{request=JSON.parse(line);}catch{continue;}
  if(request.method==='notifications/initialized')continue;
  let result;
  if(request.method==='initialize')result={protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'Local math fixture',version:'0.1'}};
  else if(request.method==='tools/list')result={tools:[{name:'sum',description:'Adds two numbers',inputSchema:{type:'object',properties:{a:{type:'number'},b:{type:'number'}},required:['a','b']}}]};
  else if(request.method==='tools/call'&&request.params?.name==='sum')result={content:[{type:'text',text:String(Number(request.params.arguments.a)+Number(request.params.arguments.b))}]};
  else{
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'Unknown method'}})+'\n');
    continue;
  }
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\n');
}
