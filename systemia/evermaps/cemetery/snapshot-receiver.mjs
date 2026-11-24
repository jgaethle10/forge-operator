// Receiver for the bounded cemetery migration protocol. The resident must
// authenticate the caller and authorize this exact workload before invocation.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {restoreCemeterySnapshot} from './snapshot-restore.mjs';
export const CEMETERY_RESTORE_WORKLOAD='systemia.evermaps-cemetery-restore.v1';
const NODE='evercraft-node002-nextgen', CHUNK=24*1024, MAX=1024*1024;
const sha=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const validDigest=d=>typeof d==='string'&&/^sha256:[a-f0-9]{64}$/.test(d);
function privateDir(d){const s=fs.lstatSync(d);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077))throw Error('migration_private_directory_required')}
function readPrivate(file,max){const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const s=fs.fstatSync(fd);if(!s.isFile()||(s.mode&0o077)||s.size>max)throw Error('migration_private_file_required');return fs.readFileSync(fd)}finally{fs.closeSync(fd)}}
function put(file,bytes){
 const tmp=file+'.'+randomBytes(12).toString('hex');
 try{
 const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 try{fs.linkSync(tmp,file)}catch(e){if(e.code!=='EEXIST')throw e;if(!readPrivate(file,bytes.length).equals(bytes))throw Error('migration_chunk_conflict')}
 const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d)}finally{fs.closeSync(d)}
 }finally{try{fs.unlinkSync(tmp)}catch(e){if(e.code!=='ENOENT')throw e}}
}
export function createCemeterySnapshotReceiver({nodeId,warehouse,approvedDigest,enabled=false}={}){
 if(nodeId!==NODE||!warehouse||!path.isAbsolute(warehouse)||!validDigest(approvedDigest))throw Error('migration_scope_denied');
 return {execute({payload,idempotencyKey}={}){
  if(enabled!==true)throw Error('migration_disabled');
  const m=payload?.manifest;
  if(!m||Object.keys(m).sort().join(',')!=='byte_count,chunk_count,object_sha256,schema'||m.schema!=='evercraft.cemetery.migration.v1'||m.object_sha256!==approvedDigest||!Number.isSafeInteger(m.byte_count)||m.byte_count<100||m.byte_count>MAX||m.chunk_count!==Math.ceil(m.byte_count/CHUNK))throw Error('migration_manifest_invalid');
  const op=payload.operation;
  if(op!=='stage_chunk'&&op!=='restore')throw Error('migration_operation_denied');
  const expectedKeys=op==='stage_chunk'?'bytes_base64,chunk_sha256,index,manifest,operation':'manifest,operation';
  if(Object.keys(payload).sort().join(',')!==expectedKeys)throw Error('migration_fields_denied');
  const suffix=op==='restore'?'restore':String(payload.index);
  if(idempotencyKey!==approvedDigest.slice(7)+':'+suffix)throw Error('migration_identity_invalid');
  let bytes;
  if(op==='stage_chunk'){
   const i=payload.index;
   if(!Number.isSafeInteger(i)||i<0||i>=m.chunk_count||!validDigest(payload.chunk_sha256)||typeof payload.bytes_base64!=='string'||payload.bytes_base64.length>CHUNK*4/3+4)throw Error('migration_chunk_invalid');
   bytes=Buffer.from(payload.bytes_base64,'base64');
   if(bytes.toString('base64')!==payload.bytes_base64||bytes.length!==Math.min(CHUNK,m.byte_count-i*CHUNK)||sha(bytes)!==payload.chunk_sha256)throw Error('migration_chunk_integrity_failed');
  }
  privateDir(warehouse);
  const root=path.join(warehouse,'migration-'+approvedDigest.slice(7));
  try{fs.mkdirSync(root,{mode:0o700})}catch(e){if(e.code!=='EEXIST')throw e}privateDir(root);
  put(path.join(root,'manifest.json'),Buffer.from(JSON.stringify({schema:m.schema,object_sha256:m.object_sha256,byte_count:m.byte_count,chunk_count:m.chunk_count})));
  if(op==='stage_chunk'){
   put(path.join(root,String(payload.index)+'.chunk'),bytes);
   return {node_id:NODE,object_sha256:approvedDigest,index:payload.index,chunk_sha256:payload.chunk_sha256,stored:true};
  }
  const pieces=[];
  for(let i=0;i<m.chunk_count;i++){const b=readPrivate(path.join(root,i+'.chunk'),CHUNK);if(b.length!==Math.min(CHUNK,m.byte_count-i*CHUNK))throw Error('migration_chunk_size_invalid');pieces.push(b)}
  const body=Buffer.concat(pieces);
  if(body.length!==m.byte_count||sha(body)!==approvedDigest)throw Error('migration_object_integrity_failed');
  return restoreCemeterySnapshot({nodeId,warehouse,bytes:body,expectedDigest:approvedDigest,enabled:true});
 }};
}
