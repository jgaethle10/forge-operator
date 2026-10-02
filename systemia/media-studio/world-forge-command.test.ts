import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorldForgeStarterProject } from './world-forge-http.js';
import { compileWorldForgeCommand } from './world-forge-command.js';

test('World Forge command planner compiles directional movement into typed scene operations',()=>{
  const project=createWorldForgeStarterProject();
  const plan=compileWorldForgeCommand({
    project,
    selectedNodeId:'hero-core',
    instruction:'move right by 2 meters',
  });
  assert.equal(plan.status,'accepted');
  assert.equal(plan.targetNodeId,'hero-core');
  assert.deepEqual(plan.operations,[{
    type:'set_transform',
    nodeId:'hero-core',
    transform:{
      position:{x:2,y:0,z:1},
    },
  }]);
});

test('World Forge command planner compiles rotate, scale, and visibility commands',()=>{
  const project=createWorldForgeStarterProject();

  const rotate=compileWorldForgeCommand({
    project,
    selectedNodeId:'hero-core',
    instruction:'rotate z by 45 degrees',
  });
  assert.equal(rotate.status,'accepted');
  assert.deepEqual(rotate.operations,[{
    type:'set_transform',
    nodeId:'hero-core',
    transform:{rotationDeg:{x:0,y:0,z:45}},
  }]);

  const scale=compileWorldForgeCommand({
    project,
    selectedNodeId:'hero-core',
    instruction:'scale uniformly to 1.5',
  });
  assert.equal(scale.status,'accepted');
  assert.deepEqual(scale.operations,[{
    type:'set_transform',
    nodeId:'hero-core',
    transform:{scale:{x:1.5,y:1.5,z:1.5}},
  }]);

  const hide=compileWorldForgeCommand({
    project,
    selectedNodeId:'hero-core',
    instruction:'hide',
  });
  assert.deepEqual(hide.operations,[{
    type:'set_visibility',
    nodeId:'hero-core',
    visible:false,
  }]);
});

test('World Forge command bar never silently grants destructive authority',()=>{
  const project=createWorldForgeStarterProject();
  const plan=compileWorldForgeCommand({
    project,
    selectedNodeId:'hero-core',
    instruction:'delete this object',
  });
  assert.equal(plan.status,'blocked');
  assert.deepEqual(plan.operations,[]);
  assert.ok(plan.reasons.includes('destructive_command_requires_explicit_ui_authority'));
});

test('World Forge command planner respects locked canonical scene objects',()=>{
  const project=createWorldForgeStarterProject();
  const plan=compileWorldForgeCommand({
    project,
    selectedNodeId:'world-floor',
    instruction:'move up 2 meters',
  });
  assert.equal(plan.status,'blocked');
  assert.ok(plan.reasons.some(reason=>reason.startsWith('node_locked:')));
});
