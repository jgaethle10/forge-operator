#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AmbientDeviceRegistry } from './ambient-device-registry.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);
const sha=(v)=>'sha256:'+createHash('sha256').update(String(v)).digest('hex');
const clean=v=>String(v??'').trim();

function safeExec(command,args=[]){
  try{
    return execFileSync(command,args,{
      encoding:'utf8',
      timeout:5000,
      stdio:['ignore','pipe','ignore'],
    });
  }catch{
    return '';
  }
}

function saltFile(root){return path.join(root,'.device-id-salt');}
function loadSalt(root){
  const file=saltFile(root);
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  if(!fs.existsSync(file)){
    fs.writeFileSync(file,randomBytes(32).toString('hex')+'\n',{mode:0o600});
  }
  return fs.readFileSync(file,'utf8').trim();
}
function idHash(salt,value){return sha(salt+'|'+String(value).toLowerCase());}

export function parseIpNeigh(text,{salt='test'}={}){
  const out=[];
  for(const line of String(text||'').split(/\r?\n/)){
    const s=line.trim(); if(!s)continue;
    const parts=s.split(/\s+/);
    const ip=parts[0]||'';
    const devIndex=parts.indexOf('dev');
    const llIndex=parts.indexOf('lladdr');
    const dev=devIndex>=0?parts[devIndex+1]||'':null;
    const mac=llIndex>=0?parts[llIndex+1]||'':null;
    const state=parts.at(-1)||'';
    if(!ip)continue;
    out.push({
      source:'ip-neigh',
      observation_kind:'lan-neighbor',
      device_hint_hash:idHash(salt,mac||ip),
      address_hint_hash:idHash(salt,ip),
      interface:dev,
      neighbor_state:state,
      raw_identifier_persisted:false,
    });
  }
  return out;
}

export function parseBluetoothDevices(text,{salt='test'}={}){
  const out=[];
  for(const line of String(text||'').split(/\r?\n/)){
    const m=line.match(/^Device\s+([0-9A-F:]{17})\s+(.+)$/i);
    if(!m)continue;
    out.push({
      source:'bluetoothctl',
      observation_kind:'bluetooth-device',
      device_hint_hash:idHash(salt,m[1]),
      display_hint_hash:idHash(salt,m[2]),
      raw_identifier_persisted:false,
    });
  }
  return out;
}

export function parseAvahi(text,{salt='test'}={}){
  const out=[];
  for(const line of String(text||'').split(/\r?\n/)){
    if(!line.startsWith('='))continue;
    const fields=line.split(';');
    if(fields.length<6)continue;
    const iface=fields[1]||null;
    const protocol=fields[2]||null;
    const name=fields[3]||'';
    const serviceType=fields[4]||'';
    const domain=fields[5]||'';
    out.push({
      source:'avahi',
      observation_kind:'mdns-service',
      device_hint_hash:idHash(salt,name+'|'+serviceType+'|'+domain),
      service_type:serviceType,
      interface:iface,
      address_family:protocol,
      raw_identifier_persisted:false,
    });
  }
  return out;
}

export function dedupeObservations(observations=[]){
  const seen=new Set();
  const rows=[];
  for(const row of observations){
    const key=[row.source,row.observation_kind,row.device_hint_hash,row.service_type||''].join('|');
    if(seen.has(key))continue;
    seen.add(key);
    rows.push(row);
  }
  return rows.sort((a,b)=>
    a.observation_kind.localeCompare(b.observation_kind)||
    a.device_hint_hash.localeCompare(b.device_hint_hash)
  );
}

export function runPassiveAmbientCensus({
  root=path.join(os.homedir(),'.local/state/evercraft/saban-ambient'),
  now=new Date(),
  commandRunner=safeExec,
}={}){
  const salt=loadSalt(root);
  const observations=dedupeObservations([
    ...parseIpNeigh(commandRunner('ip',['neigh','show']),{salt}),
    ...parseBluetoothDevices(commandRunner('bluetoothctl',['devices']),{salt}),
    ...parseAvahi(commandRunner('avahi-browse',['-artp']),{salt}),
  ]);

  const body={
    schema:'evercraft.saban.passive-ambient-census.v1',
    mode:'passive_observation_only',
    active_device_control:false,
    authorization_granted:false,
    raw_mac_persisted:false,
    raw_ip_persisted:false,
    raw_bluetooth_address_persisted:false,
    observation_count:observations.length,
    observations,
    observed_at:(now instanceof Date?now:new Date(now)).toISOString(),
  };
  return {...body,receipt_hash:sha(JSON.stringify(body))};
}

export function admitCensusObservationsToRegistry({
  census,
  registry,
}={}){
  if(census?.schema!=='evercraft.saban.passive-ambient-census.v1'){
    throw new Error('passive_ambient_census_required');
  }
  if(!(registry instanceof AmbientDeviceRegistry)){
    throw new Error('ambient_device_registry_required');
  }
  const rows=[];
  for(const obs of census.observations||[]){
    const deviceId='observed-'+obs.device_hint_hash.replace(/^sha256:/,'').slice(0,24);
    const record=registry.observe({
      device_id:deviceId,
      observed_at:census.observed_at,
    });
    rows.push({
      device_id:deviceId,
      state:record.state,
      source:obs.source,
      observation_kind:obs.observation_kind,
      authorization_granted:false,
    });
  }
  return {
    schema:'evercraft.saban.passive-census-admission.v1',
    observed_count:rows.length,
    authorized_count:0,
    rows,
    admitted_at:new Date().toISOString(),
  };
}

async function main(){
  const root=path.resolve(process.env.SABAN_AMBIENT_STATE_DIR||path.join(os.homedir(),'.local/state/evercraft/saban-ambient'));
  const registry=new AmbientDeviceRegistry({root:path.join(root,'registry')});
  const census=runPassiveAmbientCensus({root});
  const admission=admitCensusObservationsToRegistry({census,registry});
  const output={census,admission,registry:registry.list()};
  process.stdout.write(JSON.stringify(output,null,2)+'\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  main().catch(error=>{
    process.stderr.write(JSON.stringify({
      ok:false,
      schema:'evercraft.saban.passive-ambient-census-error.v1',
      error:error instanceof Error?error.message:String(error),
      active_device_control:false,
    })+'\n');
    process.exitCode=1;
  });
}
