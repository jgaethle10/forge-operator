import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const rescue=fs.readFileSync(new URL('../scripts/rescue-fabric-journal-edge.sh',import.meta.url),'utf8');

test('retired Journal rescue remains syntax valid and bound to the authorized repo',()=>{
 const check=spawnSync('bash',['-n'],{input:rescue,encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
 assert.match(rescue,/jgaethle10\/forge-operator/);
 assert.match(rescue,/remote get-url "\$REMOTE"/);
 assert.match(rescue,/origin is not the authorized Forge repository/);
});
test('legacy Journal rescue cannot delete or overwrite unpublished Journal, Worlds, or source',()=>{
 assert.doesNotMatch(rescue,/\bgit .*restore\b/);
 assert.doesNotMatch(rescue,/\bgit .*reset\b/);
 assert.doesNotMatch(rescue,/\bgit .*clean\b/);
 assert.doesNotMatch(rescue,/\bgit .*stash\b/);
 assert.doesNotMatch(rescue,/\bgit .*checkout\b/);
 assert.doesNotMatch(rescue,/\bgit .*merge\b/);
 assert.doesNotMatch(rescue,/\bgit .*fetch\b/);
 assert.doesNotMatch(rescue,/\bsystemctl (?:start|restart|enable|stop)\b/);
 assert.doesNotMatch(rescue,/install-fabric-self-update\.sh|journal-rescue\.json/);
 assert.match(rescue,/NO_DEPLOY: this retired rescue performs no mutation/);
});
test('retired rescue must hold on both unpublished Journal and ordinary source changes',()=>{
 const status=rescue.indexOf('status --porcelain=v1 --untracked-files=all');
 const blocker=rescue.indexOf('--blocking-lines');
 const journal=rescue.indexOf('--journal-dirty');
 const hold=rescue.indexOf('HOLD: unpublished Journal or source work remains.');
 assert.ok(status>=0&&blocker>status&&journal>status&&hold>journal);
 assert.match(rescue,/if \[\[ -n "\$blocking" \|\| "\$journal_dirty" == "true" \]\]; then/);
 assert.match(rescue,/exit 4/);
 assert.match(rescue,/classify-fabric-checkout-dirt\.mjs/);
});
test('read-only help explains that recovery requires independent reconciliation',()=>{
 assert.match(rescue,/After intentional source reconciliation use the guarded Fabric updater/);
 assert.match(rescue,/never restores, cleans, resets, fetches, merges, restarts/);
});
