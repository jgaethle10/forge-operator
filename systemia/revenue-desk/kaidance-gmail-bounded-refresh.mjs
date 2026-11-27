// One bounded refresh adapter, intended for an existing admitted resident tick.
// No timer, automatic baseline, re-consent, lock breaking or send authority.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readLatestGeneration} from './owned-gmail-atomic-window.mjs';
import {observeOwnedGmail} from './kaidance-gmail-observation.mjs';
const worker=fileURLToPath(new URL('./owned-gmail-atomic-window.mjs',import.meta.url));
const hold=(status)=>({schema:'evercraft.kaidance.gmail-refresh.v1',status,checkpoint_advanced:null,send_authority:false,contact_clearance:false,quota_authority:false,private_records_exported:0});
function ownedRoot(p){
 if(!path.isAbsolute(p)||fs.realpathSync(p)!==p)throw Error('private_root');
 const s=fs.lstatSync(p);
 if(!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('private_root');
}
export function runBoundedGmailRefresh({enabled=false,root=path.join(os.homedir(),'.local/state/evercraft-revenue-desk'),expectedMailbox,spawn=spawnSync,clock=Date.now}={}){
 if(enabled!==true)return hold('not_admitted');
 try{
  if(typeof expectedMailbox!=='string'||!/^\S+@\S+\.\S+$/.test(expectedMailbox)||expectedMailbox.length>254)return hold('hold_mailbox_binding');
  const state=path.join(root,'gmail-sync'),secret=path.join(root,'.secrets');
  ownedRoot(state);ownedRoot(secret);
  const previous=readLatestGeneration(state,expectedMailbox);
  if(!previous)return hold('hold_baseline_missing');
  if(fs.existsSync(path.join(state,'.sync-lock')))return hold('hold_existing_writer');
  // Preserve every generation for now; do not silently delete evidence.
  const count=fs.readdirSync(state).filter(n=>/^recent-\d{8}T\d{6}Z\.json$/.test(n)).length;
  if(count>=96)return hold('hold_retention_review');
  // Avoid duplicate same-second generation names and clock rollback.
  if(clock()-Date.parse(previous.observed_at)<2000)return hold('hold_generation_too_recent');
  const result=spawn(process.execPath,[worker,'--refresh','--state-dir',state,'--client-file',path.join(secret,'gmail-desktop-client.json'),'--binding-file',path.join(secret,'gmail-readonly-binding.json'),'--mailbox',expectedMailbox],{encoding:'utf8',timeout:45000,killSignal:'SIGKILL',maxBuffer:16384,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:os.homedir()}});
  if(result.error?.code==='ETIMEDOUT')return hold('hold_refresh_timeout');
  if(result.error||result.status!==0)return hold('hold_refresh_failed');
  let receipt;try{receipt=JSON.parse(result.stdout)}catch{return hold('hold_receipt_invalid')}
  if(receipt?.state!=='gmail_atomic_window_committed'||receipt.mode!=='incremental'||receipt.checkpoint_persisted!==true||receipt.send_authority!==false||receipt.private_records_exported!==0||receipt.full_history_confirmed!==false||receipt.internal_date_coverage_confirmed!==false)return hold('hold_receipt_invalid');
  const current=readLatestGeneration(state,expectedMailbox);
  if(!current||Date.parse(current.observed_at)<=Date.parse(previous.observed_at)||BigInt(current.gmail_sync.history_id)<BigInt(previous.gmail_sync.history_id)||current.gmail_sync.provider_listed_count!==receipt.provider_listed_count||current.messages.length!==receipt.messages)return hold('hold_generation_readback');
  const observed=observeOwnedGmail({root:state,now:new Date(clock())}).summary;
  if(observed.status!=='recent_metadata_observed_not_authoritative'||observed.observed_at!==current.observed_at)return hold('hold_generation_readback');
  return {...hold('refresh_verified'),checkpoint_advanced:current.gmail_sync.history_id!==previous.gmail_sync.history_id,checkpoint_persisted:true,provider_listed_count:current.gmail_sync.provider_listed_count,reporting_messages:current.messages.length,outside_window_count:current.gmail_sync.outside_window_rows.length,observed_at:current.observed_at,internal_date_coverage_confirmed:false,full_history_confirmed:false};
 }catch{return hold('hold_private_binding_or_readback')}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2),i=a.indexOf('--mailbox');
 const r=a[0]==='--prove-refresh'&&i>=0?runBoundedGmailRefresh({enabled:true,expectedMailbox:a[i+1]}):hold('not_admitted');
 console.log(JSON.stringify(r));
 if(r.status!=='refresh_verified')process.exitCode=1;
}
