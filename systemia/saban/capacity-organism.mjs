#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { AmbientDeviceRegistry } from './ambient-device-registry.mjs';
import { runPassiveAmbientCensus, admitCensusObservationsToRegistry } from './ambient-census.mjs';
import { microDeviceToAmbientCapabilities } from './microseed-device-bridge.mjs';
import { resolveAmbientComputeOffers } from './ambient-compute-fabric.mjs';
import { composeCapabilityFabric, rivetAliEvCapabilityRoles } from './capability-fabric-composer.mjs';
import { rivetAliEvProductionAnatomy, formationWaves } from './workload-anatomy.mjs';
import { planHeterogeneousFabric } from './heterogeneous-fabric-planner.mjs';
import { loadPerformanceLedger } from './performance-learning.mjs';
import { planFabricRebalance } from './fabric-rebalance.mjs';

const MODULE_FILE=fileURLToPath(import.meta.url);

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function arg(name,fallback=null){
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
}
function has(name){return process.argv.includes(name);}

function activeCapabilities(snapshot){
  const caps=[];
  const rejected=[];
  for(const row of snapshot.rows||[]){
    if(row.eligible!==true){
      rejected.push({device_id:row.device_id,reason:row.reason||row.state});
      continue;
    }
    if(!row.manifest){
      rejected.push({device_id:row.device_id,reason:'capability_manifest_missing'});
      continue;
    }
    try{
      caps.push(...microDeviceToAmbientCapabilities(row.manifest,{conformance:row.conformance||null}));
    }catch(error){
      rejected.push({
        device_id:row.device_id,
        reason:error instanceof Error?error.message:String(error),
      });
    }
  }
  return {caps,rejected};
}

export function compileCapacityOrganismState({
  registrySnapshot,
  performanceLedger=null,
  previousPlan=null,
  checkpoints={},
  now=new Date(),
}={}){
  const {caps,rejected}=activeCapabilities(registrySnapshot);
  const anatomy=rivetAliEvProductionAnatomy();
  const compute=resolveAmbientComputeOffers({
    capabilities:caps,
    requireZeroCost:true,
    requireVerifiedWorkload:true,
    now,
  });
  const capabilityPlan=composeCapabilityFabric({
    roles:rivetAliEvCapabilityRoles(),
    capabilities:caps,
    now,
  });
  const workloadPlan=planHeterogeneousFabric({
    tasks:anatomy.tasks,
    offers:compute.offers,
    performanceLedger,
    previousPlan,
    now,
  });
  const rebalance=planFabricRebalance({
    previousPlan,
    nextPlan:workloadPlan,
    checkpoints,
    now,
  });
  const waves=formationWaves(anatomy);

  const missingCapabilityRoles=(capabilityPlan.held||[]).map(x=>({
    class:'capability',
    role_id:x.role_id,
    reason:x.reason,
  }));
  const missingWorkUnits=(workloadPlan.held||[]).map(x=>({
    class:'workload',
    task_id:x.task_id,
    unit_id:x.unit_id,
    reason:x.reason,
  }));

  const body={
    schema:'evercraft.saban.capacity-organism-state.v1',
    mode:'zero_spend_ambient_first',
    active_device_count:Number(registrySnapshot?.eligible_count||0),
    compiled_capability_count:caps.length,
    compute_offer_count:compute.offers.length,
    rejected_devices:rejected,
    capability_plan:capabilityPlan,
    workload_plan:workloadPlan,
    rebalance_plan:rebalance,
    performance_learning:{
      ledger_present:Boolean(performanceLedger),
      learned_profile_count:Object.keys(performanceLedger?.profiles||{}).length,
    },
    formation_waves:waves,
    missing_capacity:[...missingCapabilityRoles,...missingWorkUnits],
    production_ready:
      capabilityPlan.state==='ready'&&
      workloadPlan.state==='ready',
    commercial_capacity_considered:false,
    commercial_capacity_authorized:false,
    active_device_control_from_census:false,
    observation_never_grants_authority:true,
    generated_at:(now instanceof Date?now:new Date(now)).toISOString(),
  };
  return body;
}

export async function runCapacityOrganismOnce({
  root,
  runCensus=true,
  now=new Date(),
}={}){
  const resolvedRoot=path.resolve(
    root||process.env.SABAN_AMBIENT_STATE_DIR||path.join(os.homedir(),'.local/state/evercraft/saban-ambient')
  );
  const registry=new AmbientDeviceRegistry({root:path.join(resolvedRoot,'registry')});

  let census=null;
  let censusAdmission=null;
  if(runCensus){
    census=runPassiveAmbientCensus({root:resolvedRoot,now});
    censusAdmission=admitCensusObservationsToRegistry({census,registry});
  }

  const registrySnapshot=registry.list({now});
  const performanceLedger=loadPerformanceLedger(path.join(resolvedRoot,'performance-ledger.json'));
  const previousPlanFile=path.join(resolvedRoot,'heterogeneous-plan.json');
  const previousPlan=fs.existsSync(previousPlanFile)
    ? JSON.parse(fs.readFileSync(previousPlanFile,'utf8'))
    : null;
  const checkpointFile=path.join(resolvedRoot,'fabric-checkpoints.json');
  const checkpoints=fs.existsSync(checkpointFile)
    ? JSON.parse(fs.readFileSync(checkpointFile,'utf8'))
    : {};
  const compiled=compileCapacityOrganismState({
    registrySnapshot,
    performanceLedger,
    previousPlan,
    checkpoints,
    now,
  });
  const receipt={
    ...compiled,
    census:census?{
      observation_count:census.observation_count,
      receipt_hash:census.receipt_hash,
      active_device_control:census.active_device_control,
      authorization_granted:census.authorization_granted,
    }:null,
    census_admission:censusAdmission?{
      observed_count:censusAdmission.observed_count,
      authorized_count:censusAdmission.authorized_count,
    }:null,
  };

  atomicJson(path.join(resolvedRoot,'capacity-organism-state.json'),receipt);
  atomicJson(path.join(resolvedRoot,'ambient-registry-snapshot.json'),registrySnapshot);
  atomicJson(path.join(resolvedRoot,'heterogeneous-plan.json'),compiled.workload_plan);
  atomicJson(path.join(resolvedRoot,'rebalance-plan.json'),compiled.rebalance_plan);
  return receipt;
}

async function main(){
  const root=path.resolve(arg('--root',process.env.SABAN_AMBIENT_STATE_DIR||path.join(os.homedir(),'.local/state/evercraft/saban-ambient')));
  const once=has('--once');
  const runCensus=!has('--no-census');
  const intervalMs=Math.max(30000,Number(arg('--interval-ms','300000')));

  const cycle=async()=>{
    const receipt=await runCapacityOrganismOnce({root,runCensus,now:new Date()});
    process.stdout.write(JSON.stringify({
      schema:'evercraft.saban.capacity-organism-cycle.v1',
      production_ready:receipt.production_ready,
      active_device_count:receipt.active_device_count,
      compute_offer_count:receipt.compute_offer_count,
      missing_capacity_count:receipt.missing_capacity.length,
      commercial_capacity_authorized:false,
      generated_at:receipt.generated_at,
    })+'\n');
  };

  await cycle();
  if(once)return;
  const timer=setInterval(()=>cycle().catch(error=>{
    process.stderr.write(JSON.stringify({
      schema:'evercraft.saban.capacity-organism-cycle-error.v1',
      error:error instanceof Error?error.message:String(error),
      commercial_capacity_authorized:false,
      observed_at:new Date().toISOString(),
    })+'\n');
  }),intervalMs);
  timer.unref?.();
  await new Promise(()=>{});
}

if(process.argv[1]&&path.resolve(process.argv[1])===MODULE_FILE){
  main().catch(error=>{
    process.stderr.write(JSON.stringify({
      ok:false,
      schema:'evercraft.saban.capacity-organism-error.v1',
      error:error instanceof Error?error.message:String(error),
      commercial_capacity_authorized:false,
    })+'\n');
    process.exitCode=1;
  });
}
