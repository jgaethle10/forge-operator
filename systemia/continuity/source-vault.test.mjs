import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {createVault,verifyVault,restoreVault} from "./source-vault.mjs";

const git=(cwd,args)=>{
 const r=spawnSync("git",args,{cwd,encoding:"utf8",timeout:45000,
  env:{...process.env,GIT_TERMINAL_PROMPT:"0",GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:os.devNull}});
 if(r.status!==0)throw Error("fixture_git_failed:"+args[0]+":"+String(r.stderr||"").slice(0,120));
 return r.stdout.trim();
};
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-sovereign-test-"));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const source=path.join(dir,"source");
 fs.mkdirSync(source);
 git(source,["init","-b","main"]);
 git(source,["config","user.email","operator@example.invalid"]);
 git(source,["config","user.name","Offline Operator"]);
 fs.writeFileSync(path.join(source,"README.md"),"Evercraft offline source recovery fixture\n");
 git(source,["add","README.md"]);
 git(source,["commit","-m","Initial offline fixture"]);
 git(source,["tag","v1"]);
 git(source,["branch","recovery-test"]);
 const vault=path.join(dir,"private-vault");
 const restored=path.join(dir,"standalone-recovery.git");
 return {dir,source,vault,restored};
}
test("creates private Git history archive and proves offline restore with no remote",t=>{
 const {source,vault,restored}=fixture(t);
 assert.equal(git(source,["remote"]).trim(),"");
 const saved=createVault({repo:source,vault});
 assert.equal(saved.ok,true);
 assert.equal(saved.restored_independently,false);
 assert.equal(saved.offsite_copy_verified,false);
 assert.equal(fs.statSync(vault).mode&0o077,0);
 assert.equal(fs.statSync(path.join(vault,saved.manifest)).mode&0o077,0);
 const proof=verifyVault({vault});
 assert.equal(proof.ok,true);
 assert.equal(proof.state,"local_offline_restore_proved");
 assert.equal(proof.github_required,false);
 assert.equal(proof.external_ai_required,false);
 assert.equal(proof.customer_data_restore_verified,false);
 const restore=restoreVault({vault,destination:restored});
 assert.equal(restore.ok,true);
 assert.equal(restore.independent_bare_repository,true);
 assert.equal(git(restored,["rev-parse","--is-bare-repository"]),"true");
 assert.equal(git(restored,["rev-parse","refs/heads/main"]),git(source,["rev-parse","main"]));
 assert.equal(git(restored,["rev-parse","refs/tags/v1"]),git(source,["rev-parse","v1"]));
 assert.equal(git(restored,["rev-parse","refs/heads/recovery-test"]),git(source,["rev-parse","recovery-test"]));
});
test("integrity tampering fails before restore",t=>{
 const f=fixture(t);
 const saved=createVault({repo:f.source,vault:f.vault});
 const manifest=JSON.parse(fs.readFileSync(path.join(f.vault,saved.manifest),"utf8"));
 const archive=path.join(f.vault,manifest.archive);
 fs.appendFileSync(archive,"tampering");
 assert.throws(()=>verifyVault({vault:f.vault}),/vault_bundle_integrity_failed/);
 assert.throws(()=>restoreVault({vault:f.vault,destination:f.restored}),/vault_bundle_integrity_failed/);
 assert.equal(fs.existsSync(f.restored),false);
});
test("manifest pointer tampering and symlink targets are denied",t=>{
 const f=fixture(t);
 createVault({repo:f.source,vault:f.vault});
 const latest=path.join(f.vault,"latest.json");
 fs.unlinkSync(latest);
 fs.symlinkSync("/tmp/evercraft-do-not-trust",latest);
 assert.throws(()=>verifyVault({vault:f.vault}),/vault_file_not_private/);
});
test("uncommitted tracked data is held because a Git bundle would omit it",t=>{
 const f=fixture(t);
 fs.appendFileSync(path.join(f.source,"README.md"),"UNCOMMITTED DATA\n");
 assert.throws(()=>createVault({repo:f.source,vault:f.vault}),/uncommitted_tracked_changes_not_in_bundle/);
 assert.equal(fs.existsSync(f.vault),false);
});
test("the source archive may not live inside the code checkout",t=>{
 const f=fixture(t);
 assert.throws(()=>createVault({repo:f.source,vault:path.join(f.source,"backup")}),/vault_must_be_outside_source_tree/);
});
test("does not overwrite existing restore target or accept insecure vault directory",t=>{
 const f=fixture(t);
 createVault({repo:f.source,vault:f.vault});
 fs.mkdirSync(f.restored);
 assert.throws(()=>restoreVault({vault:f.vault,destination:f.restored}),/restore_destination_must_not_exist/);
 fs.chmodSync(f.vault,0o755);
 assert.throws(()=>verifyVault({vault:f.vault}),/vault_directory_not_private/);
});
test("can backup and restore without GitHub, cloud AI or external secrets",t=>{
 const f=fixture(t);
 const b=createVault({repo:f.source,vault:f.vault});
 const raw=JSON.stringify(b);
 assert.equal(raw.includes("github.com"),false);
 assert.equal(raw.includes(f.source),false);
 assert.equal(raw.includes(f.vault),false);
 const restored=verifyVault({vault:f.vault});
 assert.equal(restored.offsite_copy_verified,false);
 assert.equal(restored.customer_data_restore_verified,false);
});
