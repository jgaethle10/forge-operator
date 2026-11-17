import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HARBOR_FINDMYPART_LAUNCH as kit} from '../systemia/distribution/harbor/findmypart-launch.mjs';

test('source readiness and Harbor distribution must not bypass the launch hold',()=>{
 const readiness=JSON.parse(readFileSync('systemia/launch/findmypart-launch-readiness.json','utf8'));
 assert.equal(readiness.launch_permission,false);
 assert.equal(kit.publish_authorized,false);
 assert.equal(kit.public_route_verified,false);
 assert.equal(kit.authenticated_systemia_handoff,false);
 assert.equal(kit.outcome.posted,false);
 assert.equal(kit.outcome.scheduled,false);
 assert.equal(kit.verification_gates.includes('explicit_publish_authorization'),true);
});
test('actual canonical wordmark is retained in the source identity',()=>{
 const wordmark=readFileSync(kit.branding.wordmark,'utf8').toLowerCase();
 const logo=readFileSync(kit.branding.mark,'utf8').toLowerCase();
 assert.match(wordmark,/#f16b27/);
 assert.match(wordmark,/#151c25/);
 assert.match(logo,/#f16b27/);
 assert.equal(kit.prohibited_targets.includes('R&B Chicken & Soul'),true);
 assert.equal(kit.prohibited_targets.includes('Space Dudz'),true);
});
