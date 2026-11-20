#!/usr/bin/env node
// NextGen Wing Courier: guarded systemd USER resident bootstrap.
// Default is evidence-only dry run. Never provisions keys, TLS, network or customer work.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const safeArg=s=>{
 if(typeof s!=='string'||!s||/[\s%\u0000-\u001f\\;"'`$&|<>#]/.test(s))
  throw Error('wing_resident_unsafe_service_argument');
 return s;
};
function requiredFile(file,{secret=false}={}){
 if(typeof file!=='string'||!path.isAbsolute(file))throw Error('wing_resident_absolute_file_required');
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||(secret&&(st.mode&0o077)!==0)||
   (secret&&typeof process.getuid==='function'&&st.uid!==process.getuid()))
  throw Error('wing_resident_untrusted_private_file');
 return st;
}
function requiredDir(dir){
 if(typeof dir!=='string'||!path.isAbsolute(dir))throw Error('wing_resident_absolute_dir_required');
 const st=fs.lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
   (typeof process.getuid==='function'&&st.uid!==process.getuid()))
  throw Error('wing_resident_untrusted_private_directory');
}
export function evaluateWingResidentConfig({configPath,wingExpected='fallen'}={}){
 requiredFile(configPath,{secret:true});
 const cfg=JSON.parse(fs.readFileSync(configPath,'utf8'));
 if(cfg?.wing!==wingExpected||!['fallen','harbor'].includes(wingExpected))
  throw Error('wing_resident_scope_mismatch');
 const url=new URL(cfg.baseUrl);
 if(url.protocol!=='https:'||url.origin!=='https://fabric.systemiacommandcenters.com'||
   url.username||url.password||url.search||url.hash||
   url.pathname.replace(/\/+$/,'')!=='/api/internal/wing-courier')
   throw Error('wing_resident_requires_owned_https');
 for(const key of ['receiveTokenFile','receiverPrivateKeyFile','receiverSigningKeyFile'])
  requiredFile(cfg[key],{secret:true});
 requiredDir(cfg.destinationDir);
 const senders=cfg.senderVerifyPublicKeys||{};
 if(!Array.isArray(Object.keys(senders))||Object.keys(senders).length<1)
  throw Error('wing_resident_trusted_senders_missing');
 for(const [wing,file] of Object.entries(senders)){
  if(!/^[a-z][a-z0-9-]{1,47}$/.test(wing)||wing===cfg.wing)
   throw Error('wing_resident_invalid_sender_wing');
  requiredFile(file);
 }
 if(Boolean(cfg.intakeStateDir)!==Boolean(cfg.passportStateDir))
  throw Error('wing_resident_incomplete_systemia_intake');
 // Existing Intake Fabric/Passport may be prepared separately before activation.
 if(cfg.intakeStateDir){requiredDir(cfg.intakeStateDir);requiredDir(cfg.passportStateDir);}
 for(const k of ['baseUrl','receiveTokenFile','wing','destinationDir','receiverPrivateKeyFile',
  'receiverSigningKeyFile'])safeArg(String(cfg[k]));
 safeArg(configPath);
 return {
  schema:'evercraft.wing-courier.resident-install-preflight.v1',readyForLocalActivation:true,
  wing:cfg.wing,publicOrigin:url.origin,privateDestination:cfg.destinationDir,
  trustedSenderCount:Object.keys(senders).length,
  systemiaIngressConfigured:Boolean(cfg.intakeStateDir),
  liveHttpsVerified:false,remoteIdentityCryptographicallyVerified:false,
  customerBytesPresent:false,producerAssigned:false,customerReleaseAuthorized:false
 };
}
export function renderWingResidentUnit({nodeBin,sourceRoot,configPath}={}){
 for(const v of [nodeBin,sourceRoot,configPath])safeArg(v);
 return [
  '[Unit]','Description=Evercraft Systemia Wing Courier (private received packages)',
  'After=network-online.target','Wants=network-online.target','',
  '[Service]','Type=simple','WorkingDirectory='+sourceRoot,
  'ExecStart='+nodeBin+' '+sourceRoot+'/systemia/wing-courier/resident.mjs '+configPath,
  'Restart=on-failure','RestartSec=10','NoNewPrivileges=true','UMask=0077',
  'PrivateTmp=true','Environment=NODE_ENV=production','',
  '[Install]','WantedBy=default.target',''
 ].join('\n');
}
function ctl(...args){
 const p=spawnSync('systemctl',['--user',...args],{encoding:'utf8',timeout:10000});
 if(p.status!==0||p.error)throw Error('wing_resident_systemd_'+args[0]+'_failed');
}
export async function installWingResident({
 configPath,activate=false,confirmOwnedHost=false,home=os.homedir()
}={}){
 if(Number(process.versions.node.split('.')[0])<22)throw Error('wing_resident_node_22_required');
 if(typeof process.getuid==='function'&&process.getuid()===0)throw Error('wing_resident_root_forbidden');
 const pre=evaluateWingResidentConfig({configPath});
 if(!fs.existsSync(path.join(base,'systemia/wing-courier/resident.mjs')))
  throw Error('wing_resident_source_not_installed');
 if(!activate)return {...pre,mode:'DRY_RUN',unitInstalled:false};
 // Activation is an owner-local decision, never inferred from a CI or chat request.
 if(!confirmOwnedHost)throw Error('wing_resident_confirm_owned_host_required');
 const uid=typeof process.getuid==='function'?process.getuid():null;
 const homeStat=fs.lstatSync(home);
 if(!homeStat.isDirectory()||homeStat.isSymbolicLink()||
    (uid!==null&&homeStat.uid!==uid))
  throw Error('wing_resident_untrusted_home');
 // Do not create a service through a symlinked / redirected systemd directory.
 const serviceDirs=[path.join(home,'.config'),path.join(home,'.config/systemd'),
  path.join(home,'.config/systemd/user')];
 for(const dir of serviceDirs){
  let st;
  try{st=fs.lstatSync(dir)}
  catch(e){
   if(e?.code!=='ENOENT')throw e;
   fs.mkdirSync(dir,{mode:0o700});
   st=fs.lstatSync(dir);
  }
  if(!st.isDirectory()||st.isSymbolicLink()||(uid!==null&&st.uid!==uid))
   throw Error('wing_resident_untrusted_service_directory');
 }
 const unit=path.join(serviceDirs[2],'evercraft-wing-courier-fallen.service');
 // Never overwrite an existing user service or a dangling symlink.
 try{
  fs.lstatSync(unit);
  throw Error('wing_resident_existing_unit_requires_review');
 }catch(e){if(e?.code!=='ENOENT')throw e}
 const body=renderWingResidentUnit({nodeBin:process.execPath,sourceRoot:base,configPath});
 fs.writeFileSync(unit,body,{flag:'wx',mode:0o600});
 ctl('daemon-reload');ctl('enable','--now','evercraft-wing-courier-fallen.service');
 ctl('is-active','--quiet','evercraft-wing-courier-fallen.service');
 return {...pre,mode:'ACTIVATED_LOCAL_USER_SERVICE',unitInstalled:true,
  externalHttpsVerified:false,realHandoffProven:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const i=process.argv.indexOf('--config');
 const configPath=i>=0?process.argv[i+1]:null;
 installWingResident({configPath,activate:process.argv.includes('--activate'),
  confirmOwnedHost:process.argv.includes('--confirm-owned-host')})
  .then(r=>console.log(JSON.stringify(r)))
  .catch(e=>{console.error('HOLD:',e?.message||'resident_install_failed');process.exitCode=2});
}
