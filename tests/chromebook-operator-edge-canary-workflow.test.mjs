import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/chromebook-operator-edge-canary.yml','utf8');

test('production edge canary spans one resident updater window only for the Visual Desk deployment-lag signature',()=>{
  assert.match(workflow,/timeout-minutes: 8/);
  assert.match(workflow,/max_attempts=16/);
  assert.match(workflow,/stage\" = \"visual_desk/);
  assert.match(workflow,/error\" = \"http_404:\/visuals\//);
  assert.match(workflow,/sleep 20/);
  assert.match(workflow,/All other production failures remain immediate/);
});

test('production edge canary still exits nonzero after bounded retry exhaustion',()=>{
  assert.match(workflow,/exit \"\$status\"/);
  assert.match(workflow,/failed with status \$status after \$attempt attempt/);
});


test('root 502 retry is admitted only after the same run observed Visual Desk deployment lag',()=>{
  assert.match(workflow,/deployment_wait_started=false/);
  assert.match(workflow,/deployment_wait_started=true/);
  assert.match(workflow,/deployment_wait_started\" = \"true/);
  assert.match(workflow,/stage\" = \"customer_surface/);
  assert.match(workflow,/error\" = \"http_502:\//);
  assert.match(workflow,/A 502 without that prior deployment-lag evidence remains immediate/);
});
