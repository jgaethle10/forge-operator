#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateCapabilitySubmission} from './capability.mjs';
import {modernParams,checkModernDiscover} from './modern-protocol.mjs';

const VERSION='0.1.0-dev';
const STORE=path.join(process.env.XDG_CONFIG_HOME||path.join(os.homedir(),'.config'),'evercraft','operator-tools.json');
const TOOL_ID=/^[a-z][a-z0-9_.-]{2,63}$/;
const TIMEOUT_MS=5000;
const MAX_OUTPUT=1024*1024;
const write=value=>process.stdout.write(JSON.stringify(value,null,2)+'\n');
const fail=message=>{throw Error(message)};

export function validateManifest(data){
  if(!data||typeof data!=='object'||Array.isArray(data))fail('Manifest must be a JSON object.');
  if(typeof data.id!=='string'||!TOOL_ID.test(data.id))fail('Invalid id: use 3-64 lowercase letters, digits, period, underscore or hyphen.');
  if(typeof data.name!=='string'||!data.name.trim()||data.name.length>100)fail('Invalid name.');
  if(data.transport!=='mcp-stdio')fail('Only transport=mcp-stdio is supported in this preview.');
  if(typeof data.command!=='string'||!data.command.trim()||data.command.length>300||/[\r\n\u0000]/.test(data.command))fail('Invalid program path/name.');
  if(data.args!==undefined&&(!Array.isArray(data.args)||data.args.length>30||data.args.some(v=>typeof v!=='string'||v.length>1000||/[\u0000]/.test(v))))fail('Invalid args.');
  if(data.description!==undefined&&(typeof data.description!=='string'||data.description.length>500))fail('Invalid description.');
  return {id:data.id,name:data.name.trim(),description:data.description||'',transport:data.transport,command:data.command,args:data.args||[]};
}
function readStore(){
  if(!fs.existsSync(STORE))return {schema:'evercraft.operator-tools.v1',tools:[]};
  const result=JSON.parse(fs.readFileSync(STORE,'utf8'));
  if(result?.schema!=='evercraft.operator-tools.v1'||!Array.isArray(result.tools))fail('Unexpected tool-store schema.');
  return result;
}
function saveStore(data){
  fs.mkdirSync(path.dirname(STORE),{recursive:true,mode:0o700});
  const tmp=STORE+'.'+process.pid+'.tmp';
  try{
    fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});
    fs.renameSync(tmp,STORE);
  }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
const allowedEnv=()=>{
  const safe={};
  for(const name of ['PATH','Path','HOME','USERPROFILE','SYSTEMROOT','COMSPEC','TMP','TEMP','TMPDIR']){
    if(process.env[name])safe[name]=process.env[name];
  }
  return safe;
};
export async function mcpStdio(tool,mode,toolName,input={},options={}){
  const protocol=options.protocol||'legacy';
  if(!['legacy','modern'].includes(protocol))fail('Protocol must be legacy or modern.');
  const child=spawn(tool.command,tool.args||[],{shell:false,stdio:['pipe','pipe','pipe'],windowsHide:true,env:allowedEnv()});
  let lineBuffer='',stderr='',finished=false,bytes=0,seq=0;
  const awaiting=new Map();
  const rejectAll=error=>{for(const a of awaiting.values())a.reject(error);awaiting.clear();};
  child.on('error',rejectAll);
  child.on('exit',code=>{if(!finished)rejectAll(Error('MCP subprocess exited '+code+': '+stderr.slice(-250)));});
  child.stderr.on('data',x=>{stderr=(stderr+x.toString()).slice(-2048);});
  const send=(method,params={},notify=false)=>{
    const id=++seq;
    const promise=notify?Promise.resolve():new Promise((resolve,reject)=>awaiting.set(id,{resolve,reject}));
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',...(notify?{}:{id}),method,params})+'\n');
    return promise;
  };
  child.stdout.on('data',chunk=>{
    bytes+=chunk.length;
    if(bytes>MAX_OUTPUT){rejectAll(Error('MCP output limit exceeded'));child.kill();return;}
    lineBuffer+=chunk.toString('utf8');
    let end;
    while((end=lineBuffer.indexOf('\n'))!==-1){
      const line=lineBuffer.slice(0,end).trim();
      lineBuffer=lineBuffer.slice(end+1);
      if(!line)continue;
      let message;
      try{message=JSON.parse(line);}catch{continue;}
      const item=awaiting.get(message?.id);
      if(!item)continue;
      awaiting.delete(message.id);
      if(message.error)item.reject(Error('MCP error: '+JSON.stringify(message.error)));
      else item.resolve(message.result);
    }
  });
  const timer=setTimeout(()=>{rejectAll(Error('MCP tool exceeded five-second preview limit'));child.kill();},TIMEOUT_MS);
  try{
    let serverInfo,protocolVersion;
    if(protocol==='modern'){
      // Explicit only. Never try the modern probe on arbitrary legacy servers automatically.
      const discovered=await send('server/discover',modernParams());
      ({serverInfo,protocolVersion}=checkModernDiscover(discovered));
    }else{
      const initialized=await send('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'evercraft-operator-cli',version:VERSION}});
      if(!initialized||!initialized.protocolVersion)fail('Invalid MCP initialize response.');
      serverInfo=initialized.serverInfo||{};
      protocolVersion=initialized.protocolVersion;
      await send('notifications/initialized',{},true);
    }
    const listed=await send('tools/list',protocol==='modern'?modernParams():{});
    if(!Array.isArray(listed?.tools))fail('Invalid MCP tools/list response.');
    if(mode==='probe')return {status:'local_probe_succeeded',protocolEra:protocol,protocolVersion,serverInfo,tools:listed.tools.map(x=>({name:x.name,description:x.description||''}))};
    const advertised=listed.tools.find(x=>x.name===toolName);
    if(!advertised)fail('Tool is not advertised: '+toolName);
    const params={name:toolName,arguments:input};
    const response=await send('tools/call',protocol==='modern'?modernParams(params):params);
    return {status:'tool_returned',tool:toolName,result:response};
  }finally{
    finished=true;
    clearTimeout(timer);
    child.kill();
  }
}
function help(){
  process.stdout.write([
    'Evercraft Operator CLI '+VERSION+' (developer preview)',
    'evercraft doctor',
    'evercraft tool add path/to/manifest.json       Metadata only; no execution',
    'evercraft tool list',
    'evercraft tool inspect TOOL_ID',
    'evercraft tool export TOOL_ID --format portable|vscode  (JSON only, never executes)',
    'evercraft tool remove TOOL_ID                 Removes registration, not files',
    'evercraft capability validate ./candidate.json  Offline review of publisher manifest',
    'evercraft tool probe TOOL_ID --run [--protocol modern] (default: legacy)',
    'evercraft tool call TOOL_ID TOOL --input JSON --approve [--protocol modern]',
    'No remote registry, payments, public tool publishing or arbitrary installs.'
  ].join('\n')+'\n');
}
export async function main(args=process.argv.slice(2)){
  const [section,command,id]=args;
  if(!section||section==='help'||section==='--help')return help();
  if(section==='--version'||section==='version')return process.stdout.write(VERSION+'\n');
  if(section==='doctor')return write({version:VERSION,node:process.version,store:STORE,registeredTools:readStore().tools.length,fabric:'not_tested',payments:'not_tested',mode:'local_developer_preview'});
  if(section==='capability'){
    if(command!=='validate'||!id)fail('Usage: capability validate ./candidate.json');
    const candidate=JSON.parse(fs.readFileSync(path.resolve(id),'utf8'));
    return write(validateCapabilitySubmission(candidate));
  }
  if(section!=='tool')fail('Unknown command. Run --help.');
  const store=readStore();
  if(command==='list')return write(store.tools);
  if(command==='add'){
    if(!id)fail('Provide manifest path.');
    const tool=validateManifest(JSON.parse(fs.readFileSync(path.resolve(id),'utf8')));
    if(store.tools.some(x=>x.id===tool.id))fail('Duplicate tool id: '+tool.id);
    store.tools.push(tool);saveStore(store);
    return write({registered:tool.id,executed:false});
  }
  if(!id)fail('Provide tool id.');
  const tool=store.tools.find(x=>x.id===id);
  if(!tool)fail('Unknown registered tool: '+id);
  if(command==='inspect')return write(tool);
  if(command==='remove'){
    store.tools=store.tools.filter(x=>x.id!==id);saveStore(store);
    return write({removed:id,executableDeleted:false});
  }
  if(command==='export'){
    const index=args.indexOf('--format');
    if(index<0||!args[index+1]||!['portable','vscode'].includes(args[index+1]))fail('Usage: tool export ID --format portable|vscode');
    if(args.length!==5)fail('Export accepts only tool ID and --format portable|vscode.');
    // Exports only the already-registered command/args. No credentials, network calls,
    // execution, local client configuration modification or tool-granted permissions.
    const profile=args[index+1];
    const entry=profile==='vscode'?{type:'stdio',command:tool.command,args:tool.args}:{command:tool.command,args:tool.args};
    return write(profile==='vscode'?{servers:{[tool.id]:entry}}:{mcpServers:{[tool.id]:entry}});
  }
  const protocolIndex=args.indexOf('--protocol');
  const protocol=protocolIndex<0?'legacy':args[protocolIndex+1];
  if(!['legacy','modern'].includes(protocol))fail('Use --protocol legacy or --protocol modern.');
  if(command==='probe'){
    if(!args.includes('--run'))fail('Launching a registered tool requires --run.');
    return write(await mcpStdio(tool,'probe',undefined,{}, {protocol}));
  }
  if(command==='call'){
    if(!args.includes('--approve'))fail('Calling a registered tool requires --approve.');
    const name=args[3],position=args.indexOf('--input');
    if(!name||name.startsWith('--')||position<0||!args[position+1])fail('Usage: tool call ID NAME --input JSON --approve');
    const input=JSON.parse(args[position+1]);
    if(!input||typeof input!=='object'||Array.isArray(input))fail('Input must be a JSON object.');
    process.stderr.write('Calling '+id+'/'+name+' with explicit approval; input omitted from logs\n');
    return write(await mcpStdio(tool,'call',name,input,{protocol}));
  }
  fail('Unknown tool command.');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  main().catch(e=>{process.stderr.write('Error: '+e.message+'\n');process.exitCode=1;});
}
