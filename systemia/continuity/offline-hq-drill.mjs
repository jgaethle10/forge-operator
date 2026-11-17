#!/usr/bin/env node
/**
 * Proves a source bundle can boot a read-only, loopback-only Evercraft Home.
 * Does not deploy to production, restore business state, or reach an external API.
 *
 * Important: this tool itself does not disable the device's network interface.
 * Air-gapped field tests are a separate acceptance gate.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { restoreVault } from "./source-vault.mjs";

const SCHEMA = "evercraft.continuity.offline-home-drill.v1";
const HASH = /^[a-f0-9]{40}$/;
function git(cwd,args) {
  const result=spawnSync("git",args,{
    cwd,encoding:"utf8",timeout:180000,maxBuffer:4*1024*1024,
    env:{
      PATH:process.env.PATH || "/usr/bin:/bin",
      HOME:cwd,
      GIT_CONFIG_GLOBAL:os.devNull,
      GIT_CONFIG_NOSYSTEM:"1",
      GIT_TERMINAL_PROMPT:"0",
      GIT_LFS_SKIP_SMUDGE:"1",
      GIT_ALLOW_PROTOCOL:"file",
      GIT_OPTIONAL_LOCKS:"0"
    }
  });
  if(result.status!==0 || result.error)throw new Error("local_git_"+String(args[0]||"operation")+"_held");
  return String(result.stdout||"").trim();
}
const readJson=async(url)=>{
  const response=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(5000),headers:{accept:"application/json"}});
  if(response.status!==200)throw new Error("home_probe_http_held");
  return response.json();
};
function assert(value,reason){if(!value)throw new Error(reason);}
function writeReceipt(receiptDir,record){
  if(!receiptDir)return;
  if(!path.isAbsolute(receiptDir))throw new Error("receipt_directory_must_be_absolute");
  fs.mkdirSync(receiptDir,{mode:0o700,recursive:true});
  const st=fs.lstatSync(receiptDir);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)
    throw new Error("receipt_directory_not_private");
  const target=path.join(receiptDir,"offline-home-"+record.source_head.slice(0,12)+".json");
  if(fs.existsSync(target))throw new Error("receipt_already_exists");
  const fd=fs.openSync(target,"wx",0o600);
  try{fs.writeFileSync(fd,JSON.stringify(record,null,2)+"\n");fs.fsyncSync(fd);}
  finally{fs.closeSync(fd);}
}
export async function rehearseOfflineHome({vault,receiptDir="",now=()=>new Date()}={}) {
  if(typeof vault!=="string"||!path.isAbsolute(vault))throw new Error("vault_must_be_absolute");
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-offline-home-"));
  fs.chmodSync(root,0o700);
  let runtime;
  try{
    const bare=path.join(root,"source.git");
    const restored=restoreVault({vault,destination:bare});
    assert(HASH.test(restored.source_head),"source_commit_invalid");
    const worktree=path.join(root,"recovered");
    git(root,["clone","--no-local","--no-checkout",bare,worktree]);
    git(worktree,["checkout","--detach",restored.source_head]);
    const checked=git(worktree,["rev-parse","HEAD"]);
    assert(checked===restored.source_head,"restored_commit_mismatch");
    const homeFile=path.join(worktree,"systemia","evercraft-home","server.mjs");
    assert(fs.existsSync(homeFile)&&fs.statSync(homeFile).isFile(),"home_server_missing_from_source");
    const mod=await import(pathToFileURL(homeFile).href);
    assert(typeof mod.startEvercraftHomeServer==="function","home_boot_entry_missing");
    // This is an isolated development-only test. Never bind 0.0.0.0,
    // mount a customer database, load provider secrets, or issue a Passport grant.
    runtime=await mod.startEvercraftHomeServer({
      host:"127.0.0.1",port:0,authMode:"local",operator:"Offline Drill",
      sourceReleaseRef:restored.source_head,
      identityStateDir:"",passportStateDir:"",credentialStateDir:"",
      yardStateDir:"",serviceOrigins:{},
      clipFacebookFetch:async()=>{throw new Error("external_provider_forbidden")},
      clipLinkedInFetch:async()=>{throw new Error("external_provider_forbidden")},
      paymentsReadbackFetch:async()=>{throw new Error("external_provider_forbidden")},
    });
    assert(runtime.host==="127.0.0.1","non_loopback_boot_forbidden");
    const health=await readJson(runtime.url+"/api/health");
    assert(health.ok===true&&health.service==="evercraft-home"&&
      health.listen_scope==="loopback"&&health.auth_mode==="local"&&
      health.external_ai_required===false&&health.base44_required===false&&
      health.source_release_ref===restored.source_head,"home_offline_health_mismatch");
    const overview=await readJson(runtime.url+"/api/overview");
    assert(overview.ok===true&&overview.direct_mode_default===true,
      "home_direct_mode_unavailable");
    const continuity=await readJson(runtime.url+"/api/continuity/status");
    assert(continuity.ok===true&&continuity.state==="vault_not_configured"&&
      continuity.offsite_copy_verified===false,"home_continuity_gate_mismatch");
    await runtime.close();runtime=null;
    const at=now();
    assert(at instanceof Date&&!Number.isNaN(at.valueOf()),"observation_clock_invalid");
    const result={
      schema:SCHEMA,state:"source_restored_and_local_direct_mode_booted",ok:true,
      observed_at:at.toISOString(),source_head:restored.source_head,
      bundle_sha256:restored.bundle_sha256,
      offline_git_restore_verified:true,local_home_boot_verified:true,
      loopback_only:true,direct_mode_default:true,
      github_or_model_api_required_by_drill:false,
      network_interface_disconnected_by_drill:false,
      real_device_loss_simulated:false,
      production_deployed:false,customer_data_restored:false,
      passport_identity_restored:false,cloud_provider_execution_performed:false,
      recovery_time_slo_proven:false,offsite_copy_verified:false,
      test_auth_mode:"development_loopback_only",
    };
    writeReceipt(receiptDir,result);
    return result;
  }finally{
    if(runtime)await runtime.close().catch(()=>{});
    fs.rmSync(root,{recursive:true,force:true});
  }
}
function option(args,key){
  const index=args.indexOf("--"+key);
  return index>=0 && typeof args[index+1]==="string"&&!args[index+1].startsWith("--")?args[index+1]:"";
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  rehearseOfflineHome({
    vault:option(process.argv.slice(2),"vault"),
    receiptDir:option(process.argv.slice(2),"receipt-dir"),
  }).then(x=>process.stdout.write(JSON.stringify(x)+"\n"))
    .catch(error=>{
      const reason=String(error?.message||"offline_hq_drill_failed").split(":")[0];
      process.stderr.write(JSON.stringify({ok:false,state:"held",reason})+"\n");
      process.exitCode=1;
    });
}
