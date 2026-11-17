#!/usr/bin/env node
/**
 * Evercraft owned-device recovery kit (Penguin -> NextGen).
 * Offline after committed tools are installed. No GitHub, AI, SSH, or provider APIs.
 * No production installs and no Identity/Passport/payment state operations.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { createVault, verifyVault } from "./source-vault.mjs";
import { createOfflineKey, sealSourceVault, recoverSealedVault } from "./sealed-transfer.mjs";
import { rehearseOfflineHome } from "./offline-hq-drill.mjs";

const SCHEMA="evercraft.continuity.device-field-kit.v1";
async function digestFile(filename){
 const hash=createHash("sha256");
 for await(const part of fs.createReadStream(filename))hash.update(part);
 return hash.digest("hex");
}

const COMMANDS=Object.freeze(["preflight","prepare","recover"]);
const TOOL_FILES=Object.freeze([
 "device-field-kit.mjs","source-vault.mjs","sealed-transfer.mjs","offline-hq-drill.mjs"
]);
const sameOrInside=(a,b)=>{
 const rel=path.relative(a,b);
 return !rel||(!rel.startsWith(".."+path.sep)&&rel!==".."&&!path.isAbsolute(rel));
};
function secureDir(target,{create=false}={}){
 if(typeof target!=="string"||!path.isAbsolute(target))
   throw Error("absolute_private_directory_required");
 if(create)fs.mkdirSync(target,{recursive:true,mode:0o700});
 const st=fs.lstatSync(target);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)
   throw Error("private_directory_permissions_required");
 return fs.realpathSync(target);
}
function localGit(dir,args){
 const r=spawnSync("git",args,{
   cwd:dir,encoding:"utf8",timeout:15000,maxBuffer:1024*1024,
   env:{PATH:process.env.PATH||"/usr/bin:/bin",HOME:dir,
     GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:os.devNull,
     GIT_TERMINAL_PROMPT:"0",GIT_ALLOW_PROTOCOL:"file",
     GIT_LFS_SKIP_SMUDGE:"1"},
 });
 if(r.error||r.status!==0)throw Error("local_git_unavailable_or_invalid_repository");
 return r.stdout.trim();
}
export function preflightDevice({repo}={}){
 if(!repo||!path.isAbsolute(repo))throw Error("absolute_repo_required");
 const root=fs.realpathSync(repo);
 const top=localGit(root,["rev-parse","--show-toplevel"]);
 if(fs.realpathSync(top)!==root)throw Error("repository_root_required");
 const head=localGit(root,["rev-parse","HEAD"]);
 if(!/^[a-f0-9]{40}$/.test(head))throw Error("source_head_invalid");
 if(localGit(root,["rev-parse","--is-shallow-repository"])!=="false")
   throw Error("source_history_is_shallow");
 if(localGit(root,["status","--porcelain","--untracked-files=no"]))
   throw Error("tracked_changes_not_in_backup");
 const refs=localGit(root,["for-each-ref","--format=%(refname)"]);
 if(!refs)throw Error("no_committed_refs");
 if(Number(process.versions.node.split(".")[0])<22)
   throw Error("node22_required");
 return {
   schema:SCHEMA,state:"device_preflight_passed",ok:true,
   source_head:head,full_local_git_history:true,
   tracked_files_clean:true,
   untracked_files_included:false,
   node_version_major:Number(process.versions.node.split(".")[0]),
   git_remote_required:false,
   node_ownership_verified:false,
   private_business_state_included:false,
 };
}
function storeReceipt(dir,kind,record){
 const destination=secureDir(dir,{create:true});
 const id=randomBytes(8).toString("hex");
 const receiptName=kind+"-"+id+".json";
 const file=path.join(destination,receiptName);
 const fd=fs.openSync(file,"wx",0o600);
 try{fs.writeFileSync(fd,JSON.stringify(record,null,2)+"\n");fs.fsyncSync(fd);}
 finally{fs.closeSync(fd);}
 return receiptName;
}
function stageTools(dir){
 const target=secureDir(dir,{create:true});
 const sourceDir=path.dirname(fileURLToPath(import.meta.url));
 for(const name of TOOL_FILES){
   const from=path.join(sourceDir,name),to=path.join(target,name);
   const st=fs.lstatSync(from);
   if(!st.isFile()||st.isSymbolicLink())throw Error("recovery_tool_untrusted");
   if(fs.existsSync(to)){
     const existing=fs.lstatSync(to);
     if(!existing.isFile()||existing.isSymbolicLink()||(existing.mode&0o077)!==0)
       throw Error("staged_tool_untrusted");
     const digest=buffer=>createHash("sha256").update(buffer).digest("hex");
     if(digest(fs.readFileSync(from))!==digest(fs.readFileSync(to)))
       throw Error("recovery_tool_version_conflict");
     continue;
   }
   fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);
   fs.chmodSync(to,0o600);
 }
 return Object.fromEntries(TOOL_FILES.map(name=>[name,createHash("sha256").update(fs.readFileSync(path.join(target,name))).digest("hex")]));
}
export async function preparePenguin({
 repo,state,now=()=>new Date()
}={}){
 const preflight=preflightDevice({repo});
 const root=secureDir(state,{create:true});
 const repoRoot=fs.realpathSync(repo);
 if(sameOrInside(repoRoot,root)||sameOrInside(root,repoRoot))
   throw Error("recovery_state_must_be_outside_repository");
 const vault=secureDir(path.join(root,"vault"),{create:true});
 const keyDir=secureDir(path.join(root,"private-key"),{create:true});
 const output=secureDir(path.join(root,"transfer"),{create:true});
 const receipts=secureDir(path.join(root,"receipts"),{create:true});
 const key=path.join(keyDir,"recovery.key");
 if(!fs.existsSync(key))createOfflineKey({keyFile:key});
 const archive=createVault({repo:repoRoot,vault});
 const locallyVerified=verifyVault({vault});
 if(!locallyVerified.ok||locallyVerified.source_head!==archive.source_head)
   throw Error("new_vault_not_verified");
 const random=randomBytes(6).toString("hex");
 const sealedName="evercraft-source-"+preflight.source_head.slice(0,12)+"-"+random+".evsealed";
 const sealedPath=path.join(output,sealedName);
 const sealed=sealSourceVault({vault,output:sealedPath,keyFile:key});
 const tools=path.join(output,"tools");
 const toolDigests=stageTools(tools);
 const encryptedDigest=await digestFile(sealedPath);
 const timestamp=now().toISOString();
 const result={
   schema:SCHEMA,ok:true,state:"penguin_source_prepared_for_encrypted_transfer",
   observed_at:timestamp,source_head:archive.source_head,
   archive_sha256:archive.bundle_sha256,
   sealed_file:sealedName,encrypted_file_sha256:encryptedDigest,
   recovery_tool_sha256:toolDigests,staged_tool_count:TOOL_FILES.length,
   encrypted_transfer_created:sealed.ok,
   local_independent_source_restore_verified:locallyVerified.ok,
   physical_transfer_to_nextgen_verified:false,
   independent_key_custody_verified:false,
   actual_nextgen_recovery_verified:false,
   github_required_for_local_restore:false,
   chatgpt_required_for_local_restore:false,
   customer_data_included:false,
   production_deployed:false,
   key_material_returned:false,
 };
 const receipt=storeReceipt(receipts,"penguin-prepared",result);
 return {...result,receipt_file:receipt,
   next_step:"Copy sealed file and tools to NextGen. Deliver private key separately. Never send key bytes to ChatGPT or GitHub."};
}
export async function recoverNextGen({sealed,keyFile,state,expectedEncryptedSha256,now=()=>new Date()}={}){
 if(typeof sealed!=="string"||!path.isAbsolute(sealed))
   throw Error("absolute_sealed_input_required");
 if(typeof keyFile!=="string"||!path.isAbsolute(keyFile))
   throw Error("absolute_key_file_required");
 if(typeof expectedEncryptedSha256!=="string"||!/^[a-f0-9]{64}$/.test(expectedEncryptedSha256))
   throw Error("penguin_ciphertext_fingerprint_required");
 if(await digestFile(sealed)!==expectedEncryptedSha256)
   throw Error("encrypted_copy_digest_mismatch");
 const root=secureDir(state,{create:true});
 if(sameOrInside(root,path.resolve(sealed))||
    sameOrInside(root,path.resolve(keyFile)))
   throw Error("recovery_state_must_be_separate_from_inputs");
 const vault=path.join(root,"recovered-vault-"+randomBytes(6).toString("hex"));
 const unsealed=recoverSealedVault({input:sealed,outputVault:vault,keyFile});
 if(!unsealed.ok)throw Error("encrypted_archive_restore_held");
 const source=verifyVault({vault});
 if(source.source_head!==unsealed.source_head)
   throw Error("cross_device_source_mismatch");
 const drilled=await rehearseOfflineHome({vault});
 if(!drilled.ok||drilled.source_head!==source.source_head)
   throw Error("offline_home_boot_held");
 const result={
   schema:SCHEMA,ok:true,state:"nextgen_local_source_restored_and_home_booted",
   observed_at:now().toISOString(),source_head:source.source_head,
   archive_sha256:source.bundle_sha256,
   encryption_authenticated:true,
   independent_source_restore_verified:true,
   local_home_boot_verified:true,
   loopback_only:true,
   physical_network_disconnection_verified:false,
   independent_device_identity_cryptographically_verified:false,
   production_deployed:false,
   company_data_restored:false,
   identity_or_passport_restored:false,
   offsite_copy_verified:false,
   github_required_for_local_restore:false,
   chatgpt_required_for_local_restore:false,
   key_material_returned:false,
 };
 const receipt=storeReceipt(path.join(root,"receipts"),"nextgen-recovered",result);
 return {...result,receipt_file:receipt,
   next_step:"Inspect this local recovery receipt and arrange separate encrypted backup of business state. Production stays unchanged."};
}
const opt=(args,key)=>{const i=args.indexOf("--"+key);return i>=0?args[i+1]:""};
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,...args]=process.argv.slice(2);
 Promise.resolve().then(()=>{
   if(!COMMANDS.includes(command))throw Error("usage_preflight_prepare_recover");
   if(command==="preflight")return preflightDevice({repo:opt(args,"repo")});
   if(command==="prepare")return preparePenguin({repo:opt(args,"repo"),state:opt(args,"state")});
   return recoverNextGen({
     sealed:opt(args,"sealed"),keyFile:opt(args,"key-file"),
     expectedEncryptedSha256:opt(args,"expected-sha256"),state:opt(args,"state")
   });
 }).then(result=>process.stdout.write(JSON.stringify(result,null,2)+"\n"))
   .catch(e=>{
     process.stderr.write(JSON.stringify({ok:false,state:"held",
       reason:String(e?.message||"field_drill_failed").split(":")[0]})+"\n");
     process.exitCode=1;
   });
}
