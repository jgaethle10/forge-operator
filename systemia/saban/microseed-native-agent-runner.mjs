#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startMicroSeedNativeAgent } from './microseed-native-agent.mjs';
import { loadMicroSeedDeviceIdentity } from './microseed-device-identity.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function readNumber(file,scale=1){
  try{
    const n=Number(fs.readFileSync(file,'utf8').trim());
    return Number.isFinite(n)?n/scale:null;
  }catch{return null;}
}
function globDirs(root,prefix){
  try{
    return fs.readdirSync(root)
      .filter(name=>name.startsWith(prefix))
      .map(name=>path.join(root,name));
  }catch{return [];}
}
function readCpuSnapshot(){
  try{
    const line=fs.readFileSync('/proc/stat','utf8').split(/\r?\n/)[0];
    const parts=line.trim().split(/\s+/).slice(1).map(Number);
    if(parts.some(x=>!Number.isFinite(x)))return null;
    const idle=(parts[3]||0)+(parts[4]||0);
    const total=parts.reduce((a,b)=>a+b,0);
    return {idle,total};
  }catch{return null;}
}
async function measuredCpuUtilization(){
  const a=readCpuSnapshot();
  if(!a)return null;
  await sleep(120);
  const b=readCpuSnapshot();
  if(!b)return null;
  const total=b.total-a.total;
  const idle=b.idle-a.idle;
  if(total<=0)return null;
  return Math.max(0,Math.min(1,(total-idle)/total));
}
function maxTemperatureC(){
  const values=[];
  for(const dir of globDirs('/sys/class/thermal','thermal_zone')){
    const value=readNumber(path.join(dir,'temp'),1000);
    if(value!=null&&value>-50&&value<200) values.push(value);
  }
  return values.length?Math.max(...values):null;
}
function batteryPercent(){
  const values=[];
  for(const dir of globDirs('/sys/class/power_supply','BAT')){
    const value=readNumber(path.join(dir,'capacity'),1);
    if(value!=null&&value>=0&&value<=100) values.push(value);
  }
  return values.length?Math.min(...values):null;
}
function externalPower(){
  const roots=['AC','ACAD','ADP','Mains'];
  for(const prefix of roots){
    for(const dir of globDirs('/sys/class/power_supply',prefix)){
      const online=readNumber(path.join(dir,'online'),1);
      if(online===1)return true;
      if(online===0)return false;
    }
  }
  return null;
}
function manifestLimits(manifest){
  return {
    cpu:Number(manifest.constraints?.cpu_utilization_ceiling??0.6),
    memoryReserve:Number(manifest.constraints?.memory_reserve_mb??64),
    temp:manifest.constraints?.temperature_ceiling_c==null
      ? null:Number(manifest.constraints.temperature_ceiling_c),
    battery:manifest.constraints?.battery_floor_percent==null
      ? null:Number(manifest.constraints.battery_floor_percent),
  };
}

export async function collectNativeHostTelemetry({manifest}={}){
  const cpu=await measuredCpuUtilization();
  const freeMemoryMb=os.freemem()/1024/1024;
  const temp=maxTemperatureC();
  const battery=batteryPercent();
  const power=externalPower();
  const limits=manifestLimits(manifest||{});

  const busy=
    (cpu!=null&&cpu>=Math.max(0.05,limits.cpu*0.9)) ||
    freeMemoryMb<limits.memoryReserve+128 ||
    (temp!=null&&limits.temp!=null&&temp>=limits.temp*0.9) ||
    (battery!=null&&limits.battery!=null&&battery<=limits.battery+5);

  return {
    primary_function_busy:Boolean(busy),
    primary_function_busy_basis:'host_safety_thresholds',
    cpu_utilization:cpu,
    memory_free_mb:Number(freeMemoryMb.toFixed(2)),
    temperature_c:temp,
    battery_percent:battery,
    external_power:power,
    network_utilization:null,
    power_measurement_state:'not_measured',
    power_watts:null,
    observed_at:new Date().toISOString(),
    max_age_ms:30000,
    source:'native_host_observation',
  };
}

async function main(){
  const manifestFile=path.resolve(arg('--manifest',''));
  const stateDir=path.resolve(arg('--state-dir',''));
  const identityDir=path.resolve(arg('--identity-dir',''));
  const tokenFile=path.resolve(arg('--token-file',''));
  const host=arg('--host','127.0.0.1');
  const port=Math.max(0,Number(arg('--port','8792')));

  for(const [name,file] of [
    ['manifest',manifestFile],
    ['token',tokenFile],
  ]){
    if(!file||!fs.existsSync(file)) throw new Error('microseed_runner_'+name+'_file_missing');
  }
  if(!stateDir) throw new Error('microseed_runner_state_dir_required');
  if(!identityDir) throw new Error('microseed_runner_identity_dir_required');

  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  if(manifest?.schema!=='evercraft.microseed.device-manifest.v1'){
    throw new Error('microseed_runner_manifest_invalid');
  }
  const identity=loadMicroSeedDeviceIdentity({
    root:identityDir,
    device_id:manifest.device_id,
  });
  if(
    manifest.attestation?.receipt_public_key_pem &&
    manifest.attestation.receipt_public_key_pem!==identity.public_key
  ){
    throw new Error('microseed_runner_manifest_identity_key_mismatch');
  }
  if(
    manifest.attestation?.receipt_key_id &&
    manifest.attestation.receipt_key_id!==identity.identity.key_id
  ){
    throw new Error('microseed_runner_manifest_identity_key_id_mismatch');
  }

  const token=fs.readFileSync(tokenFile,'utf8').trim();
  if(!token) throw new Error('microseed_runner_token_empty');

  const agent=await startMicroSeedNativeAgent({
    manifest,
    stateDir,
    host,
    port,
    authorizationToken:token,
    receiptSigningPrivateKey:identity.private_key,
    receiptSigningKeyId:identity.identity.key_id,
    telemetryProvider:collectNativeHostTelemetry,
  });

  process.stdout.write(JSON.stringify({
    schema:'evercraft.microseed.native-agent-runner.v1',
    ok:true,
    device_id:manifest.device_id,
    device_class:manifest.device_class,
    url:agent.url,
    public_key_fingerprint:identity.identity.public_key_fingerprint,
    private_key_exposed:false,
    signed_receipts:manifest.attestation?.receipt_signing_required===true,
    signed_telemetry:manifest.attestation?.telemetry_signing_required===true,
    observed_at:new Date().toISOString(),
  })+'\n');

  const shutdown=async()=>{
    try{await agent.close();}finally{process.exit(0);}
  };
  process.on('SIGTERM',()=>shutdown().catch(()=>process.exit(1)));
  process.on('SIGINT',()=>shutdown().catch(()=>process.exit(1)));
  await new Promise(()=>{});
}

if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  main().catch(error=>{
    process.stderr.write(JSON.stringify({
      ok:false,
      schema:'evercraft.microseed.native-agent-runner-error.v1',
      error:error instanceof Error?error.message:String(error),
      private_key_exposed:false,
    })+'\n');
    process.exitCode=1;
  });
}
