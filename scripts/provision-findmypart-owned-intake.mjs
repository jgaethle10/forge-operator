#!/usr/bin/env node
// Provision the owned FindMyPart inquiry path on an ALREADY-ADMITTED Fabric edge.
// Default is read-only. --apply is an explicit privileged, rollback-safe action.
// Never prints keys, customer details, or the contents of /etc/evercraft/fabric.env.
import fs from 'node:fs';
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
async function localSiteCheck(url){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),5500);
 try{
  const response=await fetch(url,{signal:controller.signal,redirect:'error',headers:{accept:'text/html'}});
  const body=await response.text();
  return response.status===200&&body.includes('FindMyPart')&&body.includes('id="part-request-form"')&&
   body.includes('/findmypart/app.mjs');
 }catch{return false}finally{clearTimeout(timeout)}
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
 const envSource=fs.readFileSync(settings.env,'utf8');
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
 fs.mkdirSync(settings.store,{recursive:true,mode:0o700});
 fs.chownSync(settings.store,uid,gid);
 fs.chmodSync(settings.store,0o700);
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
  if(!await localSiteCheck(settings.url))fail('owned_local_part_form_not_verified');
  emit({...setupState,state:'configured_local_site_verified',key_configured:true,
   private_lead_dir_configured:true,owner_notification_configured:principal.length>0||
    Boolean(parsed.settings.get('EVERCRAFT_FINDMYPART_OWNER_PRINCIPAL')),
   local_site_verified:true});
 }catch(error){
  if(installed){
   const restore=settings.env+'.findmypart-rollback-'+process.pid;
   fs.writeFileSync(restore,envSource,{mode:0o600,flag:'wx'});
   fs.chownSync(restore,0,0);fs.chmodSync(restore,oldMode===0?0o600:oldMode);
   fs.renameSync(restore,settings.env);
   try{run('systemctl',['restart',settings.service])}catch{}
  }
  throw error;
 }finally{
  if(fs.existsSync(temp))fs.unlinkSync(temp);
 }
}
main().catch(error=>{
 emit({state:'held',error:String(error?.message||'provision_failed'),live_checkout_verified:false});
 process.exitCode=1;
});
