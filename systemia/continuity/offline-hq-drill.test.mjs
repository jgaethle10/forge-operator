import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {createVault} from "./source-vault.mjs";
import {rehearseOfflineHome} from "./offline-hq-drill.mjs";
import {startEvercraftHomeServer} from "../evercraft-home/server.mjs";

function git(cwd,args){
  const r=spawnSync("git",args,{cwd,encoding:"utf8",timeout:60000,
    env:{PATH:process.env.PATH,HOME:cwd,GIT_TERMINAL_PROMPT:"0",
      GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:os.devNull}});
  if(r.status!==0)throw Error("fixture_git_failed:"+args[0]);
  return r.stdout.trim();
}
const serverStub=[
 'import http from "node:http";',
 'export async function startEvercraftHomeServer(opts){',
 ' if(opts.host!=="127.0.0.1"||opts.authMode!=="local"||opts.port!==0||',
 '    Object.keys(opts.serviceOrigins||{}).length!==0||',
 '    opts.identityStateDir!==""||opts.passportStateDir!==""||',
 '    opts.credentialStateDir!=="")throw Error("fixture_requires_isolated_loopback");',
 ' const app=http.createServer((req,res)=>{',
 '   const target=new URL(req.url,"http://127.0.0.1").pathname;',
 '   let data;',
 '   if(target==="/api/health")data={',
 '     ok:true,service:"evercraft-home",listen_scope:"loopback",',
 '     auth_mode:"local",external_ai_required:false,',
 '     base44_required:false,source_release_ref:opts.sourceReleaseRef',
 '   };',
 '   else if(target==="/api/overview")data={ok:true,direct_mode_default:true};',
 '   else if(target==="/api/continuity/status")data={',
 '     ok:true,state:"vault_not_configured",offsite_copy_verified:false',
 '   };',
 '   else{res.statusCode=404;return res.end("not found");}',
 '   res.setHeader("content-type","application/json");',
 '   res.end(JSON.stringify(data));',
 ' });',
 ' await new Promise(resolve=>app.listen(0,"127.0.0.1",resolve));',
 ' const address=app.address();',
 ' return{host:"127.0.0.1",url:"http://127.0.0.1:"+address.port,',
 '   close:()=>new Promise(resolve=>app.close(resolve))};',
 '}',
].join("\n");
function fixture(t,{withServer=true}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-offline-hq-test-"));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,"source");fs.mkdirSync(source);
 git(source,["init","-b","main"]);
 git(source,["config","user.email","operator@example.invalid"]);
 git(source,["config","user.name","Evercraft Test"]);
 fs.writeFileSync(path.join(source,"README.md"),"Offline HQ fixture\n");
 if(withServer){
   const folder=path.join(source,"systemia","evercraft-home");
   fs.mkdirSync(folder,{recursive:true});
   fs.writeFileSync(path.join(folder,"server.mjs"),serverStub);
 }
 git(source,["add","."]);git(source,["commit","-m","Synthetic owned HQ fixture"]);
 const vault=path.join(root,"vault");
 const saved=createVault({repo:source,vault});
 assert.equal(git(source,["remote"]),"");
 return {root,source,vault,saved};
}
test("recovered no-remote source can boot isolated Direct Mode with no GitHub or model",async t=>{
 const f=fixture(t);
 const receiptDir=path.join(f.root,"receipts");
 const record=await rehearseOfflineHome({vault:f.vault,receiptDir,
   now:()=>new Date("2026-11-15T23:00:00Z")});
 assert.equal(record.ok,true);
 assert.equal(record.state,"source_restored_and_local_direct_mode_booted");
 assert.equal(record.source_head,f.saved.source_head);
 assert.equal(record.offline_git_restore_verified,true);
 assert.equal(record.local_home_boot_verified,true);
 assert.equal(record.direct_mode_default,true);
 assert.equal(record.loopback_only,true);
 assert.equal(record.production_deployed,false);
 assert.equal(record.network_interface_disconnected_by_drill,false);
 assert.equal(record.passport_identity_restored,false);
 assert.equal(record.customer_data_restored,false);
 assert.equal(record.offsite_copy_verified,false);
 assert.equal(record.github_or_model_api_required_by_drill,false);
 const out=path.join(receiptDir,"offline-home-"+f.saved.source_head.slice(0,12)+".json");
 assert.equal(fs.statSync(receiptDir).mode&0o077,0);
 assert.equal(fs.statSync(out).mode&0o077,0);
 const persisted=JSON.parse(fs.readFileSync(out,"utf8"));
 assert.equal(persisted.bundle_sha256,record.bundle_sha256);
 assert.ok(!JSON.stringify(persisted).includes(f.root));
});
test("a bundle without Home fails closed and never emits a success receipt",async t=>{
 const f=fixture(t,{withServer:false});
 await assert.rejects(()=>rehearseOfflineHome({vault:f.vault,
   receiptDir:path.join(f.root,"receipts")}),/home_server_missing_from_source/);
 assert.equal(fs.existsSync(path.join(f.root,"receipts")),false);
});
test("tampered source archive cannot boot",async t=>{
 const f=fixture(t);
 const manifest=JSON.parse(fs.readFileSync(path.join(f.vault,f.saved.manifest),"utf8"));
 fs.appendFileSync(path.join(f.vault,manifest.archive),"tampering");
 await assert.rejects(()=>rehearseOfflineHome({vault:f.vault}),/vault_bundle_integrity_failed/);
});
test("requires absolute private source custody and refuses to overwrite existing proof",async t=>{
 const f=fixture(t);
 await assert.rejects(()=>rehearseOfflineHome({vault:"relative/vault"}),/vault_must_be_absolute/);
 const out=path.join(f.root,"receipts");
 await rehearseOfflineHome({vault:f.vault,receiptDir:out});
 await assert.rejects(()=>rehearseOfflineHome({vault:f.vault,receiptDir:out}),/receipt_already_exists/);
});
test("real current Home can boot locally without configured AI, GitHub or provider bridges",async()=>{
 const runtime=await startEvercraftHomeServer({
   host:"127.0.0.1",port:0,authMode:"local",operator:"Offline Proof",
   identityStateDir:"",passportStateDir:"",credentialStateDir:"",
   yardStateDir:"",serviceOrigins:{},
   clipFacebookFetch:async()=>{throw Error("external_forbidden")},
   clipLinkedInFetch:async()=>{throw Error("external_forbidden")},
   paymentsReadbackFetch:async()=>{throw Error("external_forbidden")},
 });
 try{
   const health=await (await fetch(runtime.url+"/api/health")).json();
   assert.equal(health.ok,true);
   assert.equal(health.listen_scope,"loopback");
   assert.equal(health.auth_mode,"local");
   assert.equal(health.external_ai_required,false);
   assert.equal(health.base44_required,false);
   const overview=await(await fetch(runtime.url+"/api/overview")).json();
   assert.equal(overview.direct_mode_default,true);
   const continuity=await(await fetch(runtime.url+"/api/continuity/status")).json();
   assert.equal(continuity.state,"vault_not_configured");
 }finally{await runtime.close();}
});
