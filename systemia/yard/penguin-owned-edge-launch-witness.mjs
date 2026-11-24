#!/usr/bin/env node
/**
 * Read-only Evercraft-owned Caddy launch/source witness.
 *
 * Historical install-fabric-owned-edge.sh deliberately DISABLES caddy.service,
 * runs Caddy under evercraft-public-edge.service, and sets "admin off".
 * Consequently a GET /config/ audit is unavailable by design.
 *
 * Reads the current private Caddyfile in memory without printing it,
 * validates unit+process+listener identity, and compares source file mtime
 * with the running service start. It never claims that disk source is the
 * exact active in-memory config or that external routes are absent.
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const UNIT='evercraft-public-edge.service';
const SOURCE='/etc/evercraft/Caddyfile';
const MAX_SOURCE=1024*1024;
const MAX_SOCKETS=2*1024*1024;

function prop(name){
  return execFileSync('systemctl',['show',UNIT,'--value','-p',name],{
    encoding:'utf8',timeout:5000,maxBuffer:4096,
    stdio:['ignore','pipe','ignore'],
  }).trim();
}
function hasPidOwnedSocket({sockets='',pid,port}={}){
  if(!Number.isSafeInteger(pid)||pid<1||typeof sockets!=='string'||
     sockets.length>MAX_SOCKETS)return false;
  const pidRe=new RegExp('(?:^|[^0-9])pid='+pid+'(?:,|\\))');
  return sockets.split(/\r?\n/).some(line=>
    /^\s*LISTEN\b/.test(line)&&pidRe.test(line)&&
    new RegExp(':'+port+'\\s').test(line)
  );
}
function explicitConfig(args){
  if(!Array.isArray(args)||args.length<5)return false;
  const executable=path.basename(args[0]||'');
  const flag=args.indexOf('--config');
  const adapter=args.indexOf('--adapter');
  return executable==='caddy'&&args[1]==='run'&&
    flag>=2&&args[flag+1]===SOURCE&&
    adapter>=2&&args[adapter+1]==='caddyfile';
}
function referencesPort(text,port){
  if(typeof text!=='string'||text.length>MAX_SOURCE)return null;
  return new RegExp('(^|[^0-9])'+port+'($|[^0-9])').test(text);
}
export function evaluateOwnedEdgeLaunch({
  unit,cmdline=[],exe='',sockets='',sourceText,
  sourceRegular=false,sourceMtimeMs=null,startMs=null,
  pidStable=false,brokerPort=8797,
}={}){
  const holds=[];
  const pid=unit?.pid;
  if(unit?.active!=='active'||unit?.enabled!=='enabled'||
     unit?.user!=='caddy'||!Number.isSafeInteger(pid)||pid<1)
    holds.push('evercraft_public_edge_unit_not_verified');
  if(pidStable!==true)holds.push('edge_process_changed_during_observation');
  const processIdentity=explicitConfig(cmdline)&&
    (exe==='/usr/bin/caddy'||exe==='/usr/local/bin/caddy');
  if(!processIdentity)holds.push('caddy_process_config_not_verified');
  const ownerVerified=hasPidOwnedSocket({sockets,pid,port:8443})||
    hasPidOwnedSocket({sockets,pid,port:18080});
  if(!ownerVerified)holds.push('public_edge_listener_not_pid_owned');
  if(sourceRegular!==true||typeof sourceText!=='string'||
     sourceText.length>MAX_SOURCE)
    holds.push('caddy_source_unavailable_or_unsafe');
  const sourceOlder=Number.isFinite(startMs)&&startMs>0&&
    Number.isFinite(sourceMtimeMs)&&sourceMtimeMs>0&&
    sourceMtimeMs<=startMs;
  if(!sourceOlder)holds.push('caddy_source_may_have_changed_after_launch');
  const adminOff=typeof sourceText==='string'&&
    /^\s*admin\s+off(?:\s*(?:#.*)?)?$/m.test(sourceText);
  const hasImport=typeof sourceText==='string'&&
    /^\s*import\s+\S+/m.test(sourceText);
  const candidatePresent=referencesPort(sourceText,brokerPort);
  if(candidatePresent!==false)holds.push('candidate_broker_port_in_source_or_unverified');
  return {
    schema:'evercraft.penguin.owned-edge-launch-source-witness.v1',
    source_observed:holds.length===0,
    hold_reasons:holds,
    serving_unit:UNIT,
    default_caddy_unit_required:false,
    caddy_process_source_path_verified:processIdentity,
    caddy_listener_pid_owned:ownerVerified,
    caddy_source_predates_running_process:sourceOlder,
    admin_off_in_source:adminOff,
    import_directive_in_source:hasImport,
    historical_broker_port_referenced_in_source:candidatePresent,
    scanned_port:brokerPort,
    active_caddy_config_attested:false,
    no_proxy_or_tunnel_assertion:false,
    route_absence_proven:false,
    historical_authority_absence_proven:false,
    public_route_created:null,
    physical_broker_activation_authorized:false,
    services_changed:false,
    config_contents_printed:false,
    process_cmdline_printed:false,
  };
}
export function inspectOwnedEdgeLaunch(){
  if(process.getuid?.()!==0)
    throw Error('root_required_for_owned_edge_pid_audit');
  const pid=Number(prop('MainPID'));
  const unit={
    pid,active:prop('ActiveState'),enabled:prop('UnitFileState'),
    user:prop('User'),
  };
  if(!Number.isSafeInteger(pid)||pid<1)
    throw Error('owned_edge_main_pid_unverified');
  const startText=prop('ExecMainStartTimestamp');
  const startMs=Date.parse(startText);
  const cmdline=fs.readFileSync('/proc/'+pid+'/cmdline','utf8')
    .split('\0').filter(Boolean);
  const exe=fs.readlinkSync('/proc/'+pid+'/exe');
  const stat=fs.lstatSync(SOURCE);
  const sourceRegular=stat.isFile()&&!stat.isSymbolicLink()&&
    stat.nlink===1&&stat.size>0&&stat.size<=MAX_SOURCE;
  if(!sourceRegular)throw Error('caddy_source_not_regular');
  const sourceText=fs.readFileSync(SOURCE,'utf8');
  if(Buffer.byteLength(sourceText)>MAX_SOURCE)
    throw Error('caddy_source_too_large');
  const sockets=execFileSync('ss',['-H','-ltnp'],{
    encoding:'utf8',timeout:5000,maxBuffer:MAX_SOCKETS,
    stdio:['ignore','pipe','ignore'],
  });
  const statAfter=fs.lstatSync(SOURCE);
  const sourceStable=statAfter.isFile()&&!statAfter.isSymbolicLink()&&
    statAfter.ino===stat.ino&&statAfter.size===stat.size&&
    statAfter.mtimeMs===stat.mtimeMs;
  const pidStable=Number(prop('MainPID'))===pid&&
    prop('ActiveState')==='active'&&sourceStable;
  return evaluateOwnedEdgeLaunch({
    unit,cmdline,exe,sockets,sourceText,
    sourceRegular:sourceRegular&&sourceStable,
    sourceMtimeMs:stat.mtimeMs,startMs,pidStable,
  });
}
const direct=process.argv[1]&&
  path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  if(process.argv.length!==2){
    console.error(JSON.stringify({
      source_observed:false,
      hold_reasons:['read_only_no_argument_usage_only'],
      physical_broker_activation_authorized:false,
    }));
    process.exitCode=3;
  }else{
    try{
      const result=inspectOwnedEdgeLaunch();
      console.log(JSON.stringify(result,null,2));
      if(!result.source_observed)process.exitCode=3;
    }catch(error){
      const allowed=[
        'root_required_for_owned_edge_pid_audit',
        'owned_edge_main_pid_unverified',
        'caddy_source_not_regular',
        'caddy_source_too_large',
      ];
      console.error(JSON.stringify({
        schema:'evercraft.penguin.owned-edge-launch-source-witness.v1',
        source_observed:false,
        hold_reasons:[allowed.includes(error?.message)?
          error.message:'owned_edge_observation_unverified'],
        active_caddy_config_attested:false,
        route_absence_proven:false,
        physical_broker_activation_authorized:false,
        services_changed:false,
      }));
      process.exitCode=3;
    }
  }
}
