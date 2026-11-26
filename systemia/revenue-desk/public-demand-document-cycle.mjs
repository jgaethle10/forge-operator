#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {planReceiptBoundPdfs,resumePdfExtraction} from './public-demand-pdf-canary.mjs';
import {runTriage} from './public-demand-triage.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const flags={qualified:false,contact_authorized:false,execution_authorized:false,send_performed:false};
function privateDir(dir){
 if(!path.isAbsolute(dir))throw Error('absolute_directory_required');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const s=fs.lstatSync(dir);if(!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('unsafe_directory');
}
function read(file,max=2000000){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>max)throw Error('unsafe_artifact');return fs.readFileSync(fd);}
 finally{fs.closeSync(fd);}
}
function retain(file,record){
 const body=Buffer.from(JSON.stringify(record,null,2)+'\n'),tmp=file+'.'+randomUUID()+'.tmp';
 try{const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,body);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.linkSync(tmp,file);const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}
 }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
 return sha(body);
}
function cli(name,args,timeout){
 const script=fileURLToPath(new URL(name,import.meta.url));
 const r=spawnSync(process.execPath,[script,...args],{timeout,maxBuffer:2*1024*1024,encoding:'utf8',env:{PATH:'/usr/bin:/bin',HOME:process.env.HOME||'/tmp'}});
 if(r.error||r.status!==0)throw Error('bounded_stage_failed:'+name);
 return JSON.parse(r.stdout);
}
export function planDocumentCycle({root,manifestRaw}){
 if(!path.isAbsolute(root)||!Buffer.isBuffer(manifestRaw)||manifestRaw.length>65536)throw Error('invalid_cycle_input');
 const m=JSON.parse(manifestRaw);
 if(m.schema!=='evercraft.public-demand.document-inbox.v1'||!Array.isArray(m.captures)||m.captures.length>20)throw Error('invalid_inbox');
 const jobs=[],seen=new Set();
 for(const c of m.captures){
  if(!/^[a-f0-9]{64}$/.test(c.key)||!/^[a-f0-9]{64}$/.test(c.sha256)||!Array.isArray(c.indices)||c.indices.length<1||c.indices.length>20||new Set(c.indices).size!==c.indices.length)throw Error('invalid_capture_entry');
  const parent=path.join(root,'captures',c.key+'.json'),raw=read(parent);
  for(const index of c.indices){
   const job=planReceiptBoundPdfs(raw,c.sha256,[index])[0],key=sha(JSON.stringify(job));
   if(seen.has(key))continue;seen.add(key);
   jobs.push({key,parent,parent_sha256:c.sha256,index,job});
  }
 }
 return jobs;
}
export function runDocumentCycle({root,manifestFile}){
 privateDir(root);privateDir(path.join(root,'captures'));const docs=path.join(root,'documents'),cycles=path.join(root,'document-cycle-receipts');
 privateDir(docs);privateDir(cycles);
 const lock=path.join(cycles,'cycle.lock');
 fs.mkdirSync(lock,{mode:0o700});
 try{
  const manifestRaw=read(manifestFile,65536),jobs=planDocumentCycle({root,manifestRaw});
  const pending=jobs.filter(j=>!fs.existsSync(path.join(cycles,j.key+'.json')));
  if(!pending.length)return {schema:'evercraft.public-demand.document-cycle.v1',state:'idle',approved:jobs.length,pending:0,...flags};
  const j=pending[0],stem=path.join(docs,j.key);
  let stage='acquisition',result;
  try{
   if(!fs.existsSync(stem+'.json')){
    const a=cli('./public-demand-pdf-canary.mjs',[j.parent,j.parent_sha256,docs,String(j.index)],65000);
    if(a.results?.length!==1||!a.results[0].receipt_sha256)throw Error('acquisition_held');
   }
   const raw=read(stem+'.json'),a=JSON.parse(raw);
   if(a.url!==j.job.url||a.parent_source!==j.job.parent_source||a.parent_receipt_sha256!==j.parent_sha256)throw Error('acquisition_binding_mismatch');
   stage='extraction';
   const e=resumePdfExtraction({receipt:stem+'.json',expectedSha:sha(raw)});
   if(e.state!=='extracted_requires_research'||!e.receipt_sha256)throw Error(e.state||'extraction_held');
   stage='review';
   const r=cli('./public-demand-review-packet.mjs',[stem+'.extraction-v1.json',e.receipt_sha256],15000);
   stage='triage';
   const t=runTriage({directory:docs,key:j.key,reviewSha:r.receipt_sha256});
   result={state:t.state,next_action:t.next_action,triage_receipt_sha256:t.receipt_sha256,review_receipt_sha256:r.receipt_sha256,deadline_date_candidates:t.deadline_date_candidates};
  }catch(e){result={state:'hold_document_cycle',stage,reason:String(e.message).slice(0,160),next_action:'operator_reconcile_before_retry'};}
  const record={schema:'evercraft.public-demand.document-cycle-receipt.v1',document_key:j.key,source_url:j.job.url,parent_receipt_sha256:j.parent_sha256,inbox_sha256:sha(manifestRaw),observed_at:new Date().toISOString(),...result,...flags};
  const file=path.join(cycles,j.key+'.json'),receipt_sha256=retain(file,record);
  return {schema:'evercraft.public-demand.document-cycle.v1',approved:jobs.length,pending:pending.length-1,processed:1,receipt:file,receipt_sha256,result:record,...flags};
 }finally{fs.rmdirSync(lock);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--root'||args[2]!=='--inbox')throw Error('usage: --root absolute_root --inbox absolute_inbox');
  if(!path.isAbsolute(args[3]))throw Error('absolute_inbox_required');
  console.log(JSON.stringify(runDocumentCycle({root:args[1],manifestFile:args[3]}),null,2));
 }catch(e){console.error(JSON.stringify({state:'hold_cycle',reason:String(e.message).slice(0,160),...flags}));process.exitCode=1;}
}
