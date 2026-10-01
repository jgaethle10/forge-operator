#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { AmbientDeviceRegistry } from './ambient-device-registry.mjs';
import { microDeviceToAmbientCapabilities } from './microseed-device-bridge.mjs';
import { resolveAmbientComputeOffers } from './ambient-compute-fabric.mjs';
import {
  loadAmbientMemoryMasterKey,
} from './ambient-memory-fabric.mjs';
import {
  protectAmbientMemoryMasterKey,
  recoverAmbientMemoryMasterKey,
} from './ambient-memory-key-resilience.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);
const sha=v=>'sha256:'+createHash('sha256').update(v).digest('hex');
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};
function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function readJson(file,fallback=null){
  if(!fs.existsSync(file))return fallback;
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function hasMemoryObjects(root){
  const dir=path.join(root,'memory','manifests');
  try{return fs.readdirSync(dir).some(x=>x.endsWith('.json'));}
  catch{return false;}
}
function shareOffers({registry,now}){
  const snapshot=registry.list({now});
  const capabilities=snapshot.rows.flatMap(row=>{
    if(row.eligible!==true||!row.manifest)return [];
    try{
      return microDeviceToAmbientCapabilities(row.manifest,{conformance:row.conformance||null});
    }catch{return [];}
  });
  return resolveAmbientComputeOffers({
    capabilities,
    workloadClass:'systemia.secret-share-vault.v1',
    requireZeroCost:true,
    requireVerifiedWorkload:true,
    now,
  }).offers;
}
function keyState(root){
  try{
    const key=loadAmbientMemoryMasterKey(root);
    return {present:true,fingerprint:sha(key)};
  }catch(error){
    if(String(error?.message||error).includes('master_key_missing_recovery_required')){
      return {present:false,fingerprint:null};
    }
    throw error;
  }
}

export async function runAmbientMemoryResilienceOnce({
  root,
  gatewayUrl='http://127.0.0.1:8791',
  gatewayToken='',
  minimumShareNodes=3,
  threshold=2,
  reprotectAfterMs=30*24*60*60*1000,
  now=new Date(),
}={}){
  const resolvedRoot=path.resolve(
    root||process.env.SABAN_AMBIENT_STATE_DIR||path.join(os.homedir(),'.local/state/evercraft/saban-ambient')
  );
  if(!String(gatewayToken||'').trim()) throw new Error('ambient_memory_resilience_gateway_token_required');

  const registry=new AmbientDeviceRegistry({root:path.join(resolvedRoot,'registry')});
  const offers=shareOffers({registry,now});
  const memoryPresent=hasMemoryObjects(resolvedRoot);
  const localKey=keyState(resolvedRoot);
  const protectionFile=path.join(resolvedRoot,'memory','key-protection-state.json');
  const prior=readJson(protectionFile,null);
  const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));
  const minNodes=Math.max(2,Math.floor(Number(minimumShareNodes||3)));
  const targetThreshold=Math.max(2,Math.min(minNodes,Math.floor(Number(threshold||2))));

  let state='idle';
  let action='none';
  let detail=null;

  if(!memoryPresent&&!localKey.present){
    state='idle_no_memory';
    action='none';
  }else if(!localKey.present){
    if(offers.length<targetThreshold){
      state='held_recovery_capacity_missing';
      action='hold';
      detail={
        required_threshold:targetThreshold,
        available_share_nodes:offers.length,
      };
    }else{
      try{
        const recovered=await recoverAmbientMemoryMasterKey({
          stateDir:resolvedRoot,
          offers,
          gatewayUrl,
          gatewayToken,
        });
        state='recovered';
        action='recover_master_key';
        detail=recovered;
      }catch(error){
        state='held_recovery_unavailable';
        action='hold';
        detail={error:String(error?.message||error)};
      }
    }
  }else{
    const priorAt=Date.parse(String(prior?.protected_at||''))||0;
    const stale=!priorAt||nowMs-priorAt>Math.max(60_000,Number(reprotectAfterMs||0));
    const fingerprintChanged=prior?.master_fingerprint!==localKey.fingerprint;
    const insufficientPrior=
      Number(prior?.share_count||0)<minNodes ||
      Number(prior?.threshold||0)<targetThreshold;

    if(!stale&&!fingerprintChanged&&!insufficientPrior){
      state='protected';
      action='keep_current_generation';
      detail=prior;
    }else if(offers.length<minNodes){
      state='held_protection_capacity_missing';
      action='hold';
      detail={
        master_fingerprint:localKey.fingerprint,
        required_share_nodes:minNodes,
        available_share_nodes:offers.length,
        prior_protection_present:Boolean(prior),
        prior_protection_fingerprint_matches:prior?.master_fingerprint===localKey.fingerprint,
      };
    }else{
      const protectedKey=await protectAmbientMemoryMasterKey({
        stateDir:resolvedRoot,
        offers,
        gatewayUrl,
        gatewayToken,
        share_count:minNodes,
        threshold:targetThreshold,
        now,
      });
      const protectionState={
        schema:'evercraft.saban.ambient-memory-key-protection-state.v1',
        generation:protectedKey.generation,
        slot_id:protectedKey.slot_id,
        master_fingerprint:protectedKey.master_fingerprint,
        threshold:protectedKey.threshold,
        share_count:protectedKey.share_count,
        distinct_device_count:protectedKey.distinct_device_count,
        protected_at:protectedKey.protected_at,
        master_key_exposed:false,
        share_values_exposed:false,
      };
      atomicJson(protectionFile,protectionState);
      state='protected';
      action='protect_master_key';
      detail=protectionState;
    }
  }

  const postKey=keyState(resolvedRoot);
  const receipt={
    schema:'evercraft.saban.ambient-memory-resilience-cycle.v1',
    state,
    action,
    memory_objects_present:memoryPresent,
    local_master_key_present:postKey.present,
    local_master_fingerprint:postKey.fingerprint,
    eligible_share_nodes:offers.length,
    minimum_share_nodes:minNodes,
    threshold:targetThreshold,
    detail,
    replacement_key_generated_during_recovery:false,
    commercial_capacity_authorized:false,
    external_cash_spend_usd:0,
    generated_at:new Date(nowMs).toISOString(),
  };
  atomicJson(path.join(resolvedRoot,'memory','resilience-cycle.json'),receipt);
  return receipt;
}

async function main(){
  const root=path.resolve(
    arg('--root',process.env.SABAN_AMBIENT_STATE_DIR||path.join(os.homedir(),'.local/state/evercraft/saban-ambient'))
  );
  const tokenFile=path.resolve(arg('--gateway-token-file',path.join(root,'.secrets','microseed-gateway-token')));
  if(!fs.existsSync(tokenFile)) throw new Error('ambient_memory_resilience_gateway_token_file_missing');
  const gatewayToken=fs.readFileSync(tokenFile,'utf8').trim();
  const receipt=await runAmbientMemoryResilienceOnce({
    root,
    gatewayUrl:arg('--gateway-url','http://127.0.0.1:8791'),
    gatewayToken,
    minimumShareNodes:Number(arg('--share-nodes','3')),
    threshold:Number(arg('--threshold','2')),
    now:new Date(),
  });
  process.stdout.write(JSON.stringify(receipt)+'\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  main().catch(error=>{
    process.stderr.write(JSON.stringify({
      ok:false,
      schema:'evercraft.saban.ambient-memory-resilience-error.v1',
      error:error instanceof Error?error.message:String(error),
      replacement_key_generated_during_recovery:false,
      commercial_capacity_authorized:false,
    })+'\n');
    process.exitCode=1;
  });
}
