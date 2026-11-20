#!/usr/bin/env node
// Owner-only, idempotent Studio intake provisioning for the resident Fabric
// process. No leads, tokens, customer communication or checkout are created.
// Default is observation-only; mutation requires --apply --confirm-owned-host.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const STORE='/var/lib/evercraft/studio-leads';
export const ENV='/etc/evercraft/fabric.env';
export const KEY='EVERCRAFT_STUDIO_LEADS_DIR';

export function planStudioEnvironment(source,{store=STORE,legacyStatePresent=false}={}){
 if(typeof source!=='string'||store!==STORE||source.includes('\0'))throw Error('studio_env_invalid');
 const rows=source.split('\n').filter(x=>x.startsWith(KEY+'='));
 if(rows.length>1)throw Error('studio_env_duplicate_store');
 if(rows.length===1){
  if(rows[0]!==KEY+'='+store)throw Error('studio_env_existing_store_requires_private_review');
  return {changed:false,content:source};
 }
 if(source.split('\n').some(x=>/^\s*(export\s+)?EVERCRAFT_STUDIO_LEADS_DIR\s*=/.test(x)))
  throw Error('studio_env_unrecognized_store');
 if(legacyStatePresent)throw Error('studio_legacy_home_state_requires_private_migration');
 return {changed:true,content:source.replace(/\n?$/,'\n')+KEY+'='+store+'\n'};
}
export function checkPrivateDir(dir,uid,gid){
 const st=fs.lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==uid||st.gid!==gid||
    (st.mode&0o077)!==0)throw Error('studio_private_directory_invalid');
 return true;
}
export function checkEnv(file){
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
    st.uid!==0||(st.mode&0o077)!==0)throw Error('studio_fabric_env_invalid');
 return true;
}
export function checkExistingLedger(file,uid){
 if(!fs.existsSync(file))return;
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
    st.uid!==uid||(st.mode&0o077)!==0)throw Error('studio_existing_ledger_invalid');
}
function ensureDir(dir,uid,gid){
 if(fs.existsSync(dir)){checkPrivateDir(dir,uid,gid);return false}
 if(fs.lstatSync(path.dirname(dir)).isSymbolicLink())throw Error('studio_parent_symlink');
 fs.mkdirSync(dir,{recursive:false,mode:0o700});
 fs.chownSync(dir,uid,gid);
 fs.chmodSync(dir,0o700);
 checkPrivateDir(dir,uid,gid);
 return true;
}
export function provisionStudioIntake({uid,gid,env=ENV,store=STORE,
 home=os.homedir(),apply=false}={}){
 if(!Number.isSafeInteger(uid)||uid<=0||!Number.isSafeInteger(gid)||gid<0||
    env!==ENV||store!==STORE||!path.isAbsolute(home))
  throw Error('studio_provision_arguments_invalid');
 if(process.getuid?.()!==0)throw Error('studio_provision_requires_root');
 checkEnv(env);
 const root=fs.lstatSync(path.dirname(store));
 if(!root.isDirectory()||root.isSymbolicLink())throw Error('studio_state_parent_invalid');
 const legacy=path.join(home,'.local/state/evercraft/studio-leads');
 const legacyStatePresent=fs.existsSync(legacy)||fs.existsSync(legacy+'/inquiries.ndjson');
 const plan=planStudioEnvironment(fs.readFileSync(env,'utf8'),
  {store,legacyStatePresent});
 // No changes until every pre-existing object has passed safety review.
 if(fs.existsSync(store)){
  checkPrivateDir(store,uid,gid);
  for(const sub of ['alert-outbox','alert-receipts']){
   if(fs.existsSync(path.join(store,sub)))checkPrivateDir(path.join(store,sub),uid,gid);
  }
  checkExistingLedger(path.join(store,'inquiries.ndjson'),uid);
 }
 if(!apply)return {schema:'evercraft.studio.resident-intake-provision.v1',
  state:'DRY_RUN',store_configured:!plan.changed,legacy_state_hold:false,
  private_store_present:fs.existsSync(store),secret_exposed:false,
  customer_records_modified:0,service_restarted:false};
 const directoryCreated=ensureDir(store,uid,gid);
 const outboxCreated=ensureDir(path.join(store,'alert-outbox'),uid,gid);
 const receiptsCreated=ensureDir(path.join(store,'alert-receipts'),uid,gid);
 let environmentUpdated=false;
 if(plan.changed){
  // Atomic root-only config update. Existing secret values never enter output.
  const tmp=env+'.studio-'+process.pid;
  const fd=fs.openSync(tmp,'wx',0o600);
  try{
   fs.writeFileSync(fd,plan.content,'utf8');
   fs.fsyncSync(fd);
  }finally{fs.closeSync(fd)}
  try{
   fs.chownSync(tmp,0,0);
   fs.chmodSync(tmp,0o600);
   fs.renameSync(tmp,env);
   environmentUpdated=true;
  }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}
 }
 return {schema:'evercraft.studio.resident-intake-provision.v1',
  state:'private_intake_prepared',directory_created:directoryCreated,
  outbox_created:outboxCreated,receipts_created:receiptsCreated,
  environment_updated:environmentUpdated,secret_exposed:false,
  customer_records_modified:0,service_restarted:false};
}

if(process.argv[1]&&import.meta.url===new URL('file://'+path.resolve(process.argv[1])).href){
 try{
  const args=process.argv.slice(2);
  const idx=args.indexOf('--uid'),jdx=args.indexOf('--gid'),hdx=args.indexOf('--home');
  if(idx<0||jdx<0||hdx<0)throw Error('Usage: provision-studio-owned-intake.mjs --uid ID --gid ID --home HOME [--apply --confirm-owned-host]');
  const apply=args.includes('--apply'),confirmed=args.includes('--confirm-owned-host');
  if(apply&&!confirmed)throw Error('studio_owner_activation_confirmation_required');
  const result=provisionStudioIntake({
   uid:Number(args[idx+1]),gid:Number(args[jdx+1]),home:args[hdx+1],apply
  });
  console.log(JSON.stringify(result));
 }catch(error){
  console.error('STUDIO_INTAKE_HOLD '+String(error?.message||error));
  process.exitCode=1;
 }
}
