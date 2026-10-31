#!/usr/bin/env node
// Provision the owned FindMyPart inquiry path on an ALREADY-ADMITTED Fabric edge.
// Default is read-only. --apply is an explicit privileged, rollback-safe action.
// Never prints keys, customer details, or the contents of /etc/evercraft/fabric.env.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const DEFAULT_ENV='/etc/evercraft/fabric.env';
const DEFAULT_STORE='/var/lib/evercraft/findmypart-leads';
const DEFAULT_SERVICE='evercraft-fabric.service';
const DEFAULT_LOCAL_URL='http://127.0.0.1:8787/findmypart/';
const settings={
 env:process.env.FMP_SETUP_ENV_PATH||DEFAULT_ENV,
 store:process.env.FMP_SETUP_STORE_PATH||DEFAULT_STORE,
 service:process.env.FMP_SETUP_SERVICE||DEFAULT_SERVICE,
 url:process.env.FMP_SETUP_LOCAL_URL||DEFAULT_LOCAL_URL,
};
const apply=process.argv.includes('--apply');
const ownerIndex=process.argv.indexOf('--owner-principal');
const principal=ownerIndex>=0?String(process.argv[ownerIndex+1]||'').trim():'';
const emit=(result)=>console.log(JSON.stringify({schema:'evercraft.findmypart.private-edge-provision.v1',...result},null,2));
const fail=(message)=>{throw new Error(message)};
const run=(name,args)=>execFileSync(name,args,{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}).trim();
export function normalizeEnv(text){
 const lines=String(text).split('\n').filter((line,index,array)=>index<array.length-1||line.length>0);
 const settings=new Map();
 for(const line of lines){
  if(/^\s*(#|$)/.test(line))continue;
  const idx=line.indexOf('=');
  if(idx<1)throw new Error('fabric_env_malformed');
  const name=line.slice(0,idx).trim();
  if(!/^[A-Z_][A-Z0-9_]*$/.test(name)||settings.has(name))
   throw new Error('fabric_env_duplicate_or_invalid_setting');
  settings.set(name,line.slice(idx+1));
 }
 return {lines,settings};
}
export function insertSettings(text,replacements){
 const parsed=normalizeEnv(text);
 for(const key of Object.keys(replacements))if(!/^[A-Z_][A-Z0-9_]*$/.test(key))
  throw new Error('setting_key_invalid');
 const filtered=parsed.lines.filter(line=>!Object.keys(replacements).some(key=>line.startsWith(key+'=')));
 return [...filtered,...Object.entries(replacements).map(([key,val])=>{
  if(!/^[^\r\n"]*$/.test(val))throw new Error('setting_value_invalid');
  return key+'='+val;
 })].join('\n')+'\n';
}
export async function waitForFindMyPartService(url,{
 fetchImpl=fetch,
 attempts=24,
 delayMs=500,
 requireIntake=true,
}={}){
 // systemctl restart may succeed before Node is listening on loopback.
 // Bounded polling is needed; neither one HTTP 000 nor a web 200 alone
 // proves that customer data can be accepted safely.
 if(!Number.isInteger(attempts)||attempts<1||attempts>60)throw Error('invalid_check_attempts');
 let reason='local_page_unavailable';
 for(let n=0;n<attempts;n++){
  let goodPage=false;
  try{
   const page=await fetchImpl(url,{
    signal:AbortSignal.timeout(3000),redirect:'error',headers:{accept:'text/html'},
   });
   if(page.status===200){
    const text=await page.text();
    goodPage=text.includes('FindMyPart')&&text.includes('id="part-request-form"')&&
      text.includes('/findmypart/app.mjs');
   }
  }catch{}
  if(goodPage){
   if(!requireIntake)return {ok:true,proof:'local_buyer_page'};
   reason='private_intake_not_ready';
   try{
    const readiness=await fetchImpl(new URL('/api/findmypart/readiness',url),{
      signal:AbortSignal.timeout(3000),redirect:'error',headers:{accept:'application/json'},
    });
    if(readiness.status===200){
     const result=await readiness.json();
     if(result?.schema==='evercraft.findmypart.intake-readiness.v1'&&
      result.intake_available===true&&result.payment_ready===false&&
      result.payment_verified===false)
      return {ok:true,proof:'local_buyer_page_and_private_intake'};
    }
   }catch{}
  }else{reason='local_page_unavailable'}
  if(n<attempts-1)await new Promise(resolve=>setTimeout(resolve,delayMs));
 }
 return {ok:false,reason};
}
export function ensurePrivateIntakeDirectory(root,name,uid,gid){
 if(!['alert-outbox','alert-receipts'].includes(name))throw Error('invalid_private_child');
 const dest=path.join(root,name);
 const exists=fs.existsSync(dest);
 if(exists){
  const stat=fs.lstatSync(dest);
  if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||
    stat.uid!==uid||stat.gid!==gid)
   throw Error('private_child_directory_unsafe');
 }else{
  fs.mkdirSync(dest,{mode:0o700});
  fs.chownSync(dest,uid,gid);
  fs.chmodSync(dest,0o700);
 }
}
async function main(){
 if(principal&&!/^[a-zA-Z0-9._:@-]{3,160}$/.test(principal))fail('invalid_owner_principal');
 if(!path.isAbsolute(settings.env)||!path.isAbsolute(settings.store))fail('absolute_paths_required');
 if(!settings.url.startsWith('http://127.0.0.1:'))fail('loopback_url_required');
 const serviceUser=run('systemctl',['show','-p','User','--value',settings.service]);
 if(!serviceUser||serviceUser==='root')fail('dedicated_fabric_service_user_required');
 if(!fs.existsSync(settings.env))fail('fabric_env_missing_run_owned_edge_install_first');
 const info=fs.lstatSync(settings.env);
 if(!info.isFile()||info.isSymbolicLink())fail('fabric_env_unsafe');
 let envSource;
 try{envSource=fs.readFileSync(settings.env,'utf8')}
 catch(error){
  if(error?.code==='EACCES'&&process.getuid?.()!==0)
   fail('read_only_inspection_requires_sudo');
  throw error;
 }
 const parsed=normalizeEnv(envSource);
 const hasKey=Boolean(parsed.settings.get('EVERCRAFT_FINDMYPART_INTAKE_KEY_B64'));
 if(hasKey&&Buffer.from(parsed.settings.get('EVERCRAFT_FINDMYPART_INTAKE_KEY_B64'),'base64').length!==32)
  fail('existing_findmypart_key_invalid_do_not_rotate');
 const setupState={
  state:apply?'applying':'inspection_only',
  service_user:serviceUser,
  key_configured:hasKey,
  private_lead_dir_configured:Boolean(parsed.settings.get('EVERCRAFT_FINDMYPART_LEADS_DIR')),
  owner_notification_configured:Boolean(parsed.settings.get('EVERCRAFT_FINDMYPART_OWNER_PRINCIPAL')),
  payment_ready:false,
  paid_settlement_verified:false,
 };
 if(!apply){emit(setupState);return}
 if(process.getuid?.()!==0)fail('apply_requires_root');
 // Do not modify an already configured directory to conceal dangerous ownership.
 if(fs.existsSync(settings.store)){
  const stat=fs.lstatSync(settings.store);
  if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)
   fail('private_lead_directory_permissions_invalid');
 }
 const uid=Number(run('id',['-u',serviceUser]));
 const gid=Number(run('id',['-g',serviceUser]));
 if(!Number.isSafeInteger(uid)||!Number.isSafeInteger(gid))fail('service_identity_invalid');
 if(fs.existsSync(settings.store)){
  const state=fs.statSync(settings.store);
  if(state.uid!==uid||state.gid!==gid)fail('existing_private_directory_owner_mismatch');
 }
 fs.mkdirSync(settings.store,{recursive:true,mode:0o700});
 fs.chownSync(settings.store,uid,gid);
 fs.chmodSync(settings.store,0o700);
 // Without a writable private outbox the public readiness route returns
 // false even if the encrypted storage root and key are configured.
 // Create both child folders before restarting Fabric, preserving any
 // existing records or delivery receipts.
 ensurePrivateIntakeDirectory(settings.store,'alert-outbox',uid,gid);
 ensurePrivateIntakeDirectory(settings.store,'alert-receipts',uid,gid);
 // Preserve existing encrypted inquiries and all unrelated Fabric settings.
 const privateKey=hasKey?parsed.settings.get('EVERCRAFT_FINDMYPART_INTAKE_KEY_B64'):randomBytes(32).toString('base64');
 const values={
  EVERCRAFT_FINDMYPART_INTAKE_KEY_B64:privateKey,
  EVERCRAFT_FINDMYPART_LEADS_DIR:settings.store,
 };
 if(principal)values.EVERCRAFT_FINDMYPART_OWNER_PRINCIPAL=principal;
 const next=insertSettings(envSource,values);
 const temp=settings.env+'.findmypart-staged-'+process.pid;
 const mode=0o600;
 const oldMode=info.mode&0o777;
 let installed=false;
 try{
  fs.writeFileSync(temp,next,{mode,flag:'wx'});
  fs.chownSync(temp,0,0);fs.chmodSync(temp,mode);
  fs.renameSync(temp,settings.env);installed=true;
  run('systemctl',['restart',settings.service]);
  const verified=await waitForFindMyPartService(settings.url);
  if(!verified.ok)fail('owned_intake_verification_failed_'+verified.reason);
  emit({...setupState,state:'configured_owned_intake_verified',key_configured:true,
   private_lead_dir_configured:true,owner_notification_configured:principal.length>0||
    Boolean(parsed.settings.get('EVERCRAFT_FINDMYPART_OWNER_PRINCIPAL')),
   local_site_verified:true,local_intake_verified:true});
 }catch(error){
  if(installed){
   const restore=settings.env+'.findmypart-rollback-'+process.pid;
   fs.writeFileSync(restore,envSource,{mode:0o600,flag:'wx'});
   fs.chownSync(restore,0,0);fs.chmodSync(restore,0o600);
   fs.renameSync(restore,settings.env);
   try{
    run('systemctl',['restart',settings.service]);
    const recovered=await waitForFindMyPartService(settings.url,{requireIntake:false});
    if(!recovered.ok)throw Error('rollback_local_page_not_verified');
   }catch(restoreError){
    throw Error('intake_apply_failed_'+String(error?.message||'unknown')+
      '_rollback_not_verified_'+String(restoreError?.message||'unknown'));
   }
  }
  throw error;
 }finally{
  if(fs.existsSync(temp))fs.unlinkSync(temp);
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{
  emit({state:'held',error:String(error?.message||'provision_failed'),live_checkout_verified:false});
  process.exitCode=1;
 });
}
