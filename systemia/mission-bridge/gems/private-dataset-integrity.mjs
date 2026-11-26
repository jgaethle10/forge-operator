// GEMS competition dataset integrity gate, PRIVATE RUNNER ONLY.
// The caller must supply a server-owned registry record, never paths or hashes
// controlled by a chat mission. No network, worker execution or uploads.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Writable} from 'node:stream';

const ID=/^gems-data-[a-z0-9-]{8,60}$/;
const SHA=/^[a-f0-9]{64}$/;
const REQUIRED=['features','faults','submission_template'];
const DENIED=new Set(['.','..']);
const fail=reason=>Object.freeze({schema:'evercraft.gems.private-dataset-integrity.v1',
 state:'held',reason,verified:false,data_exposed:false});
const validFileName=n=>typeof n==='string'&&n.length<110&&
 /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:tif|tiff)$/.test(n)&&
 !DENIED.has(n)&&!n.includes('..');
const isWithin=(root,child)=>{
 const relative=path.relative(root,child);
 return relative!==''&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);
};
async function hashFile(file,maxBytes){
 const h=createHash('sha256');let total=0;
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.size<=0||st.size>maxBytes)
  throw Error('unsafe_or_oversize_dataset_file');
 await pipeline(fs.createReadStream(file,{flags:'r'}),new Writable({
  write(chunk,_enc,cb){total+=chunk.length;
   if(total>maxBytes)return cb(Error('dataset_stream_oversize'));
   h.update(chunk);cb();
  }
 }));
 if(total!==st.size)throw Error('dataset_changed_during_read');
 const after=fs.lstatSync(file);
 if(!after.isFile()||after.isSymbolicLink()||
   after.dev!==st.dev||after.ino!==st.ino||after.size!==st.size||
   after.mtimeMs!==st.mtimeMs)throw Error('dataset_changed_during_read');
 return {bytes:total,sha256:h.digest('hex')};
}
export async function verifyGemsPrivateDataset({datasetId,registryRecord,maxBytesPerFile=8_000_000_000}={}){
 if(!ID.test(datasetId||''))return fail('dataset_id_invalid');
 if(!Number.isSafeInteger(maxBytesPerFile)||maxBytesPerFile<1||
   maxBytesPerFile>8_000_000_000)return fail('size_budget_invalid');
 // Never derive the private root directory from the incoming mission request.
 if(!registryRecord||registryRecord.dataset_id!==datasetId||
  registryRecord.source!=='trusted_private_dataset_registry'||
  typeof registryRecord.root_dir!=='string'||
  !path.isAbsolute(registryRecord.root_dir))return fail('trusted_registry_required');
 const root=registryRecord.root_dir;
 let st;
 try{st=fs.lstatSync(root);}catch{return fail('private_dataset_root_missing')}
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o002)!==0)
  return fail('private_dataset_root_unsafe');
 const files=registryRecord.files;
 if(!files||typeof files!=='object'||Array.isArray(files)||
  Object.keys(files).length!==REQUIRED.length||
  REQUIRED.some(key=>!Object.hasOwn(files,key)))return fail('dataset_file_contract_invalid');
 const findings=[];
 for(const role of REQUIRED){
  const entry=files[role];
  if(!entry||!validFileName(entry.name)||!SHA.test(entry.sha256||''))
   return fail('dataset_manifest_invalid');
  const target=path.resolve(root,entry.name);
  if(!isWithin(root,target))return fail('dataset_path_denied');
  try{
   const result=await hashFile(target,maxBytesPerFile);
   if(result.sha256!==entry.sha256)return fail('dataset_hash_mismatch');
   findings.push({role,size_bytes:result.bytes,sha256:result.sha256});
  }catch{return fail('dataset_file_unreadable_or_mutated')}
 }
 const body={schema:'evercraft.gems.private-dataset-integrity.v1',
  state:'verified_read_only',verified:true,dataset_id:datasetId,
  file_evidence:findings,paths_in_receipt:false,
  data_exposed:false,network_called:false,worker_invoked:false};
 return Object.freeze({...body,receipt_sha256:createHash('sha256').update(
  JSON.stringify(body)).digest('hex')});
}
