#!/usr/bin/env node
// Idempotent owned Website Audit inquiry provisioner. No checkout, payments,
// credentials, customer records, or external network calls are involved.
// The Fabric service has ProtectHome=read-only, so its lead inbox must live in
// a service-user-owned /var/lib path, not under the runtime user's home.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const STORE='/var/lib/evercraft/website-audit-leads';
export const ENV='/etc/evercraft/fabric.env';
export const KEY='EVERCRAFT_WEBSITE_AUDIT_LEADS_DIR';

export function plannedEnvironment(source,{store=STORE}={}) {
  if(typeof source!=='string'||!path.isAbsolute(store)||store.includes('\n'))
    throw Error('audit_env_input_invalid');
  const lines=source.split('\n');
  const settings=lines.filter(x=>x.startsWith(KEY+'='));
  if(settings.length>1)throw Error('audit_env_duplicate_setting');
  if(settings.length===1) {
    if(settings[0]!==KEY+'='+store)throw Error('audit_env_existing_store_requires_review');
    return {changed:false,content:source};
  }
  if(lines.some(x=>/^\s*export\s+EVERCRAFT_WEBSITE_AUDIT_LEADS_DIR=/.test(x)))
    throw Error('audit_env_unrecognized_setting');
  return {changed:true,content:source.replace(/\n?$/,'\n')+KEY+'='+store+'\n'};
}

export function inspectPrivateDirectory(location,{uid,gid}){
  const st=fs.lstatSync(location);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
     st.uid!==uid||st.gid!==gid)throw Error('audit_private_directory_unsafe');
  return true;
}
export function ensurePrivateDirectory(location,{uid,gid}){
  if(fs.existsSync(location)) {
    inspectPrivateDirectory(location,{uid,gid});
    return false;
  }
  if(fs.lstatSync(path.dirname(location)).isSymbolicLink())
    throw Error('audit_private_parent_symlink');
  fs.mkdirSync(location,{recursive:false,mode:0o700});
  fs.chownSync(location,uid,gid);
  fs.chmodSync(location,0o700);
  inspectPrivateDirectory(location,{uid,gid});
  return true;
}

export function inspectEnvFile(location){
  const st=fs.lstatSync(location);
  if(!st.isFile()||st.isSymbolicLink()||st.uid!==0||(st.mode&0o077)!==0)
    throw Error('audit_fabric_env_unsafe');
  return true;
}

export function provisionAuditIntake({uid,gid,env=ENV,store=STORE}){
  if(typeof process.getuid!=='function'||process.getuid()!==0)
    throw Error('audit_intake_provision_requires_root');
  if(!Number.isSafeInteger(uid)||uid<=0||!Number.isSafeInteger(gid)||gid<0)
    throw Error('audit_service_identity_invalid');
  if(env!==ENV||store!==STORE)throw Error('audit_provision_paths_not_authorized');
  inspectEnvFile(env);
  const source=fs.readFileSync(env,'utf8');
  const plan=plannedEnvironment(source,{store});
  const parent=path.dirname(store);
  const parentInfo=fs.lstatSync(parent);
  if(!parentInfo.isDirectory()||parentInfo.isSymbolicLink())
    throw Error('audit_state_parent_unsafe');
  const storeCreated=ensurePrivateDirectory(store,{uid,gid});
  const outboxCreated=ensurePrivateDirectory(path.join(store,'alert-outbox'),{uid,gid});
  let environmentUpdated=false;
  if(plan.changed) {
    // Atomic root-only environment update. Never print or overwrite other
    // values (including payment credentials or private tokens).
    const temporary=env+'.website-audit-'+process.pid;
    const fd=fs.openSync(temporary,'wx',0o600);
    try {
      fs.writeFileSync(fd,plan.content,'utf8');
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    try {
      fs.chownSync(temporary,0,0);
      fs.chmodSync(temporary,0o600);
      fs.renameSync(temporary,env);
      environmentUpdated=true;
    } finally {
      if(fs.existsSync(temporary))fs.unlinkSync(temporary);
    }
  }
  return {
    schema:'evercraft.website-audit.private-intake-provision.v1',
    state:'private_intake_prepared',
    directory_created:storeCreated,
    outbox_created:outboxCreated,
    environment_updated:environmentUpdated,
    native_payment_ready:false,
    payment_created:false,
    customer_contact_sent:false,
  };
}

function main(){
  const flag=(key)=>{
    const i=process.argv.indexOf(key);
    return i>=0?process.argv[i+1]:undefined;
  };
  const uid=Number(flag('--uid'));
  const gid=Number(flag('--gid'));
  if(!Number.isSafeInteger(uid)||!Number.isSafeInteger(gid))
    throw Error('audit_service_identity_required');
  const result=provisionAuditIntake({uid,gid});
  process.stdout.write(JSON.stringify(result)+'\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try { main(); }
  catch(e){
    console.error('AUDIT_PRIVATE_INTAKE_HOLD: '+String(e?.message||'error'));
    process.exitCode=1;
  }
}
