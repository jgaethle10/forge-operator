import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const script=path.join(root,'scripts/preflight-saban-yard-split-runtime.mjs');
const source=fs.readFileSync(script,'utf8');

test('physical preflight is a diagnostics-only gate and never silently takes ownership',()=>{
  assert.match(source,/must_not_auto_activate:true/);
  assert.match(source,/read_only:true/);
  assert.match(source,/service_changes:false/);
  assert.match(source,/filesystem_changes:false/);
  assert.match(source,/preflight_requires_sudo/);
  assert.match(source,/private_state_account_boundary_unverified/);
  assert.match(source,/split_mailbox_not_prepared_or_access_invalid/);
  assert.match(source,/existing_saban_dispatch_timer_must_be_coordinated/);
  assert.match(source,/evercraft-yard-split-consumer.timer/);
  assert.match(source,/evercraft-saban-split-dispatch.timer/);
  assert.match(source,/buildPhysicalSplitPreflight/);
  assert.doesNotMatch(source,/\b(?:chmodSync|chownSync|writeFileSync|renameSync|mkdirSync|rmSync|unlinkSync|copyFileSync)\s*\(/,
    'preflight must not mutate files');
  assert.doesNotMatch(source,/\b(?:enable|disable|start|restart|stop)\b.{0,75}systemctl/i,
    'preflight must not alter services');
});

test('read-only preflight has valid Node syntax and refuses direct non-root execution',()=>{
  const syntax=spawnSync(process.execPath,['--check',script],{encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr);
  if(process.getuid?.()!==0){
    const run=spawnSync(process.execPath,[script],{encoding:'utf8'});
    assert.equal(run.status,2);
    assert.match(run.stderr,/PREFLIGHT_BLOCKED: preflight_requires_sudo/);
    assert.equal(run.stdout,'');
  }
});

test('mailbox diagnostic checks both directions and private state isolation',()=>{
  for(const fragment of [
    "requests'),sabanUser,yardGroup,'2750'",
    "outcomes'),yardUser,sabanGroup,'2750'",
    "capacity'),yardUser,sabanGroup,'2750'",
    'saban_request_write',
    'saban_outcome_read',
    'saban_capacity_read',
    'yard_request_read',
    'yard_outcome_write',
    'yard_capacity_write',
    'yard_request_write',
    'saban_outcome_write',
    'saban_capacity_write',
    '!states[0].saban_readable',
    '!states[1].yard_readable',
  ])assert.ok(source.includes(fragment),'required diagnostic not present: '+fragment);
});
