import assert from 'node:assert/strict';
import { classifyRelease } from './release-policy.mjs';

assert.equal(classifyRelease({changedFiles:['src/App.tsx']}).riskClass,'routine_public');
assert.equal(classifyRelease({changedFiles:['public/llms.txt','registry/forge/server.json']}).autoReleaseAllowed,true);

const auth=classifyRelease({changedFiles:['src/auth/session.ts']});
assert.equal(auth.riskClass,'trust_surface');
assert.equal(auth.requiresHumanApproval,true);

const workflow=classifyRelease({changedFiles:['.github/workflows/publish-runtime.yml']});
assert.equal(workflow.riskClass,'trust_surface');

const rules=classifyRelease({changedFiles:['firestore.rules']});
assert.equal(rules.riskClass,'trust_surface');

const rivetRuntime=classifyRelease({changedFiles:['systemia/rivet/report-runtime.mjs']});
assert.equal(rivetRuntime.riskClass,'trust_surface');
assert.equal(rivetRuntime.requiresHumanApproval,true);
assert.equal(rivetRuntime.autoReleaseAllowed,false);
assert.ok(rivetRuntime.reasons.includes('protected_rivet_path:systemia/rivet/report-runtime.mjs'));

const rivetProof=classifyRelease({changedFiles:['public/chum/proof/rivet.json']});
assert.equal(rivetProof.riskClass,'trust_surface');
assert.equal(rivetProof.autoReleaseAllowed,false);

const rivetBrand=classifyRelease({changedFiles:['public/rivet/brand.css']});
assert.equal(rivetBrand.riskClass,'trust_surface');
assert.equal(rivetBrand.autoReleaseAllowed,false);

const rivetHostingPlan=classifyRelease({changedFiles:['governance/rivet-hosting-migration/README.md']});
assert.equal(rivetHostingPlan.riskClass,'routine_public');
assert.equal(rivetHostingPlan.autoReleaseAllowed,true);

const destructive=classifyRelease({changedFiles:['migrations/004-drop-old.sql']});
assert.equal(destructive.riskClass,'destructive');

const destructivePatch=classifyRelease({changedFiles:['src/db.ts'],patch:'+ await db.execute("DROP TABLE customers")'});
assert.equal(destructivePatch.riskClass,'destructive');

console.log('Systemia release policy tests: PASS');
