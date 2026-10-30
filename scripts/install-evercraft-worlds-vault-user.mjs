// Opt-in systemd USER installer for the Evercraft Worlds vault. Dry-run by default.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkWorldsOrigin} from './probe-worlds-public.mjs';
const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const flag=name=>{const n=args.indexOf('--'+name);return n<0?'':args[n+1]||'';};
const activate=args.includes('--activate'),origin=flag('public-origin');
const port=Number(flag('port')||8788);
const stateRoot=path.join(process.env.XDG_STATE_HOME||path.join(os.homedir(),'.local/state'),'evercraft/worlds-vault');
const unitDir=path.join(process.env.XDG_CONFIG_HOME||path.join(os.homedir(),'.config'),'systemd/user');
const unitFile=path.join(unitDir,'evercraft-worlds-vault.service');
function assertSafe(value){
 if(/[\s%\u0000-\u001f\\]/.test(value))throw Error('worlds_service_path_unsupported');
}
function command(...args){
 const r=spawnSync('systemctl',args,{encoding:'utf8',timeout:10000});
 if(r.error||r.status!==0)throw Error('systemctl_failed:'+args.join(' ')+':'+String(r.stderr||r.error?.message||'').slice(0,140));
}
async function main(){
 const safeOrigin=checkWorldsOrigin(origin);
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('worlds_service_port_invalid');
 if(Number(process.versions.node.split('.')[0])<22)throw Error('worlds_requires_node_22');
 await fs.access(path.join(repoRoot,'systemia/worlds/worlds-vault-runtime.mjs'));
 await fs.access(path.join(repoRoot,'public/worlds/index.html'));
 for(const value of [process.execPath,repoRoot,stateRoot,unitDir,safeOrigin])assertSafe(value);
 console.log(JSON.stringify({mode:activate?'activate':'dry_run',runtime:'owned_systemd_user_vault',port,origin:safeOrigin,state_root:stateRoot,public_edge_modified:false}));
 if(!activate)return;
 if(typeof process.getuid==='function'&&process.getuid()===0)throw Error('worlds_service_do_not_run_as_root');
 await fs.mkdir(stateRoot,{recursive:true,mode:0o700});
 await fs.mkdir(unitDir,{recursive:true,mode:0o700});
 const unit=['[Unit]','Description=Evercraft Worlds private vault','After=network.target','','[Service]','Type=simple',
  'WorkingDirectory='+repoRoot,
  'ExecStart='+[process.execPath,path.join(repoRoot,'systemia/worlds/worlds-vault-runtime.mjs'),'--host','127.0.0.1','--port',String(port),'--public-root',path.join(repoRoot,'public'),'--data-root',stateRoot,'--public-origin',safeOrigin].join(' '),
  'Restart=on-failure','RestartSec=5','UMask=0077','NoNewPrivileges=true','PrivateTmp=true','Environment=NODE_ENV=production','','[Install]','WantedBy=default.target',''].join('\n');
 const temp=unitFile+'.'+process.pid+'.tmp';
 try{await fs.writeFile(temp,unit,{mode:0o600,flag:'wx'});await fs.rename(temp,unitFile);}
 finally{await fs.rm(temp,{force:true}).catch(()=>{});}
 command('--user','daemon-reload');
 command('--user','enable','--now','evercraft-worlds-vault.service');
 const health=await fetch('http://127.0.0.1:'+port+'/worlds/api/health',{signal:AbortSignal.timeout(5000)});
 const payload=await health.json();
 if(!health.ok||payload.schema!=='evercraft.worlds.vault.v1'||payload.ok!==true)throw Error('worlds_local_health_not_verified');
 console.log('LOCAL VAULT VERIFIED. Public DNS, HTTPS and cross-device access are NOT verified.');
}
main().catch(e=>{console.error('HOLD:',e.message);process.exitCode=1;});
