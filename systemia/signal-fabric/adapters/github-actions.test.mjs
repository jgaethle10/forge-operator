import assert from 'node:assert/strict';
import { githubWorkflowRunToSignal } from './adapters/github-actions.mjs';
import { classify } from './router.mjs';

const cancelled=githubWorkflowRunToSignal({id:1,name:'Forge checks',head_branch:'systemia/foo',conclusion:'cancelled',updated_at:'2026-09-24T20:00:00Z'});
assert.equal(classify(cancelled),'receipt');

const branchFail=githubWorkflowRunToSignal({id:2,name:'Forge checks',head_branch:'feature/foo',conclusion:'failure',updated_at:'2026-09-24T20:00:00Z'});
assert.equal(classify(branchFail),'notice');

const mainFail=githubWorkflowRunToSignal({id:3,name:'Forge checks',head_branch:'main',conclusion:'failure',updated_at:'2026-09-24T20:00:00Z'});
assert.equal(classify(mainFail),'warning');

const liveFail=githubWorkflowRunToSignal({id:4,name:'Live canary',head_branch:'main',conclusion:'failure',updated_at:'2026-09-24T20:00:00Z'},{liveImpact:true});
assert.equal(classify(liveFail),'critical');

console.log('SIGNAL FABRIC GITHUB ADAPTER PASS');
