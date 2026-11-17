import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  KEY,STORE,plannedEnvironment,inspectPrivateDirectory,ensurePrivateDirectory,
} from '../scripts/provision-website-audit-owned-intake.mjs';

test('Website Audit owned lead location is durable, not the read-only home mount',()=>{
  assert.equal(STORE,'/var/lib/evercraft/website-audit-leads');
  assert.ok(!STORE.startsWith(os.homedir()+'/'));
});
test('environment addition preserves existing credentials and is idempotent',()=>{
  const original='EVERCRAFT_VISUAL_INGEST_TOKEN=do-not-print\nOTHER_SETTING=untouched\n';
  const first=plannedEnvironment(original);
  assert.equal(first.changed,true);
  assert.equal(first.content.includes('EVERCRAFT_VISUAL_INGEST_TOKEN=do-not-print'),true);
  assert.equal(first.content.split(KEY+'=').length,2);
  assert.equal(first.content.endsWith(KEY+'='+STORE+'\n'),true);
  const second=plannedEnvironment(first.content);
  assert.equal(second.changed,false);
  assert.equal(second.content,first.content);
});
test('existing custom directories cannot be silently migrated or overwritten',()=>{
  assert.throws(()=>plannedEnvironment(KEY+'=/home/operator/old-leads\n'),/requires_review/);
  assert.throws(()=>plannedEnvironment(KEY+'='+STORE+'\n'+KEY+'='+STORE+'\n'),/duplicate/);
  assert.throws(()=>plannedEnvironment('export '+KEY+'=/tmp/unsafe\n'),/unrecognized/);
});
test('private directory creation is idempotent and rejects symlinks/world visibility',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-audit-private-'));
  const uid=process.getuid(),gid=process.getgid();
  try {
    const leaf=path.join(tmp,'leads');
    assert.equal(ensurePrivateDirectory(leaf,{uid,gid}),true);
    assert.equal(ensurePrivateDirectory(leaf,{uid,gid}),false);
    assert.equal(inspectPrivateDirectory(leaf,{uid,gid}),true);
    fs.chmodSync(leaf,0o755);
    assert.throws(()=>inspectPrivateDirectory(leaf,{uid,gid}),/unsafe/);
    const link=path.join(tmp,'link');
    fs.symlinkSync(leaf,link);
    assert.throws(()=>inspectPrivateDirectory(link,{uid,gid}),/unsafe/);
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});
test('source updater explicitly provisions before restarting and verifies safe readiness',()=>{
  const source=fs.readFileSync('scripts/update-fabric-owned-edge.sh','utf8');
  assert.match(source,/ensure_website_audit_private_intake/);
  assert.match(source,/provision-website-audit-owned-intake\.mjs/);
  assert.match(source,/api\/website-audit\/readiness/);
  assert.match(source,/r\.intake_available!==true/);
  assert.match(source,/r\.payment_ready!==false/);
});
