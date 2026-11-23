#!/usr/bin/env node
// Operator-only Systemia Relay -> Commercial Studio binding.
// Default --check is read-only. --apply requires root and an already-claimed
// Evercraft Home principal. No customer lead is created or message dispatched.
// Secrets are never printed, put on CLI arguments, or written in the repo.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const HOME_ENV='/etc/evercraft/home.env';
const RELAY_ENV='/etc/evercraft/notification-fabric.env';
const FABRIC_ENV='/etc/evercraft/fabric.env';
const STUDIO_ENV='/etc/evercraft/studio-relay.env';
const DROP_DIR='/etc/systemd/system/evercraft-fabric.service.d';
const DROP_IN=path.join(DROP_DIR,'40-studio-relay.conf');
const FABRIC_SERVICE='evercraft-fabric.service';
const RELAY_SERVICE='evercraft-notification-fabric.service';
const LOCAL_RELAY='http://127.0.0.1:3921';
const FABRIC_HEALTH='http://127.0.0.1:8787/health';
const HOME_HEALTH='http://127.0.0.1:4310/api/health';

export function parsePrivateEnv(input){
  const values=new Map();
  for(const line of String(input).split('\n')){
    if(!line.trim()||/^\s*#/.test(line))continue;
    const ix=line.indexOf('=');
    if(ix<1)throw Error('PRIVATE_ENV_FORMAT_HOLD');
    const key=line.slice(0,ix),value=line.slice(ix+1);
    if(!/^[A-Z][A-Z0-9_]*$/.test(key)||values.has(key)||
       /[\r\n]/.test(value))throw Error('PRIVATE_ENV_FORMAT_HOLD');
    values.set(key,value);
  }
  return values;
}
export function expectedBinding({claim,home,relay,fabric}){
  const principal=String(claim?.subject_ref||'');
  if(claim?.schema!=='evercraft.home.owner-claim.v1'||
     !/^[A-Za-z0-9][A-Za-z0-9_.:-]{1,127}$/.test(principal)||
     home.get('EVERCRAFT_OWNER_SUBJECT_REF')!==principal)
    throw Error('HOME_OWNER_IDENTITY_NOT_VERIFIED');
  const base=relay.get('EVERCRAFT_NOTIFICATION_BASE_URL');
  const token=relay.get('EVERCRAFT_NOTIFICATION_INGEST_TOKEN');
  if(base!==LOCAL_RELAY||!/^[-_A-Za-z0-9]{40,256}$/.test(token||''))
    throw Error('PRIVATE_RELAY_AUTH_NOT_VERIFIED');
  for(const key of [
    'EVERCRAFT_STUDIO_RELAY_OWNER_PRINCIPAL',
    'EVERCRAFT_NOTIFICATION_BASE_URL',
    'EVERCRAFT_NOTIFICATION_INGEST_TOKEN'
  ]){
    if(fabric.has(key))throw Error('FABRIC_LEGACY_RELAY_CONFIG_REQUIRES_REVIEW');
  }
  return {principal,base,token};
}
export function renderBinding(binding){
  for(const value of [binding.principal,binding.base,binding.token])
    if(!/^[A-Za-z0-9_.:/-]+$/.test(value))throw Error('BINDING_VALUE_UNSAFE');
  return [
    'EVERCRAFT_STUDIO_RELAY_OWNER_PRINCIPAL='+binding.principal,
    'EVERCRAFT_NOTIFICATION_BASE_URL='+binding.base,
    'EVERCRAFT_NOTIFICATION_INGEST_TOKEN='+binding.token,
    ''
  ].join('\n');
}
export const dropInText='[Service]\nEnvironmentFile='+STUDIO_ENV+'\n';

function safeFile(filename,uid=0,maximumMode=0o600){
  const stat=fs.lstatSync(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||
     stat.uid!==uid||((stat.mode&0o777)&~maximumMode)!==0)
    throw Error('UNSAFE_PRIVATE_CONFIGURATION_HOLD');
  return fs.readFileSync(filename,'utf8');
}
function existsIncludingSymlink(p){
  try{fs.lstatSync(p);return true}
  catch(e){if(e?.code==='ENOENT')return false;throw e}
}
function run(name,args){
  return execFileSync(name,args,{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim();
}
function serviceValue(name,property){
  return run('systemctl',['show',name,'-p',property,'--value']);
}
function parseProcessEnv(buffer){
  const out=new Map();
  for(const row of buffer.split('\0')){
    const ix=row.indexOf('=');
    if(ix>0)out.set(row.slice(0,ix),row.slice(ix+1));
  }
  return out;
}
function sameSecret(a,b){
  if(!a||!b)return false;
  const aa=Buffer.from(a),bb=Buffer.from(b);
  return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);
}
async function getJson(url,options={}){
  const res=await fetch(url,{...options,signal:AbortSignal.timeout(5000),redirect:'error'});
  if(!res.ok)throw Error('PRIVATE_ENDPOINT_UNHEALTHY');
  return res.json();
}
async function prereqs(){
  if(serviceValue(FABRIC_SERVICE,'ActiveState')!=='active'||
     serviceValue(RELAY_SERVICE,'ActiveState')!=='active'||
     serviceValue('evercraft-home.service','ActiveState')!=='active')
    throw Error('REQUIRED_OWNED_SERVICE_INACTIVE');
  if(serviceValue('evercraft-fabric-update.service','ActiveState')==='active')
    throw Error('FABRIC_UPDATER_BUSY_HOLD');
  const fabricUser=serviceValue(FABRIC_SERVICE,'User');
  const relayUser=serviceValue(RELAY_SERVICE,'User');
  if(!fabricUser||fabricUser==='root'||fabricUser!==relayUser)
    throw Error('OWNED_SERVICE_IDENTITY_MISMATCH');
  const claim=JSON.parse(fs.readFileSync(
    path.join(REPO,'systemia/evercraft-home/owner-claim.json'),'utf8'));
  const home=parsePrivateEnv(safeFile(HOME_ENV));
  const relay=parsePrivateEnv(safeFile(RELAY_ENV));
  const fabric=parsePrivateEnv(safeFile(FABRIC_ENV));
  const binding=expectedBinding({claim,home,relay,fabric});
  const h=await getJson(HOME_HEALTH);
  if(h.ok!==true||h.auth_mode!=='passport'||h.owner_bootstrapped!==true)
    throw Error('HOME_OWNER_NOT_BOOTSTRAPPED');
  const rh=await getJson(LOCAL_RELAY+'/api/notifications/health');
  if(rh.success!==true)throw Error('PRIVATE_RELAY_HEALTH_HOLD');
  const metrics=await getJson(LOCAL_RELAY+'/api/notifications/metrics',{
    headers:{authorization:'Bearer '+binding.token}
  });
  if(metrics.success!==true||metrics.ledger?.valid!==true)
    throw Error('PRIVATE_RELAY_LEDGER_HOLD');
  const f=await getJson(FABRIC_HEALTH);
  if(f.ok!==true||!f.source_release_ref)
    throw Error('FABRIC_HEALTH_HOLD');
  return {binding,release:f.source_release_ref,capabilities:f.capability_count};
}
async function awaitFabric(release,capabilities,expectedBindingValue){
  for(let attempt=0;attempt<30;attempt++){
    try{
      if(serviceValue(FABRIC_SERVICE,'ActiveState')!=='active')throw Error('service_inactive');
      const h=await getJson(FABRIC_HEALTH);
      if(h.ok!==true||h.source_release_ref!==release||
         h.capability_count!==capabilities)throw Error('release_drift');
      if(expectedBindingValue){
        const pid=Number(serviceValue(FABRIC_SERVICE,'MainPID'));
        if(!Number.isSafeInteger(pid)||pid<1)throw Error('missing_pid');
        const actual=parseProcessEnv(
          fs.readFileSync('/proc/'+pid+'/environ','utf8'));
        if(actual.get('EVERCRAFT_STUDIO_RELAY_OWNER_PRINCIPAL')!==expectedBindingValue.principal||
           actual.get('EVERCRAFT_NOTIFICATION_BASE_URL')!==expectedBindingValue.base||
           !sameSecret(actual.get('EVERCRAFT_NOTIFICATION_INGEST_TOKEN'),expectedBindingValue.token))
           throw Error('configuration_not_loaded');
      }
      return true;
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  return false;
}
function putPrivate(filename,text,mode){
  const fd=fs.openSync(filename,'wx',mode);
  try{fs.writeFileSync(fd,text,'utf8');fs.fchmodSync(fd,mode);fs.fchownSync(fd,0,0)}
  catch(error){fs.closeSync(fd);fs.unlinkSync(filename);throw error}
  fs.closeSync(fd);
}
function status(data){
  console.log(JSON.stringify({
    schema:'evercraft.studio.private-relay-binding.v1',
    ...data,
    secret_values_exposed:false,
    buyer_submissions_created:0,
    direct_notification_intents_sent_by_setup:0,
    background_dispatchers_may_send_existing_legitimate_alerts:true,
    payments_initiated:false
  },null,2));
}
export async function main(args=process.argv.slice(2)){
  const mode=args.length===0||args.length===1&&args[0]==='--check'?'check':
    args.length===1&&args[0]==='--apply'?'apply':null;
  if(!mode)throw Error('USAGE_CHECK_OR_APPLY');
  if(process.getuid?.()!==0)throw Error('ROOT_REQUIRED_FOR_PRIVATE_CONFIG_INSPECTION');
  const p=await prereqs();
  const presentEnv=existsIncludingSymlink(STUDIO_ENV);
  const presentDrop=existsIncludingSymlink(DROP_IN);
  if(presentEnv!==presentDrop)
    throw Error('PARTIAL_STUDIO_RELAY_CONFIGURATION_REQUIRES_REVIEW');
  if(mode==='check'){
    let configured=false;
    if(presentEnv){
      if(safeFile(STUDIO_ENV)!==renderBinding(p.binding)||
         safeFile(DROP_IN,0,0o644)!==dropInText)
         throw Error('EXISTING_BINDING_MISMATCH_HOLD');
      configured=await awaitFabric(p.release,p.capabilities,p.binding);
    }
    status({state:configured?'CONFIGURED_RUNTIME_VERIFIED':'READY_FOR_PRIVATE_APPLY',
      owner_identity_verified:true,relay_authenticated:true,private_relay_healthy:true,
      relay_ledger_valid:true,fabric_healthy:true,
      studio_binding_present:configured,
      source_release_ref:p.release});
    return;
  }
  if(presentEnv||presentDrop)throw Error('EXISTING_BINDING_NO_OVERWRITE');
  if(existsIncludingSymlink(DROP_DIR)){
    const st=fs.lstatSync(DROP_DIR);
    if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==0)
      throw Error('UNSAFE_SYSTEMD_DROPIN_DIR');
  }else{
    fs.mkdirSync(DROP_DIR,{mode:0o755});
  }
  let envCreated=false,dropCreated=false;
  try{
    putPrivate(STUDIO_ENV,renderBinding(p.binding),0o600);
    envCreated=true;
    putPrivate(DROP_IN,dropInText,0o644);
    dropCreated=true;
    run('systemctl',['daemon-reload']);
    run('systemctl',['restart',FABRIC_SERVICE]);
    if(!await awaitFabric(p.release,p.capabilities,p.binding))
      throw Error('STUDIO_BINDING_POST_RESTART_HEALTH_HOLD');
    status({state:'STUDIO_PRIVATE_BINDING_ACTIVE',
      owner_identity_verified:true,relay_authenticated:true,private_relay_healthy:true,
      relay_ledger_valid:true,fabric_healthy:true,
      studio_binding_present:true,source_release_ref:p.release});
  }catch(error){
    let rollback='RESTORED';
    try{
      if(dropCreated)fs.unlinkSync(DROP_IN);
      if(envCreated)fs.unlinkSync(STUDIO_ENV);
      run('systemctl',['daemon-reload']);
      run('systemctl',['restart',FABRIC_SERVICE]);
      if(!await awaitFabric(p.release,p.capabilities,null))
        throw Error('prior_fabric_not_healthy');
    }catch{rollback='UNVERIFIED_OPERATOR_REVIEW_REQUIRED'}
    throw Error('STUDIO_BINDING_APPLY_HOLD_'+rollback);
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(e=>{
    status({state:'HELD',reason:String(e?.message||'unknown').slice(0,130)});
    process.exitCode=1;
  });
}
