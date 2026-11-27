// Additive adapter for the existing company heartbeat. No separate timer or service.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {runBoundedGmailRefresh} from './kaidance-gmail-bounded-refresh.mjs';
import {observeOwnedGmail} from './kaidance-gmail-observation.mjs';
const flags={send_authority:false,contact_clearance:false,quota_authority:false,full_history_confirmed:false,internal_date_coverage_confirmed:false,private_records_exported:0};
const result=(status,extra={})=>({schema:'evercraft.kaidance.gmail-resident-tick.v1',status,...extra,...flags});
export function runResidentGmailTick({enabled=false,githubActions=false,outDir,tickAt=new Date(),expectedMailbox,root=path.join(os.homedir(),'.local/state/evercraft-revenue-desk'),refresh=runBoundedGmailRefresh,observe=observeOwnedGmail,clock=Date.now}={}){
 if(enabled!==true||githubActions)return result('not_admitted');
 try{
  if(typeof outDir!=='string'||!path.isAbsolute(outDir)||path.basename(outDir)!=='kaidance-company-heartbeat')return result('hold_output_binding');
  const parent=path.dirname(outDir),st=fs.lstatSync(parent);
  if(fs.realpathSync(parent)!==parent||!st.isDirectory()||st.uid!==process.getuid()||(st.mode&0o077))return result('hold_output_binding');
  const tick=Math.floor(+tickAt/300000);
  if(!Number.isSafeInteger(tick)||tick!==Math.floor(clock()/300000))return result('hold_tick_boundary');
  if(fs.existsSync(outDir)){
   const s=fs.lstatSync(outDir);
   if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077))return result('hold_output_binding');
  }
  const state=path.join(outDir,'state.json');
  if(fs.existsSync(state)){
   const fd=fs.openSync(state,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
   let previous;
   try{
    const s=fs.fstatSync(fd);
    if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>1048576)return result('hold_tick_state');
    const b=Buffer.alloc(s.size+1),n=fs.readSync(fd,b,0,b.length,0);
    if(n!==s.size)return result('hold_tick_state');
    previous=JSON.parse(b.subarray(0,n).toString('utf8'));
   }finally{fs.closeSync(fd)}
   if(!Number.isSafeInteger(previous?.tick)||previous.tick<0)return result('hold_tick_state');
   if(previous.tick>=tick)return result('hold_tick_already_recorded');
  }
  const r=refresh({enabled:true,root,expectedMailbox,clock});
  if(r?.status!=='refresh_verified'||r.send_authority!==false||r.contact_clearance!==false||r.quota_authority!==false||r.private_records_exported!==0||r.checkpoint_persisted!==true)return result('hold_refresh_unverified');
  const o=observe({root:path.join(root,'gmail-sync'),now:new Date(clock())}).summary;
  if(o?.status!=='recent_metadata_observed_not_authoritative'||o.observed_at!==r.observed_at||o.snapshot_records!==r.reporting_messages||o.private_records_exported!==0||o.contact_clearance!==false||o.outreach_authorized!==false||o.quota_authority!==false)return result('hold_observation_unverified');
  return result('refresh_and_observation_verified',{tick,observed_at:o.observed_at,checkpoint_advanced:r.checkpoint_advanced===true,provider_listed_count:r.provider_listed_count,reporting_messages:r.reporting_messages,outside_window_count:r.outside_window_count,rolling_24h_at_capture:o.rolling_24h_at_capture,buyer_replies_verified:0,buyers_qualified:0});
 }catch{return result('hold_private_binding_or_tick')}
}
