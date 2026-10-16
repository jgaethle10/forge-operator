/**
 * Offline REVIEW-HELD source custody check, never an installer or worker.
 * Validate an independently pinned GitHub source archive before anyone
 * considers copying source to Node002. Never read private keys or execute
 * archive contents. All acceptance still leaves remote execution forbidden.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const HASH=/^[a-f0-9]{64}$/;
const COMMIT=/^[a-f0-9]{40}$/;
const ROOT='systemia/compute/';
const MODULE='systemia/compute/node002-inventory-review/operator-inventory.mjs';
const HEADER=512;
const MAX_BYTES=3*1024*1024;
function hexHash(value){const s=String(value||'').replace(/^sha256:/,'');if(!HASH.test(s))fail('expected_hash_invalid');return s;}
function readText(block){
 const stop=block.indexOf(0);
 return block.subarray(0,stop<0?block.length:stop).toString('utf8');
}
function octal(block){
 const s=readText(block).trim();
 if(!/^[0-7]+$/.test(s))fail('tar_octal_invalid');
 return parseInt(s,8);
}
function parseTar(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<1024||bytes.length>MAX_BYTES||bytes.length%512!==0)fail('tar_size_invalid');
 const files=new Map();
 let offset=0,terminal=false;
 while(offset<bytes.length){
  const header=bytes.subarray(offset,offset+HEADER);
  if(header.every(n=>n===0)){
   if(!bytes.subarray(offset).every(n=>n===0))fail('tar_padding_invalid');
   if(bytes.length-offset<1024)fail('tar_terminator_missing');
   terminal=true;break;
  }
  const stated=octal(header.subarray(148,156));
  let actual=0;
  for(let i=0;i<HEADER;i++)actual+=(i>=148&&i<156)?32:header[i];
  if(stated!==actual)fail('tar_header_checksum_invalid');
  if(readText(header.subarray(257,263))!=='ustar')fail('tar_format_invalid');
  const entryType=String.fromCharCode(header[156]);
  if(entryType!=='0'&&entryType!=='\0')fail('tar_non_regular_entry');
  const name=readText(header.subarray(0,100));
  const prefix=readText(header.subarray(345,500));
  const file=prefix?prefix+'/'+name:name;
  if(!file.startsWith(ROOT)||!/^[-a-zA-Z0-9_./]+$/.test(file)||
    file.includes('..')||file.endsWith('/')||file.includes('//'))fail('tar_member_name_invalid');
  if(files.has(file))fail('tar_duplicate_member');
  if(files.size>=24)fail('tar_too_many_members');
  const size=octal(header.subarray(124,136));
  if(size<0||size>512*1024)fail('tar_member_size_invalid');
  const start=offset+HEADER,end=start+size;
  if(end>bytes.length)fail('tar_member_truncated');
  files.set(file,bytes.subarray(start,end));
  offset=start+Math.ceil(size/HEADER)*HEADER;
 }
 if(!terminal||files.size<5||!files.has(MODULE))fail('source_bundle_incomplete');
 return files;
}
function parseManifest(text){
 if(typeof text!=='string'||text.length>12000)fail('checksum_manifest_invalid');
 const out=new Map();
 const rows=text.trim().split(/\r?\n/);
 for(const row of rows){
  const m=row.match(/^([0-9a-f]{64})  (systemia\/compute\/[-a-zA-Z0-9_./]+)$/);
  if(!m||m[2].includes('..')||out.has(m[2]))fail('checksum_manifest_invalid');
  out.set(m[2],m[1]);
 }
 if(!out.size)fail('checksum_manifest_empty');
 return out;
}
function readRef(text){
 if(typeof text!=='string'||text.length>1024)fail('source_ref_invalid');
 const entries=text.trim().split(/\r?\n/);
 if(entries.length!==4)fail('source_ref_invalid');
 const map=new Map();
 for(const line of entries){
  const ix=line.indexOf('=');
  if(ix<1)fail('source_ref_invalid');
  const k=line.slice(0,ix),v=line.slice(ix+1);
  if(map.has(k))fail('source_ref_duplicate');map.set(k,v);
 }
 if(map.size!==4||!COMMIT.test(map.get('git_head_sha')||'')||
  map.get('release_state')!=='REVIEW_HELD'||
  map.get('worker_authorized')!=='false'||
  map.get('physical_execution_proven')!=='false')fail('source_ref_invalid');
 return map.get('git_head_sha');
}
/** Caller must pin SHA256 + HEAD outside this editable archive. */
export function verifySourceCustodyCandidate({
 archiveBytes,sha256SumsText,sourceRefText,
 expectedArchiveSha256,expectedCommitSha,approvedAdapterSha256,
}={}){
 const expectedArchive=hexHash(expectedArchiveSha256);
 const policyAdapter=hexHash(approvedAdapterSha256);
 if(!COMMIT.test(expectedCommitSha||''))fail('expected_commit_invalid');
 if(sha(archiveBytes)!==expectedArchive)fail('archive_pin_mismatch');
 const files=parseTar(archiveBytes);
 const manifest=parseManifest(sha256SumsText);
 if(manifest.size!==files.size)fail('manifest_member_set_mismatch');
 for(const [file,data] of files){
  if(!manifest.has(file)||manifest.get(file)!==sha(data))fail('member_hash_mismatch');
 }
 const head=readRef(sourceRefText);
 if(head!==expectedCommitSha)fail('source_commit_pin_mismatch');
 const actualAdapter=sha(files.get(MODULE));
 return Object.freeze({
  schema:'evercraft.node002.source-custody-review.v1',
  source_archive_sha256:'sha256:'+expectedArchive,
  source_commit:head,
  source_files_verified:files.size,
  candidate_adapter_sha256:'sha256:'+actualAdapter,
  separately_pinned_policy_adapter_sha256:'sha256:'+policyAdapter,
  source_integrity_verified:true,
  pinned_adapter_matches_existing_policy:actualAdapter===policyAdapter,
  mode:'REVIEW_HELD',
  approved_for_machine_installation:false,
  authorized_for_execution:false,
  physical_device_attested:false,
  evidence_level:'source_integrity_only_not_source_origin_authentication',
 });
}
const cli=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(cli){
 try{
  const args=process.argv.slice(2);
  if(args.length!==8||args[0]!=='--bundle-dir'||args[2]!=='--expected-archive-sha256'||args[4]!=='--expected-commit'||args[6]!=='--policy-adapter-sha256'){
   fail('usage: --bundle-dir DIR --expected-archive-sha256 SHA256 --expected-commit 40HEX --policy-adapter-sha256 SHA256');
  }
  const dir=path.resolve(args[1]);
  // Explicit separate pin required, never infer the adapter trust from artifact.
  const pin=args[7];
  const output=verifySourceCustodyCandidate({
   archiveBytes:fs.readFileSync(path.join(dir,'node002-source-review.tar')),
   sha256SumsText:fs.readFileSync(path.join(dir,'SHA256SUMS.txt'),'utf8'),
   sourceRefText:fs.readFileSync(path.join(dir,'SOURCE_REF.txt'),'utf8'),
   expectedArchiveSha256:args[3],expectedCommitSha:args[5],approvedAdapterSha256:pin,
  });
  console.log(JSON.stringify(output,null,2));
  // A code hash mismatch cannot be used to claim approval, even if source
  // integrity is verified and the review bundle is otherwise well-formed.
  if(!output.pinned_adapter_matches_existing_policy)process.exitCode=3;
 }catch(err){
  console.error(JSON.stringify({ok:false,code:err.code||'source_custody_preflight_failed',mode:'REVIEW_HELD',authorized_for_execution:false}));
  process.exitCode=2;
 }
}
