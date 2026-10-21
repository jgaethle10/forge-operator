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

const destructive=classifyRelease({changedFiles:['migrations/004-drop-old.sql']});
assert.equal(destructive.riskClass,'destructive');

const destructivePatch=classifyRelease({changedFiles:['src/db.ts'],patch:'+ await db.execute("DROP TABLE customers")'});
assert.equal(destructivePatch.riskClass,'destructive');

console.log('Systemia release policy tests: PASS');


import fs from 'node:fs';
const publishWorkflow=fs.readFileSync('.github/workflows/publish-runtime.yml','utf8');
assert.match(publishWorkflow,/push:\n\s+branches:\n\s+- main/);
assert.doesNotMatch(publishWorkflow,/workflow_run:/);
assert.match(publishWorkflow,/github\.event_name == 'push'/);
assert.match(publishWorkflow,/SHA="\$\{\{ github\.sha \}\}"/);
assert.match(publishWorkflow,/Verify exact release candidate/);
assert.match(publishWorkflow,/run: npm run check/);
assert.match(publishWorkflow,/Build production container/);
