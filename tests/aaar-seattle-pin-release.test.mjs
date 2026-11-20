import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const script=fs.readFileSync('scripts/publish-aaar-seattle-now.mjs','utf8');
const html=fs.readFileSync('public/worlds/flight/index.html');
const expected='c2a680c20dac6602f977f57b8640c31c9c3a68a4317abb732092af41edc8d23c';

test('Sky Passport 1.2 owner release pins approved candidate and exact new flight asset',()=>{
 const pin='274f9ff0fd08ab51576cb6f0c6ad2b23eabe831f';
 const pinned=spawnSync('git',['show',pin+':public/worlds/flight/index.html'],{encoding:'buffer',maxBuffer:2*1024*1024,timeout:5000});
 // GitHub Actions checkout is shallow; the parent pin may be absent there.
 // The owner-side helper still requires the pinned commit to exist and be an
 // ancestor of fetched main before it can run, failing closed on Penguin.
 if(pinned.status===0)assert.equal(createHash('sha256').update(pinned.stdout).digest('hex'),expected);
 assert.equal(createHash('sha256').update(html).digest('hex'),expected);
 assert.match(script,/274f9ff0fd08ab51576cb6f0c6ad2b23eabe831f/);
 assert.ok(script.includes(expected));
 assert.match(html.toString('utf8'),/id="aaar-seattle-geography"/);
 assert.match(html.toString('utf8'),/Space Needle/);
 assert.match(html.toString('utf8'),/seattle-vista-v11/);
 assert.match(html.toString('utf8'),/id="aaar-sky-passport-model"/);
 assert.match(html.toString('utf8'),/AAARCreateSkyPassport/);
 assert.match(html.toString('utf8'),/STYLIZED_GAMEPLAY_HIGHLANDS/);
 assert.ok(script.includes("const ALLOWED_OLD='4914c2eef58750031169469b3884692035b93fb1d2e1ece3a7d6f2802c609134'"));
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
