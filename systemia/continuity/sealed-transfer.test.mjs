import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createVault, verifyVault, restoreVault } from "./source-vault.mjs";
import { createOfflineKey, sealSourceVault, recoverSealedVault } from "./sealed-transfer.mjs";

function git(cwd,args){
  const p=spawnSync("git",args,{cwd,encoding:"utf8",timeout:30000,
    env:{...process.env,GIT_TERMINAL_PROMPT:"0",GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:os.devNull}});
  assert.equal(p.status,0,"local git "+args[0]+" must succeed");
  return p.stdout.trim();
}
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-sealed-transfer-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const src=path.join(root,"source");fs.mkdirSync(src,{mode:0o700});
  git(src,["init","-b","main"]);
  git(src,["config","user.email","operator@example.invalid"]);
  git(src,["config","user.name","Offline Evercraft"]);
  fs.writeFileSync(path.join(src,"README.md"),"source recovery test, without remote");
  git(src,["add","."]);git(src,["commit","-m","fixture"]);
  git(src,["branch","recovery"]);git(src,["tag","v1"]);
  const vault=path.join(root,"plain-source-vault");
  const backup=createVault({repo:src,vault});
  const media=path.join(root,"external-media");fs.mkdirSync(media,{mode:0o700});
  const keys=path.join(root,"separate-keys");fs.mkdirSync(keys,{mode:0o700});
  const keyFile=path.join(keys,"recovery.key");
  createOfflineKey({keyFile});
  const ciphertext=path.join(media,"evercraft-source.evsealed");
  return {root,src,vault,backup,media,keys,keyFile,ciphertext};
}
test("seal local Git history, delete the origin, recover and independently verify branch/tag refs",t=>{
  const f=fixture(t);
  const saved=sealSourceVault({vault:f.vault,output:f.ciphertext,keyFile:f.keyFile});
  assert.equal(saved.ok,true);
  assert.equal(saved.state,"encrypted_copy_created");
  assert.equal(saved.independent_device_verified,false);
  assert.equal(saved.plaintext_copy_created,false);
  assert.equal(fs.statSync(f.ciphertext).mode&0o077,0);
  const ciphertext=fs.readFileSync(f.ciphertext);
  assert.equal(ciphertext.includes(Buffer.from("source recovery test, without remote")),false);
  // Simulate losing the source checkout and plain-text vault.
  fs.rmSync(f.src,{recursive:true,force:true});
  fs.rmSync(f.vault,{recursive:true,force:true});
  const dest=path.join(f.root,"restored-vault");
  const proof=recoverSealedVault({input:f.ciphertext,outputVault:dest,keyFile:f.keyFile});
  assert.equal(proof.state,"encrypted_copy_restored_and_git_verified");
  assert.equal(proof.source_head,f.backup.source_head);
  assert.equal(proof.local_git_restore_verified,true);
  assert.equal(proof.independent_device_verified,false);
  assert.equal(proof.customer_data_restored,false);
  assert.equal(proof.offline_home_boot_verified,false);
  assert.equal(verifyVault({vault:dest}).source_head,f.backup.source_head);
  const bare=path.join(f.root,"recovered.git");
  restoreVault({vault:dest,destination:bare});
  assert.equal(git(bare,["rev-parse","--is-bare-repository"]),"true");
  assert.equal(git(bare,["rev-parse","refs/heads/main"]),f.backup.source_head);
  assert.equal(git(bare,["rev-parse","refs/heads/recovery"]),f.backup.source_head);
  assert.equal(git(bare,["rev-parse","refs/tags/v1"]),f.backup.source_head);
  assert.equal(git(bare,["remote"]),"origin"); // local bundle origin only
});
test("wrong secret or ciphertext mutation fails closed with no restored vault",t=>{
  const f=fixture(t);
  sealSourceVault({vault:f.vault,output:f.ciphertext,keyFile:f.keyFile});
  const otherKey=path.join(f.keys,"wrong.key");
  createOfflineKey({keyFile:otherKey});
  const dest=path.join(f.root,"wrong-key-recovery");
  assert.throws(()=>recoverSealedVault({input:f.ciphertext,outputVault:dest,keyFile:otherKey}));
  assert.equal(fs.existsSync(dest),false);
  const fd=fs.openSync(f.ciphertext,"r+");
  try{const b=Buffer.alloc(1);fs.readSync(fd,b,0,1,32);b[0]^=0x04;fs.writeSync(fd,b,0,1,32);}
  finally{fs.closeSync(fd);}
  assert.throws(()=>recoverSealedVault({input:f.ciphertext,outputVault:dest,keyFile:f.keyFile}));
  assert.equal(fs.existsSync(dest),false);
});
test("public-readable keys or ciphertext fail private-custody checks",t=>{
  const f=fixture(t);
  fs.chmodSync(f.keyFile,0o644);
  assert.throws(()=>sealSourceVault({vault:f.vault,output:f.ciphertext,keyFile:f.keyFile}),/private_storage_required/);
  fs.chmodSync(f.keyFile,0o600);
  sealSourceVault({vault:f.vault,output:f.ciphertext,keyFile:f.keyFile});
  fs.chmodSync(f.ciphertext,0o644);
  assert.throws(()=>recoverSealedVault({input:f.ciphertext,outputVault:path.join(f.root,"restore"),keyFile:f.keyFile}),/private_storage_required/);
});
test("a secret key symlink or an existing output cannot be replaced",t=>{
  const f=fixture(t);
  const symlink=path.join(f.keys,"link.key");
  fs.symlinkSync(f.keyFile,symlink);
  assert.throws(()=>sealSourceVault({vault:f.vault,output:f.ciphertext,keyFile:symlink}),/private_storage_required/);
  sealSourceVault({vault:f.vault,output:f.ciphertext,keyFile:f.keyFile});
  assert.throws(()=>sealSourceVault({vault:f.vault,output:f.ciphertext,keyFile:f.keyFile}),/destination_already_exists/);
  const existing=path.join(f.root,"restore-existing");
  fs.mkdirSync(existing,{mode:0o700});
  assert.throws(()=>recoverSealedVault({input:f.ciphertext,outputVault:existing,keyFile:f.keyFile}),/destination_already_exists/);
});
test("recovered vault can never be treated as a customer or production backup",t=>{
  const f=fixture(t);
  const result=sealSourceVault({vault:f.vault,output:f.ciphertext,keyFile:f.keyFile});
  assert.equal(result.company_data_restored,false);
  const unsealed=recoverSealedVault({
    input:f.ciphertext,outputVault:path.join(f.root,"restored"),keyFile:f.keyFile
  });
  assert.equal(unsealed.customer_data_restored,false);
  assert.equal(unsealed.independent_device_verified,false);
  assert.equal(unsealed.offline_home_boot_verified,false);
});
