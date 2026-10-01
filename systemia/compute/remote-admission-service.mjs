#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { RemoteAdmissionKeeper } from './remote-admission-keeper.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);
const clean=(v)=>String(v??'').trim();
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};
const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});
  const tmp=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function localEndpoint(root){
  const file=path.join(root,'nodeseed-receipt.json');
  if(!fs.existsSync(file)) throw new Error('nodeseed_receipt_missing');
  const receipt=JSON.parse(fs.readFileSync(file,'utf8'));
  const endpoint=new URL(clean(receipt.endpoint));
  return 'http://127.0.0.1:'+endpoint.port;
}
function readEnvFile(file){
  const out={};
  if(!fs.existsSync(file))return out;
  for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
    const trimmed=line.trim();
    if(!trimmed||trimmed.startsWith('#'))continue;
    const i=trimmed.indexOf('=');
    if(i<=0)continue;
    out[trimmed.slice(0,i)]=trimmed.slice(i+1);
  }
  return out;
}

export async function startRemoteAdmissionService({
  root='/var/lib/evercraft/nodeseed',
  envFile='/etc/evercraft/nodeseed.env',
  brokerUrl='',
  allocatorToken='',
  statusEveryMs=5000,
}={}){
  const resolvedRoot=path.resolve(root);
  const env=readEnvFile(path.resolve(envFile));
  const broker=clean(brokerUrl||process.env.EVERCRAFT_REMOTE_BROKER_URL||env.EVERCRAFT_REMOTE_BROKER_URL);
  const token=clean(allocatorToken||process.env.EVERCRAFT_ALLOCATOR_TOKEN||env.EVERCRAFT_ALLOCATOR_TOKEN);
  if(!broker)throw new Error('EVERCRAFT_REMOTE_BROKER_URL is required');
  if(!token)throw new Error('EVERCRAFT_ALLOCATOR_TOKEN is required');
  const endpoint=localEndpoint(resolvedRoot);
  const keeper=new RemoteAdmissionKeeper({
    brokerUrl:broker,
    localCapacityEndpoint:endpoint,
    localAllocatorToken:token,
  });
  keeper.start();

  const statusFile=path.join(resolvedRoot,'remote-admission-status.json');
  const write=()=>{
    const status=keeper.status();
    const body={
      ...status,
      broker_origin:(()=>{try{return new URL(broker).origin}catch{return null}})(),
      allocator_token_exposed:false,
      allocator_token_persisted_in_receipt:false,
      local_capacity_endpoint:endpoint,
      observed_at:new Date().toISOString(),
    };
    atomicJson(statusFile,{...body,receipt_hash:sha(body)});
    return body;
  };
  write();
  const timer=setInterval(write,Math.max(1000,Number(statusEveryMs||5000)));
  timer.unref?.();

  return {
    schema:'evercraft.remote-admission-service.v1',
    keeper,
    status:write,
    close:async()=>{
      clearInterval(timer);
      await keeper.close();
      write();
    },
  };
}

const direct=process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE;
if(direct){
  const root=path.resolve(arg('--root','/var/lib/evercraft/nodeseed'));
  const envFile=path.resolve(arg('--env-file','/etc/evercraft/nodeseed.env'));
  const service=await startRemoteAdmissionService({root,envFile});
  console.log(JSON.stringify({
    schema:service.schema,
    state:'started',
    public_ingress:false,
    local_compute_scope:'loopback_only',
    allocator_token_exposed:false,
  }));
  let closing=false;
  const close=async()=>{
    if(closing)return;
    closing=true;
    await service.close();
    process.exit(0);
  };
  process.on('SIGTERM',close);
  process.on('SIGINT',close);
}
