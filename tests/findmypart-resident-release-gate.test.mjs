import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const updater=fs.readFileSync('scripts/update-fabric-owned-edge.sh','utf8');
const doctor=fs.readFileSync('scripts/diagnose-fabric-owned-edge-release.sh','utf8');
const localRuntime=fs.readFileSync('systemia/mcp/fabric-local-runtime.mjs','utf8');
const buyerHtml=fs.readFileSync('public/findmypart/index.html','utf8');
const buyerApp=fs.readFileSync('public/findmypart/app.mjs','utf8');

test('resident Fabric updater verifies the exact local FindMyPart route before accepting an update',()=>{
 const start=updater.indexOf('verify_current_runtime()');
 const guard=updater.indexOf('FindMyPart resident buyer page not serving approved route');
 const attestation=updater.indexOf('local attestation_code=10',start);
 assert.ok(start>=0&&guard>start&&guard<attestation);
 for(const route of ['/findmypart/','/findmypart/app.mjs','/api/findmypart/readiness']){
  assert.ok(updater.includes("'http://127.0.0.1:8787"+route+"'"));
 }
 assert.match(updater,/return 15/);
 assert.match(updater,/return 16/);
 assert.match(updater,/return 17/);
 assert.match(updater,/payment_ready!==false/);
 assert.match(updater,/payment_verified!==false/);
 assert.match(updater,/runuser -u "\$RUN_USER"/);
 assert.doesNotMatch(updater,/curl[^\n]*http:\/\/127\.0\.0\.1:8787\/api\/findmypart\/inquiry/);
});

test('resident source, buyer app and diagnostics agree on the same paths',()=>{
 assert.match(localRuntime,/findMyPartAssets\.has\(findMyPartPath\)/);
 assert.match(localRuntime,/\/findmypart\/app\.mjs/);
 assert.match(buyerHtml,/id="part-request-form"/);
 assert.match(buyerHtml,/Missing part\./);
 assert.match(buyerApp,/\/api\/findmypart\/inquiry/);
 assert.match(buyerApp,/\/api\/findmypart\/readiness/);
 for(const route of ['/findmypart/','/findmypart','/api/findmypart/readiness'])
  assert.ok(doctor.includes("'"+route+"'"));
});

test('existing verified release rollback and source drift holds remain intact',()=>{
 for(const phrase of [
  'remote branch is not a fast-forward from the deployed revision',
  'checkout has source changes',
  'rollback "proof_failed"',
  'rollback "service_restart_failed"',
  'rollback "runtime_verification_failed_$code"',
  'write_runtime_release_ref "$target"',
 ])assert.ok(updater.includes(phrase),phrase);
});
