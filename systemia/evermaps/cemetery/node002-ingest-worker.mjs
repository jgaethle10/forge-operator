// Proposed Node002-only cemetery workload. Not registered by importing this module.
// Fixed local importer, fixed warehouse, no caller-provided path, command or URL.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const CEMETERY_WORKLOAD='systemia.evermaps-cemetery-ingest.v1';
const NODE='evercraft-node002-nextgen';
const SCHEMA='evercraft.evermaps.cemetery-node002-request.v1';
const importer=fileURLToPath(new URL('./va-ingest-canary.py',import.meta.url));
const hash=x=>createHash('sha256').update(x).digest('hex');
export function validateCemeteryRequest(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).sort().join(',')!=='operation,schema'||p.schema!==SCHEMA||!['readiness','ingest_batch'].includes(p.operation))throw Error('cemetery_request_denied');
 return p.operation;
}
export function createCemeteryNodeWorker({nodeId,warehouse,enabled=false,spawn=spawnSync}={}){
 if(nodeId!==NODE||!warehouse||!path.isAbsolute(warehouse))throw Error('cemetery_node_scope_denied');
 const root=path.resolve(warehouse),registry=path.join(root,'registry'),receipts=path.join(root,'receipts');
 function privateDir(dir){const s=fs.lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077))throw Error('cemetery_private_directory_required')}
 return {execute({payload,idempotencyKey}={}){
  if(enabled!==true)throw Error('cemetery_workload_disabled');
  const operation=validateCemeteryRequest(payload);
  if(!/^[A-Za-z0-9._:-]{12,128}$/.test(idempotencyKey||''))throw Error('cemetery_job_key_invalid');
  for(const d of [root,registry,receipts])privateDir(d);
  const key=hash(NODE+'|'+idempotencyKey),file=path.join(receipts,key+'.json');
  const request_hash=hash(JSON.stringify({nodeId,idempotencyKey,operation}));
  if(fs.existsSync(file)){
   const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077))throw Error('cemetery_receipt_unsafe');
   const r=JSON.parse(fs.readFileSync(file,'utf8'));const {receipt_hash,...body}=r;
   if(r.request_hash!==request_hash||receipt_hash!==hash(JSON.stringify(body)))throw Error('cemetery_receipt_conflict');
   return r;
  }
  const lock=path.join(receipts,'warehouse-writer.lock');
  // Keep a failed/interrupted attempt locked for reconciliation, not blind replay.
  const fd=fs.openSync(lock,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({request_hash,operation}));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
  const db=path.join(registry,'va-gravesite-canary.sqlite3');
  const st=fs.lstatSync(db);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077))throw Error('cemetery_database_not_admitted');
  if(fs.statfsSync(root).bavail*fs.statfsSync(root).bsize<1024**3)throw Error('cemetery_disk_floor');
  if(st.size>=20*1024**3)throw Error('cemetery_database_budget');
  const check=spawn('python3',['-c','import sqlite3,sys; from pathlib import Path; d=sqlite3.connect(Path(sys.argv[1]).as_uri()+"?mode=ro",uri=True); print(d.execute("SELECT cursor FROM checkpoint WHERE id=1").fetchone()[0])',db],{encoding:'utf8',timeout:10000,maxBuffer:4096});
  if(check.status!==0||!/^\\d+$/.test(check.stdout.trim()))throw Error('cemetery_checkpoint_unverified');
  let result={cursor:Number(check.stdout.trim()),rows_imported:0};
  if(operation==='ingest_batch'){
   const p=spawn('python3',[importer,'--out',registry],{encoding:'utf8',timeout:90000,maxBuffer:16384});
   if(p.status!==0||p.error)throw Error('cemetery_ingest_reconciliation_required');
   const r=JSON.parse(p.stdout);
   if(r.cursor_before!==result.cursor||!Number.isSafeInteger(r.rows_imported)||r.rows_imported<0||r.rows_imported>250||r.cursor_after<r.cursor_before||r.public_release!==false)throw Error('cemetery_result_invalid');
   result={cursor:r.cursor_after,rows_imported:r.rows_imported,total:r.total,source_sha256:r.sha256};
  }
  const body={schema:'evercraft.cemetery.node002-worker-receipt.v1',node_id:NODE,workload_class:CEMETERY_WORKLOAD,request_hash,idempotency_key:idempotencyKey,operation,result,public_release:false,completed_at:new Date().toISOString()};
  const receipt={...body,receipt_hash:hash(JSON.stringify(body))};
  const out=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(out,JSON.stringify(receipt));fs.fsyncSync(out)}finally{fs.closeSync(out)}
  fs.unlinkSync(lock);
  return receipt;
 }};
}
