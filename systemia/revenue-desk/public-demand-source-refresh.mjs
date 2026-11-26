import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {captureAndAdmit} from './public-demand-source-handoff.mjs';
import {startNativeBrowserRuntime} from '../evercraft-web/browser-worker/native-runtime.mjs';
const flags={qualified:false,contact_authorized:false,execution_authorized:false,send_performed:false};
const interval=6*60*60*1000;
const sources=['yvl','susta'];
const sha=x=>createHash('sha256').update(x).digest('hex');
function privateDir(dir){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const s=fs.lstatSync(dir);if(!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('unsafe_refresh_directory');
}
function read(file){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>65536)throw Error('unsafe_refresh_receipt');return fs.readFileSync(fd);}
 finally{fs.closeSync(fd);}
}
function retain(file,record){
 const body=Buffer.from(JSON.stringify(record,null,2)+'\n'),tmp=file+'.'+randomUUID()+'.tmp';
 try{const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,body);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.linkSync(tmp,file);const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}
 }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
 return sha(body);
}
// Invoked by existing document cycle when its queue is exhausted. No timer,
// remote write or extra process unless an approved observation slot is due.
export async function refreshDueSource({root,now=new Date(),observe}){
 if(!path.isAbsolute(root)||!Number.isFinite(+now)||+now<0||typeof observe!=='function')throw Error('invalid_refresh_input');
 privateDir(root);
 const dir=path.join(root,'source-refresh-receipts');privateDir(dir);
 const slot=Math.floor(+now/interval),sourceKey=sources[slot%sources.length],file=path.join(dir,'slot-'+slot+'.json'),lock=path.join(dir,'refresh.lock');
 fs.mkdirSync(lock,{mode:0o700});
 try{
  if(fs.existsSync(file)){
   const raw=read(file),old=JSON.parse(raw);
   if(old.schema!=='evercraft.public-demand.source-refresh-receipt.v1'||old.slot!==slot||old.source_key!==sourceKey||Object.keys(flags).some(k=>old[k]!==false))throw Error('refresh_receipt_mismatch');
   return {state:'not_due',slot,source_key:sourceKey,receipt_sha256:sha(raw),...flags};
  }
  let result;
  try{
   const r=await observe({root,sourceKey,observationSlot:slot});
   if(r?.source_key!==sourceKey||Object.keys(flags).some(k=>r[k]!==false)||!Number.isInteger(r.added)||r.added<0||r.added>3)throw Error('invalid_handoff_result');
   result={state:r.state,added:r.added,goal_key:r.goal_key||null,capture_sha256:r.capture_sha256||null,inbox_sha256:r.admission?.inbox_sha256||null};
  }catch(e){result={state:'hold_source_refresh',added:0,reason:String(e.message).slice(0,160)};}
  const record={schema:'evercraft.public-demand.source-refresh-receipt.v1',slot,source_key:sourceKey,observed_at:now.toISOString(),...result,...flags};
  const receipt_sha256=retain(file,record);
  return {...record,receipt_sha256};
 }finally{fs.rmdirSync(lock);}
}
export async function refreshWithBrowser({root,sourceDir,browsersPath}){
 if(!path.isAbsolute(sourceDir)||!path.isAbsolute(browsersPath))throw Error('absolute_browser_bindings_required');
 return refreshDueSource({root,observe:async({sourceKey,observationSlot})=>{
  const runtime=await startNativeBrowserRuntime({sourceDir,browsersPath,maxConcurrency:1});
  try{return await captureAndAdmit({root,sourceKey,observationSlot,browse:r=>runtime.browse(r)});}
  finally{await runtime.close();}
 }});
}
