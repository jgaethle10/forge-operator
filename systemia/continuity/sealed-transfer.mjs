#!/usr/bin/env node
// Evercraft Source Vault encrypted transfer v1.
// Local AES-256-GCM envelope using Node's built-in cryptography. No network or AI.
// Encrypts ONLY committed-source archive; not customer records or Identity state.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { inspectVault, verifyVault } from "./source-vault.mjs";

const MAGIC = Buffer.from("EVSVA001","ascii");
const HEAD = 24; // 8 bytes magic, 12-byte random nonce, 4-byte encrypted metadata length
const TAG = 16;
const MAX_META = 32768;
const BLOCK = 1024*1024;
const PRIVATE_DIR = 0o700;
const PRIVATE_FILE = 0o600;
const NAME = /^source-[a-f0-9]{12}-[a-f0-9]{12}\.bundle$/;
const SCHEMA = "evercraft.continuity.source-vault.v1";
const ENVELOPE = "evercraft.continuity.sealed-transfer.v1";
const isInside = (parent,child)=>{
  const rel=path.relative(parent,child);
  return rel===""||(!rel.startsWith(".."+path.sep)&&rel!==".."&&!path.isAbsolute(rel));
};
function statPrivate(target,kind){
  const s=fs.lstatSync(target);
  if(s.isSymbolicLink()||(s.mode&0o077)!==0||
     (kind==="file"&&!s.isFile())||(kind==="dir"&&!s.isDirectory()))
    throw Error("private_storage_required");
  return s;
}
function pathParent(file){
  if(!path.isAbsolute(file))throw Error("absolute_path_required");
  const parent=fs.realpathSync(path.dirname(path.resolve(file)));
  statPrivate(parent,"dir");
  return parent;
}
function keyBytes(file){
  pathParent(file); statPrivate(file,"file");
  const s=fs.readFileSync(file,"utf8").trim();
  if(!/^[a-f0-9]{64}$/.test(s))throw Error("secret_key_invalid");
  return Buffer.from(s,"hex");
}
function createOfflineKey({keyFile}={}){
  if(!keyFile)throw Error("key_path_required");
  pathParent(keyFile);
  const fd=fs.openSync(keyFile,"wx",PRIVATE_FILE);
  try{fs.writeFileSync(fd,crypto.randomBytes(32).toString("hex")+"\n");
      fs.fsyncSync(fd);}
  finally{fs.closeSync(fd);}
  return {ok:true,schema:ENVELOPE,state:"private_key_created",
    independent_key_custody_verified:false,key_material_returned:false};
}
function privateDir(target) {
  if(!path.isAbsolute(target))throw Error("absolute_path_required");
  if(fs.existsSync(target))throw Error("destination_already_exists");
  pathParent(target);
  fs.mkdirSync(target,{mode:PRIVATE_DIR});
  statPrivate(target,"dir");
}
function write(fd,bytes){
  let offset=0;
  while(offset<bytes.length){
    const n=fs.writeSync(fd,bytes,offset,bytes.length-offset);
    if(n<=0)throw Error("storage_write_failed");
    offset+=n;
  }
}
function cleanup(target){
  try{fs.rmSync(target,{recursive:true,force:true})}catch{}
}
function sealSourceVault({vault,output,keyFile}={}){
  if(!vault||!output||!keyFile)throw Error("sealed_transfer_arguments_required");
  const v=inspectVault(vault); // enforces mode, bytes and matching digest
  const parent=pathParent(output);
  if(isInside(v.dir,parent)||isInside(parent,v.dir))
    throw Error("sealed_transfer_destination_must_be_independent");
  if(fs.existsSync(output))throw Error("destination_already_exists");
  const key=keyBytes(keyFile);
  const metadata=Buffer.from(JSON.stringify(v.manifest),"utf8");
  if(metadata.length===0||metadata.length>MAX_META)throw Error("manifest_exceeds_envelope_limit");
  const iv=crypto.randomBytes(12);
  const header=Buffer.alloc(HEAD);
  MAGIC.copy(header,0);iv.copy(header,8);header.writeUInt32BE(metadata.length,20);
  const cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
  cipher.setAAD(header);
  const temp=path.join(parent,".evercraft-seal-"+crypto.randomBytes(12).toString("hex"));
  let srcFd, fd;
  try{
    fd=fs.openSync(temp,"wx",PRIVATE_FILE);
    write(fd,header);
    write(fd,cipher.update(metadata));
    srcFd=fs.openSync(v.archive,"r");
    const block=Buffer.allocUnsafe(BLOCK);
    let bytes;
    while((bytes=fs.readSync(srcFd,block,0,block.length,null))>0)
      write(fd,cipher.update(block.subarray(0,bytes)));
    write(fd,cipher.final());
    write(fd,cipher.getAuthTag());
    fs.fsyncSync(fd);
    fs.closeSync(fd);fd=undefined;
    fs.closeSync(srcFd);srcFd=undefined;
    fs.renameSync(temp,output);
    statPrivate(output,"file");
    return {ok:true,schema:ENVELOPE,state:"encrypted_copy_created",
      source_head:v.manifest.source_head,bundle_sha256:v.manifest.bundle_sha256,
      encrypted_bytes:fs.statSync(output).size,
      key_exported:false,plaintext_copy_created:false,
      independent_device_verified:false,offline_home_boot_verified:false,
      company_data_restored:false};
  }catch(e){cleanup(temp);throw e}
  finally{if(fd!==undefined)fs.closeSync(fd);if(srcFd!==undefined)fs.closeSync(srcFd);}
}
function recoverSealedVault({input,outputVault,keyFile}={}){
  if(!input||!outputVault||!keyFile)throw Error("sealed_restore_arguments_required");
  const parent=pathParent(outputVault);
  if(fs.existsSync(outputVault))throw Error("destination_already_exists");
  const fileStat=statPrivate(input,"file");
  if(fileStat.size<HEAD+TAG+1)throw Error("sealed_envelope_truncated");
  const key=keyBytes(keyFile);
  const ivHeader=Buffer.alloc(HEAD), tag=Buffer.alloc(TAG);
  const inFd=fs.openSync(input,"r");
  let temp,fd;
  try{
    if(fs.readSync(inFd,ivHeader,0,HEAD,0)!==HEAD||
       !ivHeader.subarray(0,8).equals(MAGIC))
      throw Error("sealed_envelope_header_invalid");
    const metaLen=ivHeader.readUInt32BE(20);
    if(metaLen<1||metaLen>MAX_META||fileStat.size<HEAD+TAG+metaLen+1)
      throw Error("sealed_envelope_size_invalid");
    if(fs.readSync(inFd,tag,0,TAG,fileStat.size-TAG)!==TAG)
      throw Error("sealed_envelope_tag_missing");
    const iv=ivHeader.subarray(8,20);
    const decipher=crypto.createDecipheriv("aes-256-gcm",key,iv);
    decipher.setAAD(ivHeader);decipher.setAuthTag(tag);
    const encryptedMeta=Buffer.alloc(metaLen);
    if(fs.readSync(inFd,encryptedMeta,0,metaLen,HEAD)!==metaLen)
      throw Error("sealed_metadata_unreadable");
    const plainMeta=decipher.update(encryptedMeta);
    // The archive name is unavailable until metadata is authenticated.
    // Temporary plaintext is confined to a mode 0700 directory and
    // destroyed on authentication or verification failure.
    temp=path.join(parent,".evercraft-unseal-"+crypto.randomBytes(12).toString("hex"));
    privateDir(temp);
    const archiveTmp=path.join(temp,".pending.bundle");
    fd=fs.openSync(archiveTmp,"wx",PRIVATE_FILE);
    let pos=HEAD+metaLen, remaining=fileStat.size-TAG-pos;
    const chunk=Buffer.allocUnsafe(BLOCK);
    while(remaining>0){
      const n=fs.readSync(inFd,chunk,0,Math.min(chunk.length,remaining),pos);
      if(n<=0)throw Error("sealed_envelope_truncated");
      write(fd,decipher.update(chunk.subarray(0,n)));
      pos+=n;remaining-=n;
    }
    write(fd,decipher.final()); // MUST authenticate before interpreting metadata
    fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    const manifest=JSON.parse(plainMeta.toString("utf8"));
    if(manifest.schema!==SCHEMA||manifest.state!=="local_bundle_verified"||
       !NAME.test(String(manifest.archive||""))||
       !/^[a-f0-9]{64}$/.test(String(manifest.bundle_sha256||""))||
       !/^[a-f0-9]{40,64}$/.test(String(manifest.source_head||""))||
       !/^[a-f0-9]{64}$/.test(String(manifest.source_refs_sha256||""))||
       !Number.isSafeInteger(manifest.bundle_bytes)||manifest.bundle_bytes<=0||
       manifest.committed_history_only!==true)
      throw Error("sealed_manifest_invalid");
    const archive=path.join(temp,manifest.archive);
    fs.renameSync(archiveTmp,archive);
    fs.writeFileSync(path.join(temp,manifest.archive+".json"),JSON.stringify(manifest)+"\n",
      {flag:"wx",mode:PRIVATE_FILE});
    fs.writeFileSync(path.join(temp,"latest.json"),JSON.stringify({
      schema:SCHEMA,manifest:manifest.archive+".json"})+"\n",{flag:"wx",mode:PRIVATE_FILE});
    const proof=verifyVault({vault:temp}); // independently clones + fsck + ref digest
    if(proof.source_head!==manifest.source_head)throw Error("sealed_restore_head_mismatch");
    fs.renameSync(temp,outputVault);
    temp=undefined;
    return {ok:true,schema:ENVELOPE,state:"encrypted_copy_restored_and_git_verified",
      source_head:manifest.source_head,bundle_sha256:manifest.bundle_sha256,
      local_git_restore_verified:true,github_required:false,external_ai_required:false,
      offline_home_boot_verified:false,customer_data_restored:false,
      independent_device_verified:false,plaintext_vault_now_present:true};
  }catch(e){if(temp)cleanup(temp);throw e}
  finally{fs.closeSync(inFd);if(fd!==undefined)fs.closeSync(fd);}
}
export {createOfflineKey,sealSourceVault,recoverSealedVault};
const main=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
const opt=(a,name)=>{const i=a.indexOf("--"+name);return i>=0?a[i+1]:""};
if(main){
 const [command,...args]=process.argv.slice(2);
 try{
  const result=command==="keygen"
    ? createOfflineKey({keyFile:opt(args,"key-file")})
    : command==="seal"
      ? sealSourceVault({vault:opt(args,"vault"),output:opt(args,"output"),keyFile:opt(args,"key-file")})
      : command==="unseal"
        ? recoverSealedVault({input:opt(args,"input"),outputVault:opt(args,"vault"),keyFile:opt(args,"key-file")})
        : (()=>{throw Error("usage_keygen_seal_unseal")})();
  process.stdout.write(JSON.stringify(result)+"\n");
 }catch(e){
  process.stderr.write(JSON.stringify({ok:false,state:"held",
    reason:String(e.message||"unknown_error").split(":")[0]})+"\n");
  process.exitCode=1;
 }
}
