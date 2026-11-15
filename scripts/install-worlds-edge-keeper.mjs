// Opt-in Worlds-specific renewable edge keeper, systemd user units. DRY RUN by default.
// No public deployment from CI. Does NOT touch DNS, shared Caddy, firewall or Fabric leases.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectWorldsEdge,checkedLoopbackUrl} from '../systemia/worlds/worlds-edge-route.mjs';
import {checkWorldsOrigin} from './probe-worlds-public.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const project=path.resolve(here,'..');
const argv=process.argv.slice(2);
const option=name=>{const i=argv.indexOf('--'+name);return i<0?'':argv[i+1]||'';};
const activation=argv.includes('--activate');
const publicOrigin=option('public-origin');
const edgeControl=option('edge-control')||'http://127.0.0.1:18081';
const vault=option('vault')||'http://127.0.0.1:8788';
const deploymentInstance=option('deployment-instance');
const deploymentReceiptHash=option('deployment-receipt-hash');
const unitDir=path.join(process.env.XDG_CONFIG_HOME||path.join(os.homedir(),'.config'),'systemd/user');
const secretDir=path.join(process.env.XDG_CONFIG_HOME||path.join(os.homedir(),'.config'),'evercraft');
const secretFile=path.join(secretDir,'worlds-edge-auth.env');
function safe(value){
 if(!value||/[\s%\u0000-\u001f\\;"'`$&|<>#]/.test(value))throw Error('worlds_keeper_unsafe_service_argument');
 return String(value);
}
export function renderWorldsKeeperUnits({node,repo,origin,control,vaultOrigin,instance,receipt,secretPath='' }={}){
 for(const v of [node,repo,origin,control,vaultOrigin,instance,receipt])safe(v);
 const start=[node,repo+'/scripts/route-worlds-owned-edge.mjs','--reconcile',
  '--public-origin',origin,'--edge-control',control,'--vault',vaultOrigin,
  '--deployment-instance',instance,'--deployment-receipt-hash',receipt].join(' ');
 const service=[
  '[Unit]','Description=Evercraft Worlds owned-edge lease renewal',
  'After=network-online.target','Wants=network-online.target','',
  '[Service]','Type=oneshot','WorkingDirectory='+repo,
  'ExecStart='+start,
  ...(secretPath?['EnvironmentFile='+safe(secretPath)]:[]),
  'NoNewPrivileges=true','PrivateTmp=true','UMask=0077',''
 ].join('\n');
 const timer=['[Unit]','Description=Renew Worlds owned-edge lease every 15 minutes','',
 '[Timer]','OnBootSec=30s','OnUnitActiveSec=15min','Persistent=true',
 'Unit=evercraft-worlds-edge-keeper.service','',
 '[Install]','WantedBy=timers.target',''].join('\n');
 return {service,timer};
}
function systemctl(...args){
 const result=spawnSync('systemctl',args,{encoding:'utf8',timeout:10000});
 if(result.error||result.status!==0)throw Error('worlds_keeper_systemctl_failed:'+args.join(' '));
}
async function atomicFile(file,body,mode){
 const temp=file+'.'+process.pid+'.tmp';
 try{await fs.writeFile(temp,body,{mode,flag:'wx'});await fs.rename(temp,file);}
 finally{await fs.rm(temp,{force:true}).catch(()=>{});}
}
async function main(){
 const origin=checkWorldsOrigin(publicOrigin);
 checkedLoopbackUrl(edgeControl);checkedLoopbackUrl(vault);
 const token=process.env.EVERCRAFT_EDGE_CONTROL_TOKEN||'';
 if(token&&(!/^[\x21-\x7e]{16,512}$/.test(token)||/["\\]/.test(token)))throw Error('worlds_keeper_token_format_invalid');
 if(Number(process.versions.node.split('.')[0])<22)throw Error('worlds_keeper_node_22_required');
 const inspected=await inspectWorldsEdge({edgeControlUrl:edgeControl,vaultUrl:vault,publicOrigin:origin,controlToken:token});
 const render=renderWorldsKeeperUnits({
  node:process.execPath,repo:project,origin,control:edgeControl,vaultOrigin:vault,
  instance:deploymentInstance,receipt:deploymentReceiptHash,secretPath:token?secretFile:''
 });
 if(!activation){
  console.log(JSON.stringify({status:'dry_run',ready:inspected.ready,proof_only:false,
   interval_minutes:15,units_will_install:false,public_edge_modified:false,origin}));
  return;
 }
 if(typeof process.getuid==='function'&&process.getuid()===0)throw Error('worlds_keeper_not_root');
 await fs.mkdir(unitDir,{recursive:true,mode:0o700});
 if(token){
  await fs.mkdir(secretDir,{recursive:true,mode:0o700});
  await atomicFile(secretFile,'EVERCRAFT_EDGE_CONTROL_TOKEN="'+token+'"\n',0o600);
 }
 await atomicFile(path.join(unitDir,'evercraft-worlds-edge-keeper.service'),render.service,0o600);
 await atomicFile(path.join(unitDir,'evercraft-worlds-edge-keeper.timer'),render.timer,0o600);
 systemctl('--user','daemon-reload');
 systemctl('--user','enable','--now','evercraft-worlds-edge-keeper.timer');
 console.log(JSON.stringify({status:'timer_installed',interval_minutes:15,service_bound_to:'worlds',
  public_edge_modified:false,external_https_verified:false}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(e=>{console.error('HOLD:',e.message);process.exitCode=1;});
}
