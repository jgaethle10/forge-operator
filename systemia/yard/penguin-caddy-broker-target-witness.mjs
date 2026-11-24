#!/usr/bin/env node
/**
 * Read-only local Caddy admin-config witness for a potential broker endpoint.
 *
 * Caddy admin exposes the active Caddy JSON config (not just a file on disk).
 * This sensor never prints or persists that config. Only GET /config/ is used.
 *
 * SCOPE: Detect an explicit direct route to the nominated broker port in the
 * locally observed Caddy JSON. NOT a proof that no upstream proxy, dynamic
 * handler, external tunnel, router NAT, service mesh, or provider route exists.
 * This witness NEVER sets public_route_created=false.
 */
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';

const ADMIN_PORT=2019;
const MAX_CONFIG=4*1024*1024;
const MAX_SS=1024*1024;
function integer(n){return Number.isSafeInteger(n)&&n>0&&n<=65535}
function loopbackAdminOwner({ss,pid}={}){
  if(typeof ss!=='string'||ss.length>MAX_SS||
     !Number.isSafeInteger(pid)||pid<=0)return false;
  const pidRegex=new RegExp('(?:^|[^0-9])pid='+pid+'(?:,|\\))');
  const matching=ss.split(/\r?\n/).filter(line=>
    /^\s*LISTEN\s/.test(line)&&
    /\s127\.0\.0\.1:2019\s/.test(line));
  return matching.length===1&&pidRegex.test(matching[0]);
}
function iterStrings(value,{maxNodes=60000}={}){
  let nodes=0;
  const result=[];
  const stack=[value];
  while(stack.length){
    nodes+=1;
    if(nodes>maxNodes)throw Error('caddy_config_structure_too_large');
    const next=stack.pop();
    if(typeof next==='string'){result.push(next);continue}
    if(!next||typeof next!=='object')continue;
    if(Array.isArray(next))stack.push(...next);
    else stack.push(...Object.values(next));
  }
  return result;
}
/**
 * Pure classification of a trusted active JSON config.
 * Broad port matches intentionally produce false positives rather than
 * inventing a route-free status when plugins or custom handlers are unknown.
 */
export function evaluateCaddyBrokerTarget({
  config,brokerPort,adminOwnerVerified=false,configStable=false,
}={}){
  const holds=[];
  let suspectedTarget=false;
  let strings=0;
  if(!integer(brokerPort)||[80,443,1053,2019,42420].includes(brokerPort))
    holds.push('candidate_broker_port_invalid');
  if(adminOwnerVerified!==true||configStable!==true)
    holds.push('caddy_live_config_authority_unverified');
  if(!config||typeof config!=='object'||Array.isArray(config))
    holds.push('caddy_active_config_invalid');
  if(holds.length===0){
    try{
      const values=iterStrings(config);
      strings=values.length;
      // Includes dial: "localhost:NNNN", dynamic module values, URL,
      // rewrites, route headers, and any JSON string naming this port.
      // Exact numeric boundaries prevent partial port matches.
      const re=new RegExp('(^|[^0-9])'+brokerPort+'($|[^0-9])');
      suspectedTarget=values.some(v=>re.test(v));
      if(suspectedTarget)holds.push('candidate_port_present_in_active_caddy_config');
    }catch{holds.push('caddy_config_structure_unverified')}
  }
  return {
    schema:'evercraft.penguin.caddy-broker-target-witness.v1',
    observed:holds.length===0,
    hold_reasons:holds,
    caddy_admin_pid_owner_verified:adminOwnerVerified===true,
    active_config_stable:configStable===true,
    candidate_port_suspected_in_caddy:suspectedTarget,
    strings_inspected:strings,
    source_config_printed:false,
    source_config_persisted:false,
    tokens_or_credentials_printed:false,
    external_tunnel_or_nat_observed:false,
    external_route_absence_proven:false,
    historical_grants_absence_proven:false,
    public_route_created:null,
    physical_broker_activation_authorized:false,
    services_changed:false,
  };
}
async function activeConfig(){
  const response=await fetch('http://127.0.0.1:'+ADMIN_PORT+'/config/',{
    method:'GET',
    redirect:'error',
    headers:{accept:'application/json'},
    signal:AbortSignal.timeout(3000),
  });
  if(!response.ok)throw Error('caddy_admin_config_not_available');
  const declared=Number(response.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>MAX_CONFIG)
    throw Error('caddy_config_too_large');
  const reader=response.body?.getReader();
  if(!reader)throw Error('caddy_admin_body_missing');
  const chunks=[];let size=0;
  try{
    for(;;){
      const next=await reader.read();
      if(next.done)break;
      size+=next.value.byteLength;
      if(size>MAX_CONFIG)throw Error('caddy_config_too_large');
      chunks.push(next.value);
    }
  }finally{reader.releaseLock()}
  const data=Buffer.concat(chunks).toString('utf8');
  const config=JSON.parse(data);
  if(!config||typeof config!=='object'||Array.isArray(config))
    throw Error('caddy_config_not_json_object');
  const sha=createHash('sha256').update(data).digest('hex');
  return {config,sha};
}
function mainPid(){
  const str=execFileSync('systemctl',[
    'show','caddy.service','-p','MainPID','--value',
  ],{encoding:'utf8',timeout:3000,stdio:['ignore','pipe','ignore']}).trim();
  const pid=Number(str);
  if(!Number.isSafeInteger(pid)||pid<1)throw Error('caddy_main_pid_unverified');
  return pid;
}
function socketOwner(pid){
  const ss=execFileSync('ss',['-H','-ltnp'],{
    encoding:'utf8',maxBuffer:MAX_SS,timeout:3000,
    stdio:['ignore','pipe','ignore'],
  });
  return loopbackAdminOwner({ss,pid});
}
export async function observeCaddyBrokerTarget({brokerPort}={}){
  if(process.getuid?.()!==0)throw Error('root_required_for_caddy_pid_audit');
  if(!integer(brokerPort))throw Error('candidate_port_invalid');
  const pidBefore=mainPid();
  if(!socketOwner(pidBefore))throw Error('caddy_admin_socket_not_owned_by_systemd');
  const before=await activeConfig();
  const after=await activeConfig();
  const pidAfter=mainPid();
  const owned=pidBefore===pidAfter&&socketOwner(pidAfter);
  return evaluateCaddyBrokerTarget({
    config:after.config,brokerPort,
    adminOwnerVerified:owned,
    configStable:before.sha===after.sha,
  });
}

const direct=process.argv[1]&&
  path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  // Baseline diagnostic only: historical broker's known reserved 8797 port.
  // This is NOT proof about an unknown future ephemeral broker port.
  if(process.argv.length!==3||process.argv[2]!=='--historical-port'){
    console.error(JSON.stringify({
      observed:false,reason:'only_read_only_historical_port_cli_supported',
      physical_broker_activation_authorized:false,
    }));
    process.exitCode=3;
  }else{
    observeCaddyBrokerTarget({brokerPort:8797}).then(result=>{
      console.log(JSON.stringify({...result,
        selected_port_scope:'historical_8797_only',
        future_ephemeral_port_checked:false,
      },null,2));
      if(!result.observed)process.exitCode=3;
    }).catch(error=>{
      console.error(JSON.stringify({
        schema:'evercraft.penguin.caddy-broker-target-witness.v1',
        observed:false,
        hold_reasons:[String(error?.message||'caddy_observation_failed')
          .slice(0,100)],
        external_route_absence_proven:false,
        future_ephemeral_port_checked:false,
        source_config_printed:false,
        physical_broker_activation_authorized:false,
        services_changed:false,
      }));
      process.exitCode=3;
    });
  }
}

export {loopbackAdminOwner};
