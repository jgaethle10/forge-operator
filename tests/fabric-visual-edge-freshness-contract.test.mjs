import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script=fs.readFileSync('scripts/fabric-edge-visual-freshness.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/visual-edge-freshness-diagnostic.yml','utf8');

test('visual freshness probe can fail closed when production freshness is required',()=>{
  assert.match(script,/process\.argv\.includes\('--require-fresh'\)/);
  assert.match(script,/requireFresh&&result\.state!=='fresh'/);
  assert.match(script,/process\.exitCode=1/);
  assert.match(script,/source_release_ref:health\.source_release_ref/);
  assert.match(script,/source_release_ref_bound:health\.source_release_ref_bound===true/);
});

test('main visual freshness workflow gives the owned updater one bounded convergence window',()=>{
  assert.match(workflow,/push:\n\s+branches: \[main\]/);
  assert.match(workflow,/GITHUB_EVENT_NAME/);
  assert.match(workflow,/--require-fresh/);
  assert.match(workflow,/max_attempts=16/);
  assert.match(workflow,/sleep 20/);
  assert.match(workflow,/Visual Desk failed to converge/);
  assert.match(workflow,/scripts\/update-fabric-owned-edge\.sh/);
  assert.match(workflow,/systemia\/mcp\/fabric-local-runtime\.mjs/);
});
