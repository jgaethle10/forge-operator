#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { AmbientDeviceRegistry } from './ambient-device-registry.mjs';
import { evaluateAmbientTrust } from './ambient-device-trust.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);
const clean=v=>String(v??'').trim();

function arg(name,fallback=''){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
}
function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function readJson(file,fallback={}){
  if(!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function safeId(v){
  const id=clean(v).replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,160);
  if(!id) throw new Error('device_id_required');
  return id;
}
function tokenFile(root,deviceId){
  return path.join(root,'.secrets','device-tokens',safeId(deviceId)+'.token');
}
async function readBoundedJson(response,maxBytes=2*1024*1024){
  const text=await response.text();
  if(Buffer.byteLength(text)>maxBytes) throw new Error('probation_gateway_response_too_large');
  try{return JSON.parse(text);}
  catch{throw new Error('probation_gateway_response_invalid_json');}
}
function backoffMs(attempt){
  const n=Math.max(1,Number(attempt||1));
  return Math.min(6*60*60*1000,30_000*Math.pow(2,Math.min(8,n-1)));
}
function conformanceNeedsRefresh(conformance,manifest,nowMs,refreshBeforeMs){
  if(!conformance) return true;
  if(conformance.schema!=='evercraft.microseed.conformance-receipt.v1') return true;
  if(conformance.device_id!==manifest.device_id) return true;
  if(conformance.manifest_hash!==manifest.manifest_hash) return true;
  const expires=Date.parse(String(conformance.expires_at||''));
  if(!Number.isFinite(expires)) return true;
  return expires-nowMs<=refreshBeforeMs;
}
async function gatewayPost({gatewayUrl,gatewayToken,route,body,fetchImpl=fetch}){
  const base=new URL(String(gatewayUrl||''));
  const loopback=['127.0.0.1','localhost','::1'].includes(base.hostname.toLowerCase());
  if(!loopback) throw new Error('probation_gateway_must_be_loopback');
  const endpoint=new URL(route,base);
  const response=await fetchImpl(endpoint,{
    method:'POST',
    headers:{
      authorization:'Bearer '+gatewayToken,
      'content-type':'application/json',
      accept:'application/json',
    },
    body:JSON.stringify(body),
  });
  const payload=await readBoundedJson(response);
  if(!response.ok||payload?.ok!==true){
    throw new Error('probation_gateway_http_'+response.status+':'+clean(payload?.error||'request_failed'));
  }
  return payload;
}

export async function runMicroSeedProbationOnce({
  root,
  gatewayUrl='http://127.0.0.1:8791',
  gatewayToken='',
  now=new Date(),
  refreshBeforeMs=24*60*60*1000,
  calibrate=true,
  fetchImpl=fetch,
}={}){
  const resolvedRoot=path.resolve(
    root||process.env.SABAN_AMBIENT_STATE_DIR||path.join(os.homedir(),'.local/state/evercraft/saban-ambient')
  );
  const token=clean(gatewayToken);
  if(!token) throw new Error('probation_gateway_token_required');
  const registry=new AmbientDeviceRegistry({root:path.join(resolvedRoot,'registry')});
  const stateFile=path.join(resolvedRoot,'probation-state.json');
  const state=readJson(stateFile,{
    schema:'evercraft.saban.microseed-probation-state.v1',
    devices:{},
    updated_at:null,
  });
  if(state.schema!=='evercraft.saban.microseed-probation-state.v1'||!state.devices){
    throw new Error('probation_state_invalid');
  }

  const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));
  const snapshot=registry.list({now});
  const autonomyFile=path.join(resolvedRoot,'capacity-autonomy-plan.json');
  const autonomyPlan=fs.existsSync(autonomyFile)
    ? readJson(autonomyFile,null)
    : null;
  const plannedDevices=new Set(
    autonomyPlan?.schema==='evercraft.saban.capacity-autonomy-plan.v1'
      ? (autonomyPlan.safe_autonomous_actions||[])
          .filter(x=>[
            'run_registered_workload_conformance_canaries',
            'run_safe_calibration_and_refresh_performance_profile',
            'compile_offer_and_rebalance_matching_checkpointable_work'
          ].includes(String(x.action||'')))
          .map(x=>String(x.device_id||''))
          .filter(Boolean)
      : []
  );
  const autonomyPlanPresent=autonomyPlan?.schema==='evercraft.saban.capacity-autonomy-plan.v1';
  const rows=[];

  for(const row of snapshot.rows||[]){
    const manifest=row.manifest;
    if(!manifest||manifest.compute_execution_mode==='none') continue;

    const deviceId=row.device_id;
    if(autonomyPlanPresent&&!plannedDevices.has(deviceId)){
      rows.push({
        device_id:deviceId,
        state:'idle',
        reason:'no_current_autonomy_action',
      });
      continue;
    }
    const trust=evaluateAmbientTrust(registry.get(deviceId),{now});
    const prior=state.devices[deviceId]||{
      attempts:0,
      next_attempt_at:null,
      state:'new',
      last_error:null,
    };

    if(!trust.eligible){
      rows.push({
        device_id:deviceId,
        state:'held',
        reason:'trust_not_active:'+trust.reason,
      });
      continue;
    }

    const credentialPresent=fs.existsSync(tokenFile(resolvedRoot,deviceId));
    if(!credentialPresent){
      rows.push({
        device_id:deviceId,
        state:'held',
        reason:'device_credential_missing',
      });
      continue;
    }

    const nextAttempt=Date.parse(String(prior.next_attempt_at||''))||0;
    if(nextAttempt>nowMs){
      rows.push({
        device_id:deviceId,
        state:'backoff',
        reason:'retry_backoff',
        next_attempt_at:prior.next_attempt_at,
      });
      continue;
    }

    const conformance=registry.conformance(deviceId);
    const needsConformance=conformanceNeedsRefresh(
      conformance,manifest,nowMs,Math.max(60_000,Number(refreshBeforeMs||0))
    );

    try{
      let conformanceResult=conformance;
      let conformanceAction='kept_fresh';
      if(needsConformance){
        conformanceResult=await gatewayPost({
          gatewayUrl,
          gatewayToken:token,
          route:'/v1/conformance',
          body:{device_id:deviceId},
          fetchImpl,
        });
        conformanceAction='refreshed';
      }

      let calibrationResult=null;
      let calibrationAction='not_requested';
      if(calibrate===true){
        calibrationResult=await gatewayPost({
          gatewayUrl,
          gatewayToken:token,
          route:'/v1/calibrate',
          body:{
            device_id:deviceId,
            samples_per_workload:3,
            max_total_samples:12,
          },
          fetchImpl,
        });
        calibrationAction='completed';
      }

      state.devices[deviceId]={
        attempts:0,
        next_attempt_at:null,
        state:'production_eligible',
        last_error:null,
        conformance_receipt_hash:
          conformanceResult?.receipt_hash||
          conformanceResult?.conformance_receipt_hash||
          null,
        conformance_expires_at:conformanceResult?.expires_at||conformance?.expires_at||null,
        calibration_receipt_hash:calibrationResult?.receipt_hash||null,
        updated_at:new Date(nowMs).toISOString(),
      };
      rows.push({
        device_id:deviceId,
        state:'production_eligible',
        conformance_action:conformanceAction,
        calibration_action:calibrationAction,
        conformance_receipt_hash:state.devices[deviceId].conformance_receipt_hash,
        calibration_receipt_hash:state.devices[deviceId].calibration_receipt_hash,
      });
    }catch(error){
      const attempts=Number(prior.attempts||0)+1;
      const wait=backoffMs(attempts);
      state.devices[deviceId]={
        ...prior,
        attempts,
        state:'retry_wait',
        last_error:String(error?.message||error),
        next_attempt_at:new Date(nowMs+wait).toISOString(),
        updated_at:new Date(nowMs).toISOString(),
      };
      rows.push({
        device_id:deviceId,
        state:'retry_wait',
        reason:String(error?.message||error),
        attempts,
        next_attempt_at:state.devices[deviceId].next_attempt_at,
      });
    }
  }

  state.updated_at=new Date(nowMs).toISOString();
  atomicJson(stateFile,state);

  const receipt={
    schema:'evercraft.saban.microseed-probation-cycle.v1',
    active_compute_devices:rows.length,
    production_eligible:rows.filter(x=>x.state==='production_eligible').length,
    held:rows.filter(x=>x.state==='held').length,
    retry_wait:rows.filter(x=>x.state==='retry_wait'||x.state==='backoff').length,
    idle:rows.filter(x=>x.state==='idle').length,
    autonomy_plan_present:autonomyPlanPresent,
    autonomy_plan_receipt:autonomyPlan?.receipt_hash||null,
    planned_device_count:plannedDevices.size,
    rows,
    owner_authorization_changed:false,
    credentials_created:false,
    arbitrary_code_execution:false,
    safe_registered_canaries_only:true,
    generated_at:new Date(nowMs).toISOString(),
  };
  atomicJson(path.join(resolvedRoot,'probation-cycle.json'),receipt);
  return receipt;
}

async function main(){
  const root=path.resolve(arg('--root',process.env.SABAN_AMBIENT_STATE_DIR||path.join(os.homedir(),'.local/state/evercraft/saban-ambient')));
  const tokenFilePath=path.resolve(arg('--gateway-token-file',path.join(root,'.secrets','microseed-gateway-token')));
  if(!fs.existsSync(tokenFilePath)) throw new Error('probation_gateway_token_file_missing');
  const token=fs.readFileSync(tokenFilePath,'utf8').trim();
  const receipt=await runMicroSeedProbationOnce({
    root,
    gatewayUrl:arg('--gateway-url','http://127.0.0.1:8791'),
    gatewayToken:token,
    calibrate:arg('--calibrate','true')!=='false',
    now:new Date(),
  });
  process.stdout.write(JSON.stringify(receipt)+'\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  main().catch(error=>{
    process.stderr.write(JSON.stringify({
      ok:false,
      schema:'evercraft.saban.microseed-probation-error.v1',
      error:error instanceof Error?error.message:String(error),
      owner_authorization_changed:false,
      credentials_created:false,
    })+'\n');
    process.exitCode=1;
  });
}
