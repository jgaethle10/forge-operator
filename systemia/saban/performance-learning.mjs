import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function clean(v){return String(v??'').trim();}
function key(deviceId,workload){return clean(deviceId)+'|'+clean(workload);}
function clamp01(v,fallback=0){
  const n=Number(v);
  return Number.isFinite(n)?Math.max(0,Math.min(1,n)):fallback;
}
function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}
function quantile(values,q){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const index=Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*q)-1));
  return sorted[index];
}

export function createPerformanceLedger({created_at=new Date().toISOString()}={}){
  return {
    schema:'evercraft.saban.performance-ledger.v1',
    created_at,
    updated_at:created_at,
    profiles:{},
  };
}

export function recordPerformanceSample(ledger,{
  device_id,
  workload_class,
  ok,
  duration_ms,
  bytes_processed=null,
  checkpointed=false,
  preempted=false,
  thermal_hold=false,
  energy_wh=null,
  observed_at=new Date().toISOString(),
}={}){
  if(ledger?.schema!=='evercraft.saban.performance-ledger.v1'){
    throw new Error('saban_performance_ledger_required');
  }
  const device=clean(device_id);
  const workload=clean(workload_class);
  if(!device) throw new Error('performance_device_id_required');
  if(!workload) throw new Error('performance_workload_required');
  const duration=Math.max(0,Number(duration_ms||0));
  if(!Number.isFinite(duration)) throw new Error('performance_duration_invalid');

  const profileKey=key(device,workload);
  const prior=ledger.profiles[profileKey]||{
    device_id:device,
    workload_class:workload,
    samples:0,
    successes:0,
    failures:0,
    preemptions:0,
    checkpoints:0,
    thermal_holds:0,
    duration_ms_samples:[],
    bytes_samples:[],
    energy_wh_samples:[],
    first_observed_at:observed_at,
    last_observed_at:observed_at,
  };

  prior.samples+=1;
  if(ok===true) prior.successes+=1;
  else prior.failures+=1;
  if(preempted===true) prior.preemptions+=1;
  if(checkpointed===true) prior.checkpoints+=1;
  if(thermal_hold===true) prior.thermal_holds+=1;
  prior.duration_ms_samples.push(duration);
  prior.duration_ms_samples=prior.duration_ms_samples.slice(-100);
  if(bytes_processed!=null&&Number.isFinite(Number(bytes_processed))){
    prior.bytes_samples.push(Math.max(0,Number(bytes_processed)));
    prior.bytes_samples=prior.bytes_samples.slice(-100);
  }
  if(energy_wh!=null&&Number.isFinite(Number(energy_wh))){
    prior.energy_wh_samples.push(Math.max(0,Number(energy_wh)));
    prior.energy_wh_samples=prior.energy_wh_samples.slice(-100);
  }
  prior.last_observed_at=observed_at;

  const durations=prior.duration_ms_samples;
  const successRate=prior.samples?prior.successes/prior.samples:0;
  const reliabilityPrior=4;
  const reliability=(prior.successes+reliabilityPrior)/(prior.samples+reliabilityPrior+1);
  const totalBytes=prior.bytes_samples.reduce((a,b)=>a+b,0);
  const totalDurationForThroughput=prior.bytes_samples.length
    ? durations.slice(-prior.bytes_samples.length).reduce((a,b)=>a+b,0)
    : 0;
  const throughputBps=totalBytes>0&&totalDurationForThroughput>0
    ? totalBytes/(totalDurationForThroughput/1000)
    : null;
  const avgEnergy=prior.energy_wh_samples.length
    ? prior.energy_wh_samples.reduce((a,b)=>a+b,0)/prior.energy_wh_samples.length
    : null;

  prior.metrics={
    success_rate:Number(successRate.toFixed(6)),
    bayesian_reliability:Number(reliability.toFixed(6)),
    average_duration_ms:durations.length
      ? Math.round(durations.reduce((a,b)=>a+b,0)/durations.length)
      : null,
    p50_duration_ms:quantile(durations,0.50),
    p95_duration_ms:quantile(durations,0.95),
    throughput_bytes_per_second:throughputBps==null?null:Math.round(throughputBps),
    average_energy_wh:avgEnergy==null?null:Number(avgEnergy.toFixed(6)),
    preemption_rate:Number((prior.preemptions/prior.samples).toFixed(6)),
    thermal_hold_rate:Number((prior.thermal_holds/prior.samples).toFixed(6)),
    confidence:Number(Math.min(1,prior.samples/20).toFixed(6)),
  };
  prior.profile_hash=sha({
    device_id:device,
    workload_class:workload,
    samples:prior.samples,
    metrics:prior.metrics,
    last_observed_at:prior.last_observed_at,
  });
  ledger.profiles[profileKey]=prior;
  ledger.updated_at=observed_at;
  return structuredClone(prior);
}

export function performanceProfile(ledger,{device_id,workload_class,now=new Date(),max_age_ms=7*24*3600*1000}={}){
  if(ledger?.schema!=='evercraft.saban.performance-ledger.v1'){
    throw new Error('saban_performance_ledger_required');
  }
  const profile=ledger.profiles[key(device_id,workload_class)]||null;
  if(!profile)return null;
  const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));
  const age=Math.max(0,nowMs-(Date.parse(profile.last_observed_at)||0));
  return {
    ...structuredClone(profile),
    age_ms:age,
    fresh:age<=Math.max(1000,Number(max_age_ms||0)),
  };
}

export function rankPerformanceAdjustment(profile){
  if(!profile||profile.fresh!==true)return {score:0,reason:'no_fresh_profile'};
  const m=profile.metrics||{};
  const confidence=clamp01(m.confidence,0);
  const reliability=clamp01(m.bayesian_reliability,0.5);
  const preemption=clamp01(m.preemption_rate,0);
  const thermal=clamp01(m.thermal_hold_rate,0);
  const p95=Math.max(0,Number(m.p95_duration_ms||0));

  const reliabilityScore=(reliability-0.5)*1200*confidence;
  const stabilityPenalty=(preemption*600+thermal*1000)*confidence;
  const latencyPenalty=Math.min(800,Math.log10(Math.max(10,p95))*100)*confidence;
  return {
    score:Math.round(reliabilityScore-stabilityPenalty-latencyPenalty),
    reason:'observed_performance',
    confidence,
    reliability,
    p95_duration_ms:p95||null,
    average_energy_wh:m.average_energy_wh==null?null:Number(m.average_energy_wh),
    throughput_bytes_per_second:m.throughput_bytes_per_second==null?null:Number(m.throughput_bytes_per_second),
  };
}

export function savePerformanceLedger(file,ledger){
  if(ledger?.schema!=='evercraft.saban.performance-ledger.v1'){
    throw new Error('saban_performance_ledger_required');
  }
  atomicJson(path.resolve(file),ledger);
  return path.resolve(file);
}

export function loadPerformanceLedger(file){
  const target=path.resolve(file);
  if(!fs.existsSync(target)) return createPerformanceLedger();
  const parsed=JSON.parse(fs.readFileSync(target,'utf8'));
  if(parsed?.schema!=='evercraft.saban.performance-ledger.v1'||!parsed.profiles){
    throw new Error('saban_performance_ledger_invalid');
  }
  return parsed;
}
