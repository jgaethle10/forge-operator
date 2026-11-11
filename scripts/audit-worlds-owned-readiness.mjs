// Evercraft Worlds: non-mutating external launch-readiness receipt.
// A source build or local WebGL2 test NEVER establishes a deployed HTTPS site.
import {checkWorldsOrigin,probeWorldsPublic} from './probe-worlds-public.mjs';
import {probeWorldsHeritagePublic} from './probe-worlds-heritage-public.mjs';
import {probeHiddenWorldPublic} from './probe-hidden-world-public.mjs';

export const READINESS_SCHEMA='evercraft.worlds.external-readiness.v1';
const names=['worlds','heritage','hidden_world'];
const unchecked=()=>Object.fromEntries(names.map(name=>[name,{verified:false,reason:'not_checked'}]));
export async function auditWorldsReadiness(rawOrigin,{
  probes={worlds:probeWorldsPublic,heritage:probeWorldsHeritagePublic,hidden_world:probeHiddenWorldPublic},
  observedAt=()=>new Date().toISOString()
}={}){
  const base={
    schema:READINESS_SCHEMA,
    observed_at_utc:observedAt(),
    read_only:true,
    verified:false,
    public_https_verified:false,
    physical_device_verified:false,
    customer_write_verified:false,
    systemia_mission_executed:false
  };
  if(!rawOrigin||!String(rawOrigin).trim())return {...base,status:'blocked_no_origin',
    reason:'owned_https_origin_not_configured',origin:null,checks:unchecked()};
  let origin;
  try{origin=checkWorldsOrigin(rawOrigin);}catch{return {...base,status:'blocked_invalid_origin',
    reason:'owned_https_origin_invalid',origin:null,checks:unchecked()};}
  const outcomes=await Promise.allSettled(names.map(n=>probes[n](origin)));
  const checks={};
  for(let i=0;i<names.length;i++){
    const result=outcomes[i],value=result.status==='fulfilled'?result.value:null;
    const ok=value?.verified===true&&value?.origin===origin;
    checks[names[i]]=ok?{verified:true}:{verified:false,reason:
      result.status==='rejected'?'probe_exception':value?.origin!==origin?'origin_mismatch':
      String(value?.reason||'probe_not_verified').slice(0,100)};
  }
  const verified=Object.values(checks).every(c=>c.verified===true);
  return {...base,origin,status:verified?'verified_readonly':'failed_external_check',
    verified,public_https_verified:verified,checks};
}

if(process.argv[1]?.endsWith('audit-worlds-owned-readiness.mjs')){
  const origin=process.argv[2]||process.env.WORLDS_ORIGIN||'';
  auditWorldsReadiness(origin).then(result=>{
    console.log(JSON.stringify(result,null,2));
    // A missing origin is an explicit BLOCKED receipt rather than a guessed
    // production hostname or a noisy scheduled CI failure.
    if(['failed_external_check','blocked_invalid_origin'].includes(result.status))process.exitCode=1;
  }).catch(err=>{
    console.error(JSON.stringify({schema:READINESS_SCHEMA,status:'audit_exception',
      verified:false,reason:String(err?.message||'error').slice(0,100)}));
    process.exitCode=1;
  });
}
