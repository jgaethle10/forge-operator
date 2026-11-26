import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {collectUkReleaseWindow} from './uk-buyer-source.mjs';
import {planUkAwardPartners} from './uk-award-partner-signals.mjs';

const DAY=86400000;
const hash=x=>createHash('sha256').update(x).digest('hex');
const schema='evercraft.uk.award-history-window.v1';
function privateDir(dir){
 if(!path.isAbsolute(dir))throw Error('absolute_private_directory_required');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const s=fs.lstatSync(dir);
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0)throw Error('unsafe_history_directory');
}
function readReceipt(file){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{
  const s=fs.fstatSync(fd);
  if(!s.isFile()||(s.mode&0o077)!==0||s.size>16000000)throw Error('unsafe_history_receipt');
  return JSON.parse(fs.readFileSync(fd,'utf8'));
 }finally{fs.closeSync(fd);}
}
function publish(file,value){
 const temp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
 let fd;
 try{
  fd=fs.openSync(temp,'wx',0o600);
  fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
  fs.linkSync(temp,file);
  const dirfd=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dirfd);}finally{fs.closeSync(dirfd);}
 }finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
// One closed UTC calendar day per invocation. Partial windows are durable holds,
// never silently retried or declared complete. No outreach or CRM mutation.
export async function runUkAwardHistory({directory,now=new Date(),days=30,collect=collectUkReleaseWindow}={}){
 if(!Number.isFinite(+now)||!Number.isInteger(days)||days<1||days>179)throw Error('invalid_history_bounds');
 privateDir(directory);
 const lock=path.join(directory,'history.lock');
 const fd=fs.openSync(lock,'wx',0o600);
 try{
  fs.writeFileSync(fd,JSON.stringify({pid:process.pid,started_at:now.toISOString()}));fs.fsyncSync(fd);
  const midnight=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
  for(let offset=1;offset<=days;offset++){
   const start=new Date(midnight-offset*DAY),end=new Date(+start+DAY);
   const key=start.toISOString().slice(0,10),file=path.join(directory,key+'.json');
   if(fs.existsSync(file)){
    const r=readReceipt(file);
    if(r.schema!==schema||r.window_start!==start.toISOString()||r.window_end!==end.toISOString()||
       !['complete','hold_partial'].includes(r.state)||hash(JSON.stringify(r.plan))!==r.plan_sha256)throw Error('history_receipt_identity_mismatch');
    continue;
   }
   const w=await collect({now,windowStart:start,windowEnd:end,maxPages:10});
   if(w.window_start!==start.toISOString()||w.window_end!==end.toISOString()||typeof w.coverage_complete!=='boolean')throw Error('history_window_identity_mismatch');
   const plan=planUkAwardPartners(w,{now,maxAgeDays:180});
   const state=w.coverage_complete?'complete':'hold_partial';
   const receipt={schema,state,window_start:start.toISOString(),window_end:end.toISOString(),observed_at:now.toISOString(),records_observed:w.releases.length,pages_observed:w.pages_observed,plan_sha256:hash(JSON.stringify(plan)),plan,qualified_count:0,send_performed:false};
   publish(file,receipt);
   return {state,window:key,artifact:file,records_observed:receipt.records_observed,partner_signals:plan.signals.length,diagnostics:plan.diagnostics,send_performed:false};
  }
  return {state:'inventory_windows_retained',requested_days:days,send_performed:false};
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
