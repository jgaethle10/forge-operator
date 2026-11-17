import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {preflightDevice,preparePenguin,recoverNextGen} from "./device-field-kit.mjs";
import {createOfflineKey} from "./sealed-transfer.mjs";

function git(cwd,args){
 const p=spawnSync("git",args,{cwd,encoding:"utf8",timeout:30000,
   env:{PATH:process.env.PATH||"/usr/bin:/bin",HOME:cwd,
     GIT_TERMINAL_PROMPT:"0",GIT_CONFIG_NOSYSTEM:"1",
     GIT_CONFIG_GLOBAL:os.devNull,GIT_ALLOW_PROTOCOL:"file"}});
 assert.equal(p.status,0,"local fixture Git failed at "+args[0]);
 return p.stdout.trim();
}
const stub=[
 'import http from "node:http";',
 'export async function startEvercraftHomeServer(opts){',
 ' if(opts.authMode!=="local"||opts.host!=="127.0.0.1"||',
 '    opts.identityStateDir!==""||opts.passportStateDir!==""||',
 '    opts.credentialStateDir!=="")throw Error("unsafe_fixture_mode");',
 ' const server=http.createServer((req,res)=>{',
 '   const endpoint=new URL(req.url,"http://127.0.0.1").pathname;',
 '   const body=endpoint==="/api/health" ? {ok:true,service:"evercraft-home",',
 '      listen_scope:"loopback",auth_mode:"local",source_release_ref:opts.sourceReleaseRef,',
 '      external_ai_required:false,base44_required:false}',
 '      : endpoint==="/api/overview" ? {ok:true,direct_mode_default:true}',
 '      : endpoint==="/api/continuity/status" ? {ok:true,state:"vault_not_configured",offsite_copy_verified:false}',
 '      : null;',
 '   if(!body){res.statusCode=404;res.end();return;}',
 '   res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(body));',
 ' });',
 ' await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));',
 ' return {host:"127.0.0.1",url:"http://127.0.0.1:"+server.address().port,',
 '   close:()=>new Promise(resolve=>server.close(resolve))};',
 '}',
].join("\n");
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-device-field-"));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,"source");fs.mkdirSync(source,{mode:0o700});
 git(source,["init","-b","main"]);
 git(source,["config","user.email","test@example.invalid"]);
 git(source,["config","user.name","Evercraft Local Test"]);
 fs.writeFileSync(path.join(source,"README.md"),"Source available without cloud services");
 fs.mkdirSync(path.join(source,"systemia","evercraft-home"),{recursive:true});
 fs.writeFileSync(path.join(source,"systemia","evercraft-home","server.mjs"),stub);
 git(source,["add","."]);git(source,["commit","-m","local source fixture"]);
 git(source,["tag","local-v1"]);
 return {root,source,state:path.join(root,"penguin-state"),nextgen:path.join(root,"nextgen-state")};
}
test("preflight checks committed full local source, without contacting GitHub",t=>{
 const f=fixture(t);
 const report=preflightDevice({repo:f.source});
 assert.equal(report.ok,true);
 assert.equal(report.full_local_git_history,true);
 assert.equal(report.untracked_files_included,false);
 assert.equal(report.git_remote_required,false);
 assert.equal(report.private_business_state_included,false);
});
test("Penguin stages encrypted source, NextGen locally restores and boots HQ with honest receipts",async t=>{
 const f=fixture(t);
 const prep=await preparePenguin({repo:f.source,state:f.state,
   now:()=>new Date("2026-11-15T23:55:00Z")});
 assert.equal(prep.ok,true);
 assert.equal(prep.state,"penguin_source_prepared_for_encrypted_transfer");
 assert.equal(prep.physical_transfer_to_nextgen_verified,false);
 assert.equal(prep.independent_key_custody_verified,false);
 assert.equal(prep.staged_tool_count,4);
 assert.match(prep.encrypted_file_sha256,/^[a-f0-9]{64}$/);
 assert.equal(Object.keys(prep.recovery_tool_sha256).length,4);
 const key=path.join(f.state,"private-key","recovery.key");
 const outgoing=path.join(f.state,"transfer");
 const sealed=path.join(outgoing,prep.sealed_file);
 assert.ok(fs.existsSync(key)&&fs.existsSync(sealed));
 assert.equal(fs.statSync(key).mode&0o077,0);
 assert.equal(fs.statSync(sealed).mode&0o077,0);
 assert.equal(fs.readdirSync(outgoing).filter(x=>x.endsWith(".key")).length,0);
 const tools=fs.readdirSync(path.join(outgoing,"tools"));
 assert.ok(tools.includes("source-vault.mjs"));
 assert.ok(tools.includes("device-field-kit.mjs"));
 const restore=await recoverNextGen({
   sealed,keyFile:key,state:f.nextgen,expectedEncryptedSha256:prep.encrypted_file_sha256,
   now:()=>new Date("2026-11-15T23:58:00Z")
 });
 assert.equal(restore.ok,true);
 assert.equal(restore.state,"nextgen_local_source_restored_and_home_booted");
 assert.equal(restore.source_head,prep.source_head);
 assert.equal(restore.archive_sha256,prep.archive_sha256);
 assert.equal(restore.local_home_boot_verified,true);
 assert.equal(restore.production_deployed,false);
 assert.equal(restore.company_data_restored,false);
 assert.equal(restore.physical_network_disconnection_verified,false);
 assert.equal(restore.independent_device_identity_cryptographically_verified,false);
 const receipt=path.join(f.nextgen,"receipts",restore.receipt_file);
 assert.equal(fs.statSync(receipt).mode&0o077,0);
 const stored=JSON.parse(fs.readFileSync(receipt,"utf8"));
 assert.ok(!JSON.stringify(stored).includes(key));
 assert.ok(!JSON.stringify(stored).includes(f.source));
});
test("dirty tracked source is held before vault creation",async t=>{
 const f=fixture(t);
 fs.appendFileSync(path.join(f.source,"README.md"),"\nWIP not committed");
 await assert.rejects(()=>preparePenguin({repo:f.source,state:f.state}),/tracked_changes_not_in_backup/);
 assert.equal(fs.existsSync(f.state),false);
});
test("wrong recovery key refuses remote-device restore and success receipt",async t=>{
 const f=fixture(t);
 const prep=await preparePenguin({repo:f.source,state:f.state});
 const badKeys=path.join(f.root,"badkeys");fs.mkdirSync(badKeys,{mode:0o700});
 const wrong=path.join(badKeys,"wrong.key");createOfflineKey({keyFile:wrong});
 const sealed=path.join(f.state,"transfer",prep.sealed_file);
 await assert.rejects(()=>recoverNextGen({sealed,keyFile:wrong,state:f.nextgen,expectedEncryptedSha256:prep.encrypted_file_sha256}));
 assert.equal(fs.existsSync(path.join(f.nextgen,"receipts")),false);
});
test("preflight cannot treat a shallow or non-repository input as a verified backup",t=>{
 const f=fixture(t);
 const nonRepo=path.join(f.root,"unrelated");fs.mkdirSync(nonRepo);
 assert.throws(()=>preflightDevice({repo:nonRepo}));
});

test("NextGen holds a ciphertext that differs from the Penguin out-of-band fingerprint",async t=>{
 const f=fixture(t);
 const prep=await preparePenguin({repo:f.source,state:f.state});
 const sealed=path.join(f.state,"transfer",prep.sealed_file);
 const keyFile=path.join(f.state,"private-key","recovery.key");
 fs.appendFileSync(sealed,"tampered by transfer");
 await assert.rejects(()=>recoverNextGen({
   sealed,keyFile,state:f.nextgen,expectedEncryptedSha256:prep.encrypted_file_sha256
 }),/encrypted_copy_digest_mismatch/);
 assert.equal(fs.existsSync(f.nextgen),false);
});
test("NextGen refuses recovery when the trusted fingerprint is absent",async t=>{
 const f=fixture(t);
 const prep=await preparePenguin({repo:f.source,state:f.state});
 await assert.rejects(()=>recoverNextGen({
   sealed:path.join(f.state,"transfer",prep.sealed_file),
   keyFile:path.join(f.state,"private-key","recovery.key"),
   state:f.nextgen
 }),/penguin_ciphertext_fingerprint_required/);
});
