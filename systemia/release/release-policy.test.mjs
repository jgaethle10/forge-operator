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

const llmRegistry=classifyRelease({changedFiles:['systemia/llm-product/build-registry.mjs']});
assert.equal(llmRegistry.riskClass,'trust_surface');

const publicProducts=classifyRelease({changedFiles:['registry/public-products.json']});
assert.equal(publicProducts.riskClass,'trust_surface');

const fabricPlugin=classifyRelease({changedFiles:['plugins/evercraft-fabric/plugin.json']});
assert.equal(fabricPlugin.riskClass,'trust_surface');

const destructive=classifyRelease({changedFiles:['migrations/004-drop-old.sql']});
assert.equal(destructive.riskClass,'destructive');

const destructivePatch=classifyRelease({changedFiles:['src/db.ts'],patch:'+ await db.execute("DROP TABLE customers")'});
assert.equal(destructivePatch.riskClass,'destructive');

console.log('Systemia release policy tests: PASS');
