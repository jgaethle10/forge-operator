import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {planStudioEnvironment,checkPrivateDir,checkExistingLedger,STORE,KEY}
 from '../scripts/provision-studio-owned-intake.mjs';

test('Studio private provisioner plans a fixed /var/lib store without altering other secrets',()=>{
 const text='API_ACCESS_PRIVATE_TOKEN=secret-must-be-preserved\nEXISTING_RUNTIME=true\n';
 const plan=planStudioEnvironment(text);
 assert.equal(plan.changed,true);
 assert.equal(plan.content,text+KEY+'='+STORE+'\n');
 assert.equal(plan.content.match(new RegExp(KEY+'=','g')).length,1);
 assert.ok(plan.content.includes('secret-must-be-preserved'));
 const again=planStudioEnvironment(plan.content);
 assert.equal(again.changed,false);
 assert.equal(again.content,plan.content);
});
test('existing custom Studio storage and legacy home leads hold instead of rehoming customers',()=>{
 const text='RUNTIME=ok\n';
 assert.throws(()=>planStudioEnvironment(text,{legacyStatePresent:true}),
  /studio_legacy_home_state_requires_private_migration/);
 assert.throws(()=>planStudioEnvironment(KEY+'=/custom/private/leads\n'),
  /studio_env_existing_store_requires_private_review/);
 assert.throws(()=>planStudioEnvironment(KEY+'='+STORE+'\n'+KEY+'='+STORE+'\n'),
  /studio_env_duplicate_store/);
 assert.throws(()=>planStudioEnvironment('export '+KEY+'='+STORE+'\n'),
  /studio_env_unrecognized_store/);
 const configured=planStudioEnvironment(KEY+'='+STORE+'\n',{legacyStatePresent:true});
 assert.equal(configured.changed,false,'already established correct store is never mutated');
});
test('private Studio storage rejects permissive modes, mismatched owner and links',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-resident-private-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const me=process.getuid(),group=process.getgid();
 const safe=path.join(root,'private');
 fs.mkdirSync(safe,{mode:0o700});
 assert.equal(checkPrivateDir(safe,me,group),true);
 fs.chmodSync(safe,0o755);
 assert.throws(()=>checkPrivateDir(safe,me,group),/studio_private_directory_invalid/);
 fs.chmodSync(safe,0o700);
 const link=path.join(root,'redirect');
 fs.symlinkSync(safe,link,'dir');
 assert.throws(()=>checkPrivateDir(link,me,group),/studio_private_directory_invalid/);
 assert.throws(()=>checkPrivateDir(safe,me+1,group),/studio_private_directory_invalid/);
});
test('existing private customer ledger is never silently repaired or overwritten',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-ledger-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const ledger=path.join(root,'inquiries.ndjson');
 checkExistingLedger(ledger,process.getuid()); // Absent is safe.
 fs.writeFileSync(ledger,'original-customer-evidence\n',{flag:'wx',mode:0o600});
 assert.equal(checkExistingLedger(ledger,process.getuid()),undefined);
 assert.equal(fs.readFileSync(ledger,'utf8'),'original-customer-evidence\n');
 fs.chmodSync(ledger,0o644);
 assert.throws(()=>checkExistingLedger(ledger,process.getuid()),/studio_existing_ledger_invalid/);
 fs.chmodSync(ledger,0o600);
 const link=path.join(root,'symlink.ndjson');
 fs.symlinkSync(ledger,link);
 assert.throws(()=>checkExistingLedger(link,process.getuid()),/studio_existing_ledger_invalid/);
});
test('Fabric updater gates resident Studio /var/lib provisioning and restarts on first config',()=>{
 const updater=fs.readFileSync(new URL('../scripts/update-fabric-owned-edge.sh',import.meta.url),'utf8');
 const installer=fs.readFileSync(new URL('../scripts/install-fabric-owned-edge.sh',import.meta.url),'utf8');
 assert.match(installer,/ProtectHome=read-only/);
 assert.match(updater,/ensure_studio_private_intake\(\)/);
 assert.match(updater,/provision-studio-owned-intake\.mjs/);
 assert.match(updater,/--apply --confirm-owned-host/);
 assert.equal((updater.match(/if ! ensure_studio_private_intake; then/g)||[]).length,2,
  'both current and fast-forward update paths must provision Studio before any service acceptance');
 assert.match(updater,/STUDIO_INTAKE_CHANGED/);
 const current=updater.indexOf('if ! ensure_studio_private_intake; then');
 const currentRestart=updater.indexOf('if ! systemctl restart "$SERVICE"; then',current);
 assert.ok(currentRestart>current);
 const upgrade=updater.lastIndexOf('if ! ensure_studio_private_intake; then');
 const upgradeRestart=updater.indexOf('if ! systemctl restart "$SERVICE"; then',upgrade);
 assert.ok(upgradeRestart>upgrade);
 assert.match(updater,/studio_private_intake_provision_hold/);
});
