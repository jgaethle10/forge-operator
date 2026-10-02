import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorldForgeStarterProject } from './world-forge-http.js';
import {
  applyWorldForgeOperations,
  buildWorldForgeRenderPlan,
  validateWorldForgeProject,
} from './world-forge.js';

test('World Forge starter is valid, editable, and render-plannable',()=>{
  const project=createWorldForgeStarterProject();
  const validation=validateWorldForgeProject(project);
  assert.equal(validation.status,'accepted');
  assert.equal(project.nodes.some(node=>node.kind==='camera'),true);
  assert.equal(project.nodes.some(node=>node.kind==='light'),true);
  assert.equal(project.nodes.some(node=>node.kind==='mesh'),true);

  const result=applyWorldForgeOperations({
    project,
    expectedVersion:project.version,
    operations:[{
      type:'set_transform',
      nodeId:'hero-core',
      transform:{position:{x:1,y:.5,z:1.25}},
    }],
  });
  assert.equal(result.status,'completed');
  assert.equal(result.project.version,project.version+1);

  const plan=buildWorldForgeRenderPlan({
    project:result.project,
    renderIntentId:'preview',
  });
  assert.equal(plan.backend.executable,false);
  assert.equal(plan.requirements.true3DScene,true);
});

test('World Forge starter keeps environment locks separate from editable hero content',()=>{
  const project=createWorldForgeStarterProject();
  const locked=applyWorldForgeOperations({
    project,
    expectedVersion:project.version,
    operations:[{
      type:'set_transform',
      nodeId:'world-floor',
      transform:{position:{x:4}},
    }],
  });
  assert.equal(locked.status,'blocked');
  assert.match(locked.receipt.rejectedOperations[0].reason,/node_locked/);
});
