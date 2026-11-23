import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const packageInfo=JSON.parse(fs.readFileSync('package.json','utf8'));
const runner='scripts/verify-fabric-journal-build-isolated.mjs';

test('Fabric local release verification must not call mutating journal:build',()=>{
  const command=packageInfo.scripts['test:fabric-local'];
  assert.ok(command.startsWith('node '+runner+' && node --test '));
  assert.ok(!command.includes('journal:build'));
  assert.equal(packageInfo.scripts['journal:build'],
    'node systemia/newsroom/journal-publisher.mjs systemia/newsroom/stories public/journal',
    'explicit canonical Journal publishing remains a distinct operation');
});
test('isolated Journal proof verifies artifacts but does not dirty tracked Journal',()=>{
  const status=()=>spawnSync('git',['status','--porcelain=v1','--untracked-files=all','--','public/journal'],{
    encoding:'utf8',timeout:15000
  });
  const before=status();
  assert.equal(before.status,0,before.stderr);
  const run=spawnSync(process.execPath,[runner],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const output=JSON.parse(run.stdout.trim());
  assert.equal(output.verified,true);
  assert.equal(output.tracked_journal_written,false);
  const after=status();
  assert.equal(after.status,0,after.stderr);
  assert.equal(after.stdout,before.stdout,
    'release proof must not alter tracked or untracked public/journal assets');
});
test('updater continues using protected source and Journal preflight',()=>{
  const updater=fs.readFileSync('scripts/update-fabric-owned-edge.sh','utf8');
  assert.match(updater,/npm run test:fabric-local/);
  assert.match(updater,/HOLD: local Journal work is present; preserved without automated restore\/clean/);
  assert.match(updater,/as_user node "\$DIRT_CLASSIFIER" --journal-dirty/);
});
