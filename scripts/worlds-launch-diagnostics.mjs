// Evercraft Worlds launch diagnostic: read-only, no lease writes, no service
// activation, no customer worlds created, no bearer tokens in its receipt.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {probeWorldsPublic,checkWorldsOrigin} from './probe-worlds-public.mjs';
import {probeWorldsHeritagePublic} from './probe-worlds-heritage-public.mjs';
import {probeHiddenWorldPublic} from './probe-hidden-world-public.mjs';
import {auditWorldsReadiness} from './audit-worlds-owned-readiness.mjs';
import {inspectWorldsEdge,checkedLoopbackUrl} from '../systemia/worlds/worlds-edge-route.mjs';
import {verifyVaultBackup} from '../systemia/worlds/worlds-vault-backup.mjs';

export const LAUNCH_DIAGNOSTIC_SCHEMA='evercraft.worlds.launch-diagnostic.v1';
const pass=()=>({status:'pass'});
const fail=reason=>({status:'blocked',reason});
const skip=reason=>({status:'not_checked',reason});
const defaultBackupRoot=()=>path.join(process.env.XDG_STATE_HOME||path.join(os.homedir(),'.local/state'),'evercraft/worlds-private-backups');

export async function assessWorldsLaunch({
 publicOrigin='',vaultUrl='http://127.0.0.1:8788',edgeControlUrl='http://127.0.0.1:18081',
 backupRoot=defaultBackupRoot(),controlToken='',fetchFn=fetch,
 edgeInspector=inspectWorldsEdge,publicProbe=probeWorldsPublic,
 heritageProbe=probeWorldsHeritagePublic,hiddenWorldProbe=probeHiddenWorldPublic,
 backupVerifier=verifyVaultBackup,files=fs
}={}){
 const checks={
  owned_https_origin:skip('origin_not_configured'),
  local_vault:skip('not_checked'),
  private_backup:skip('not_checked'),
  owned_edge_admission:skip('not_checked'),
  external_read_only:skip('not_checked')
 };
 const externalNames=['worlds','heritage','hidden_world'];
 let externalReadOnlySurfaces=Object.fromEntries(externalNames.map(name=>[name,{verified:false,reason:'not_checked'}]));
 let origin='';
 try{origin=checkWorldsOrigin(publicOrigin);checks.owned_https_origin=pass();}
 catch{checks.owned_https_origin=fail('owned_https_origin_required');}
 let localVault='';
 try{
  localVault=checkedLoopbackUrl(vaultUrl);
  const response=await fetchFn(localVault+'/worlds/api/health',{
   cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)
  });
  if(response.status!==200)throw Error('not_200');
  const data=await response.json();
  if(data?.schema!=='evercraft.worlds.vault.v1'||data.ok!==true||
   data.mode!=='owned-durable-vault')throw Error('identity_mismatch');
  if(origin&&data.public_origin!==origin)checks.local_vault=fail('vault_origin_not_pinned_to_customer_host');
  else checks.local_vault=pass();
 }catch{checks.local_vault=fail('local_owned_vault_unavailable_or_mismatched');}
 try{
  const candidates=(await files.readdir(backupRoot,{withFileTypes:true}))
   .filter(entry=>entry.isDirectory()&&entry.name.startsWith('worlds-'))
   .map(entry=>entry.name).sort().reverse();
  if(!candidates.length)checks.private_backup=fail('private_backup_not_found');
  else{
   // Verify latest backup, not merely the presence of a folder or filename.
   const proof=await backupVerifier(path.join(backupRoot,candidates[0]));
   checks.private_backup=proof?.verified===true?pass():fail('backup_integrity_not_verified');
  }
 }catch{checks.private_backup=fail('backup_missing_or_unverified');}
 if(origin&&checks.local_vault.status==='pass'){
  try{
   const edge=await edgeInspector({
    edgeControlUrl,vaultUrl:localVault,publicOrigin:origin,
    controlToken,fetchFn,allowProof:false
   });
   if(edge?.ready!==true||edge.proof_only!==false)throw Error('not_production_ready');
   checks.owned_edge_admission=pass();
  }catch{checks.owned_edge_admission=fail('owned_edge_not_admitted');}
 }else checks.owned_edge_admission=skip('requires_pinned_local_vault');
 if(origin){
  try{
   // A successful vault homepage alone must never qualify the heritage tour
   // or Hidden World for an external write drill. Reuse the same three
   // independent HTTPS canaries as the public readiness watcher.
   const report=await auditWorldsReadiness(origin,{
    probes:{
     worlds:value=>publicProbe(value,{fetchFn}),
     heritage:value=>heritageProbe(value,{fetchFn}),
     hidden_world:value=>hiddenWorldProbe(value,{fetchFn})
    }
   });
   externalReadOnlySurfaces=report.checks;
   checks.external_read_only=report.verified===true?pass():fail('external_https_read_only_gate_failed');
  }catch{checks.external_read_only=fail('external_https_read_only_gate_failed');}
 }else checks.external_read_only=skip('requires_owned_https_origin');
 const prerequisiteChecks=Object.values(checks);
 const readyForWriteDrill=prerequisiteChecks.every(item=>item.status==='pass');
 const actions={
  owned_https_origin:'Configure an Evercraft-owned HTTPS Worlds hostname using EVERCRAFT_WORLDS_PUBLIC_ORIGIN.',
  local_vault:'Start the private Worlds vault on the owning node with its exact --public-origin; verify its loopback health.',
  private_backup:'Create a private Worlds vault backup and verify the latest snapshot before opening public writes.',
  owned_edge_admission:'Verify the owned public-edge controller, dedicated Worlds hostname and renewable lease on the same node.',
  external_read_only:'Activate the owned HTTPS route, then independently verify the Worlds vault, Heritage tour and Hidden World over the same owned origin.'
 };
 const blocker=Object.entries(checks).find(([,value])=>value.status!=='pass');
 const nextAction=blocker?actions[blocker[0]]:
  'Prerequisites passed. An authorized operator can run the opt-in disposable HTTPS write drill; then verify a real iPhone.';
 return {
  schema:LAUNCH_DIAGNOSTIC_SCHEMA,
  mode:'read_only',
  public_origin:origin||null,
  checks,external_read_only_surfaces:externalReadOnlySurfaces,
  ready_for_disposable_write_drill:readyForWriteDrill,
  write_test_performed:false,
  live_iphone_verified:false,
  public_launch_verified:false,
  next_action:nextAction
 };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 const option=key=>{const i=args.indexOf('--'+key);return i<0?'':args[i+1]||'';};
 if(args.includes('--help')){
  console.log('Usage: node scripts/worlds-launch-diagnostics.mjs [--public-origin https://worlds.YOUR_OWNED_DOMAIN] [--vault http://127.0.0.1:8788] [--edge-control http://127.0.0.1:18081] [--backup-root PRIVATE_PATH]');
 }else{
  assessWorldsLaunch({
   publicOrigin:option('public-origin')||process.env.EVERCRAFT_WORLDS_PUBLIC_ORIGIN||'',
   vaultUrl:option('vault')||'http://127.0.0.1:8788',
   edgeControlUrl:option('edge-control')||'http://127.0.0.1:18081',
   backupRoot:option('backup-root')||defaultBackupRoot(),
   controlToken:process.env.EVERCRAFT_EDGE_CONTROL_TOKEN||''
  }).then(receipt=>{
   console.log(JSON.stringify(receipt,null,2));
   if(!receipt.ready_for_disposable_write_drill)process.exitCode=1;
  }).catch(()=>{
   console.log(JSON.stringify({schema:LAUNCH_DIAGNOSTIC_SCHEMA,
    mode:'read_only',ready_for_disposable_write_drill:false,reason:'diagnostic_unavailable'}));
   process.exitCode=1;
  });
 }
}
