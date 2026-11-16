#!/usr/bin/env node
/**
 * Evercraft Sovereign Source Vault v1.
 * Local-only Git history custody and independent restore proof.
 * NEVER invokes GitHub, curl, ssh or any network transport.
 * Stores only committed Git objects/refs, not databases or working-tree edits.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCHEMA = "evercraft.continuity.source-vault.v1";
const HASH = /^[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40,64}$/;
const ARCHIVE = /^source-[a-f0-9]{12}-[a-f0-9]{12}\.bundle$/;
const MODE = 0o700;
const FILE_MODE = 0o600;
const MAX_BUFFER = 64 * 1024 * 1024;
const MAX_MANIFEST = 32 * 1024;
const parseJson = file => JSON.parse(fs.readFileSync(file,"utf8"));
const sha = file => {
  const hash=crypto.createHash("sha256");
  const fd=fs.openSync(file,"r");
  try{
    const buf=Buffer.allocUnsafe(1024*1024);
    let read;
    while((read=fs.readSync(fd,buf,0,buf.length,null))>0)hash.update(buf.subarray(0,read));
  }finally{fs.closeSync(fd)}
  return hash.digest("hex");
};
const run=(cwd,args,{allowFailure=false}={})=>{
  const result=spawnSync("git",args,{cwd,encoding:"utf8",maxBuffer:MAX_BUFFER,timeout:180000,
    env:{...process.env,GIT_TERMINAL_PROMPT:"0",GIT_CONFIG_NOSYSTEM:"1"}});
  if(result.error)throw new Error("git_process_unavailable");
  if(!allowFailure && result.status!==0)throw new Error("git_operation_failed:"+args[0]);
  return {ok:result.status===0,out:String(result.stdout||"").trim()};
};
function within(parent,child){
  const relative=path.relative(parent,child);
  return relative==="" || (relative!==".." && !relative.startsWith(".."+path.sep) && !path.isAbsolute(relative));
}
function safeDirectory(directory,{create=false}={}){
  const full=path.resolve(directory);
  if(create)fs.mkdirSync(full,{recursive:true,mode:MODE});
  const st=fs.lstatSync(full);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)
    throw new Error("vault_directory_not_private");
  return fs.realpathSync(full);
}
function safeFile(file){
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0)
    throw new Error("vault_file_not_private");
  return st;
}
function atomicWrite(file,text){
  const parent=path.dirname(file);
  const temporary=path.join(parent,".tmp-"+crypto.randomBytes(12).toString("hex"));
  const fd=fs.openSync(temporary,"wx",FILE_MODE);
  try{fs.writeFileSync(fd,text,"utf8");fs.fsyncSync(fd);}
  finally{fs.closeSync(fd);}
  try{
    if(fs.existsSync(file))throw new Error("vault_file_already_exists");
    fs.renameSync(temporary,file);
  }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
function inspectRepo(raw){
  const root=fs.realpathSync(path.resolve(raw));
  const res=run(root,["rev-parse","--show-toplevel"]);
  if(fs.realpathSync(res.out)!==root)throw new Error("repository_root_required");
  if(run(root,["rev-parse","--is-shallow-repository"]).out==="true")
    throw new Error("shallow_repository_incomplete");
  if(run(root,["status","--porcelain","--untracked-files=no"]).out)
    throw new Error("uncommitted_tracked_changes_not_in_bundle");
  const head=run(root,["rev-parse","HEAD"]).out;
  if(!SHA.test(head))throw new Error("repository_head_invalid");
  const refs=run(root,["for-each-ref","--format=%(refname) %(objectname)"]).out;
  if(!refs)throw new Error("repository_refs_missing");
  return {root,head,refs,ref_hash:crypto.createHash("sha256").update(refs).digest("hex")};
}
function createVault({repo,vault}){
  if(!repo||!vault)throw new Error("repo_and_vault_required");
  const inspected=inspectRepo(repo);
  const requested=path.resolve(vault);
  if(within(inspected.root,requested) || within(requested,inspected.root))
    throw new Error("vault_must_be_outside_source_tree");
  const directory=safeDirectory(requested,{create:true});
  if(within(inspected.root,directory)||within(directory,inspected.root))
    throw new Error("vault_must_be_independent");
  const runId=crypto.randomBytes(6).toString("hex");
  const name="source-"+inspected.head.slice(0,12)+"-"+runId+".bundle";
  const bundle=path.join(directory,name);
  // Git opens a new file directly; ensure no existing path, then make it private.
  if(fs.existsSync(bundle))throw new Error("bundle_already_exists");
  try{
    run(inspected.root,["bundle","create",bundle,"--all"]);
    fs.chmodSync(bundle,FILE_MODE);
    safeFile(bundle);
    const verify=run(inspected.root,["bundle","verify",bundle]);
    if(!verify.ok)throw new Error("git_bundle_invalid");
    const manifest={
      schema:SCHEMA,
      state:"local_bundle_verified",
      archive:name,
      bundle_sha256:sha(bundle),
      bundle_bytes:fs.statSync(bundle).size,
      source_head:inspected.head,
      source_refs_sha256:inspected.ref_hash,
      created_at:new Date().toISOString(),
      committed_history_only:true,
      customer_data_included:false,
      offsite_copy_verified:false,
      encrypted_at_rest_verified:false,
      restored_independently:false,
      provider_services_required:false,
    };
    // Every manifest is unique and immutable; latest only points to an existing manifest.
    const manifestFile=name+".json";
    atomicWrite(path.join(directory,manifestFile),JSON.stringify(manifest,null,2)+"\n");
    const latest=path.join(directory,"latest.json");
    const tmp=path.join(directory,".latest-"+runId);
    atomicWrite(tmp,JSON.stringify({schema:SCHEMA,manifest:manifestFile})+"\n");
    if(fs.existsSync(latest))safeFile(latest);
    fs.renameSync(tmp,latest);
    return {ok:true,state:manifest.state,source_head:manifest.source_head,
      bundle_sha256:manifest.bundle_sha256,bundle_bytes:manifest.bundle_bytes,
      manifest:manifestFile,restored_independently:false,offsite_copy_verified:false};
  }catch(error){
    if(fs.existsSync(bundle))fs.unlinkSync(bundle);
    throw error;
  }
}
function inspectVault(vault){
  const dir=safeDirectory(vault);
  const pointerFile=path.join(dir,"latest.json");
  safeFile(pointerFile);
  const pointer=parseJson(pointerFile);
  if(pointer.schema!==SCHEMA || typeof pointer.manifest!=="string" ||
     !/^source-[a-f0-9]{12}-[a-f0-9]{12}\.bundle\.json$/.test(pointer.manifest))
    throw new Error("vault_manifest_pointer_invalid");
  const manifestFile=path.join(dir,pointer.manifest);
  if(safeFile(manifestFile).size>MAX_MANIFEST)throw new Error("vault_manifest_too_large");
  const manifest=parseJson(manifestFile);
  if(manifest.schema!==SCHEMA||manifest.state!=="local_bundle_verified" ||
     !ARCHIVE.test(String(manifest.archive||"")) ||
     manifest.archive+".json"!==pointer.manifest ||
     !HASH.test(String(manifest.bundle_sha256||"")) ||
     !SHA.test(String(manifest.source_head||"")) ||
     !HASH.test(String(manifest.source_refs_sha256||"")) ||
     manifest.committed_history_only!==true)
    throw new Error("vault_manifest_untrusted");
  const archive=path.join(dir,manifest.archive);
  const st=safeFile(archive);
  if(st.size!==manifest.bundle_bytes||sha(archive)!==manifest.bundle_sha256)
    throw new Error("vault_bundle_integrity_failed");
  return {dir,archive,manifest};
}
function verifyVault({vault}){
  const v=inspectVault(vault);
  // Independent clone is a proof that GitHub, upstream remotes and the original
  // checkout are unnecessary for locally restoring the committed source.
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-source-recovery-"));
  try{
    const bare=path.join(parent,"restored.git");
    run(parent,["clone","--mirror","--no-local",v.archive,bare]);
    run(bare,["fsck","--full","--no-reflogs"]);
    const refs=run(bare,["for-each-ref","--format=%(refname) %(objectname)"]).out;
    const refHash=crypto.createHash("sha256").update(refs).digest("hex");
    if(refHash!==v.manifest.source_refs_sha256)
      throw new Error("restored_ref_set_mismatch");
    if(!run(bare,["cat-file","-e",v.manifest.source_head+"^{commit}"]).ok)
      throw new Error("restored_head_missing");
    return {ok:true,state:"local_offline_restore_proved",source_head:v.manifest.source_head,
      bundle_sha256:v.manifest.bundle_sha256,verified_refs_digest:refHash,
      github_required:false,external_ai_required:false,
      customer_data_restore_verified:false,offsite_copy_verified:false};
  }finally{fs.rmSync(parent,{recursive:true,force:true});}
}
function restoreVault({vault,destination}){
  if(!destination)throw new Error("restore_destination_required");
  const target=path.resolve(destination);
  const parent=fs.realpathSync(path.dirname(target));
  const v=inspectVault(vault);
  if(within(v.dir,target)||within(target,v.dir))throw new Error("restore_must_not_overwrite_vault");
  if(fs.existsSync(target))throw new Error("restore_destination_must_not_exist");
  const proof=verifyVault({vault});
  const temp=path.join(parent,".evercraft-restore-"+crypto.randomBytes(8).toString("hex"));
  try{
    run(parent,["clone","--mirror","--no-local",v.archive,temp]);
    run(temp,["fsck","--full","--no-reflogs"]);
    const refs=run(temp,["for-each-ref","--format=%(refname) %(objectname)"]).out;
    if(crypto.createHash("sha256").update(refs).digest("hex")!==v.manifest.source_refs_sha256)
      throw new Error("restore_ref_set_mismatch");
    fs.renameSync(temp,target);
    return {...proof,state:"restored_as_independent_bare_git_repository",
      independent_bare_repository:true,owner_action_required_to_checkout:true};
  }catch(e){if(fs.existsSync(temp))fs.rmSync(temp,{recursive:true,force:true});throw e;}
}
function option(args,key){
  const i=args.indexOf("--"+key);
  if(i<0 || !args[i+1] || args[i+1].startsWith("--"))return "";
  return args[i+1];
}
export {createVault,verifyVault,restoreVault,inspectVault};
const isMain=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isMain){
  const [command,...args]=process.argv.slice(2);
  try{
    let result;
    if(command==="backup")result=createVault({repo:option(args,"repo"),vault:option(args,"vault")});
    else if(command==="verify")result=verifyVault({vault:option(args,"vault")});
    else if(command==="restore")result=restoreVault({vault:option(args,"vault"),destination:option(args,"destination")});
    else throw new Error("usage: backup --repo PATH --vault PATH | verify --vault PATH | restore --vault PATH --destination NEW_PATH");
    process.stdout.write(JSON.stringify(result)+"\n");
  }catch(e){
    // Deliberately redact paths, Git stderr and potentially private file names.
    const code=String(e?.message||"continuity_failure").split(":")[0];
    process.stderr.write(JSON.stringify({ok:false,state:"held",reason:code})+"\n");
    process.exitCode=1;
  }
}
