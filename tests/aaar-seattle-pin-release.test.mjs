import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const script=fs.readFileSync('scripts/publish-aaar-seattle-now.mjs','utf8');
const html=fs.readFileSync('public/worlds/flight/index.html');
const expected='d34fc1fb244565236880c3922cd2e7b89923768bfe2812f5fed652875ef0b2e0';

test('emergency flight release pins exact reviewed Seattle main and static asset',()=>{
 assert.equal(createHash('sha256').update(html).digest('hex'),expected);
 assert.match(script,/6dce44dd35aad415354c7d0659850c959f9735a7/);
 assert.ok(script.includes(expected));
 assert.match(html.toString('utf8'),/id="aaar-seattle-geography"/);
 assert.match(html.toString('utf8'),/Space Needle/);
 assert.match(html.toString('utf8'),/flat-lit-glass-water-v10/);
 assert.ok(script.includes("const ALLOWED_OLD='c57de0eec09b1aadc1124c7464a0e825ce30251fdd05f1f088f4549a7915feed'"));
});
test('operator release gates same named Penguin vault and actual local route',()=>{
 assert.match(script,/os\.hostname\(\)!=='penguin'/);
 assert.match(script,/worlds-vault-runtime\.mjs/);
 assert.match(script,/--user','cat','evercraft-worlds-vault\.service'/);
 assert.match(script,/owned_worlds_health_mismatch/);
 assert.match(script,/actual_vault_not_serving_the_checked_file_hold/);
});
test('no bulk Git checkout changes or unrelated service, Caddy, DNS edits',()=>{
 assert.doesNotMatch(script,/['"]reset['"]|['"]clean['"]|['"]checkout['"]|['"]merge['"]|['"]push['"]|['"]commit['"]/);
 assert.doesNotMatch(script,/systemctl.*restart|caddy|cloudflare|dns-edit/i);
 assert.match(script,/fs\.rename\(temp,target\)/);
 assert.match(script,/local_readback_failed_rolled_back/);
});
test('script refuses to run in CI instead of claiming deployment',()=>{
 const run=spawnSync(process.execPath,['scripts/publish-aaar-seattle-now.mjs','--apply'],{encoding:'utf8',timeout:5000});
 assert.notEqual(run.status,0);
 assert.match(run.stderr,/must_run_as_regular_user_on_penguin/);
 assert.match(run.stderr,/"state": "HOLD"/);
});
