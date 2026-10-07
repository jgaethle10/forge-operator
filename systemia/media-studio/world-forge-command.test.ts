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



test('World Forge command planner authors camera lens and look-at through typed operations',()=>{
  const project=createWorldForgeStarterProject();

  const lens=compileWorldForgeCommand({
    project,
    selectedNodeId:'camera-main',
    instruction:'lens 35mm',
  });
  assert.equal(lens.status,'accepted');
  assert.deepEqual(lens.operations,[{
    type:'set_camera',
    nodeId:'camera-main',
    camera:{focalLengthMm:35},
  }]);

  const look=compileWorldForgeCommand({
    project,
    selectedNodeId:'camera-main',
    instruction:'look at 1 2 3',
  });
  assert.equal(look.status,'accepted');
  assert.deepEqual(look.operations,[{
    type:'set_camera',
    nodeId:'camera-main',
    camera:{lookAt:{x:1,y:2,z:3}},
  }]);
});

test('World Forge command planner compiles editable mesh conversion and extrusion',()=>{
  const project=createWorldForgeStarterProject();

  const editable=compileWorldForgeCommand({
    project,
    selectedNodeId:'hero-core',
    instruction:'make editable',
  });
  assert.equal(editable.status,'accepted');
  assert.equal(editable.operations[0].type,'set_geometry');

  const converted={
    ...project,
    nodes:project.nodes.map(node=>node.id==='hero-core'
      ? {...node,geometry:(editable.operations[0] as any).geometry}
      : node),
  };

  const extrude=compileWorldForgeCommand({
    project:converted,
    selectedNodeId:'hero-core',
    instruction:'extrude face 1 by 0.5 meters',
  });
  assert.equal(extrude.status,'accepted');
  assert.equal(extrude.operations[0].type,'set_geometry');
  const geometry=(extrude.operations[0] as any).geometry;
  assert.equal(geometry.kind,'editable_mesh');
  assert.equal(geometry.mesh.vertices.length,12);
  assert.equal(geometry.mesh.faces.length,10);
});

test('World Forge command planner compiles non-destructive mesh inset and vertex movement',()=>{
  const project=createWorldForgeStarterProject();
  const editable=compileWorldForgeCommand({
    project,
    selectedNodeId:'hero-core',
    instruction:'make editable',
  });
  assert.equal(editable.status,'accepted');

  const converted={
    ...project,
    nodes:project.nodes.map(node=>node.id==='hero-core'
      ? {...node,geometry:(editable.operations[0] as any).geometry}
      : node),
  };

  const inset=compileWorldForgeCommand({
    project:converted,
    selectedNodeId:'hero-core',
    instruction:'inset face 1 by 0.25',
  });
  assert.equal(inset.status,'accepted');
  assert.equal(inset.operations[0].type,'set_geometry');
  const insetGeometry=(inset.operations[0] as any).geometry;
  assert.equal(insetGeometry.mesh.vertices.length,12);
  assert.equal(insetGeometry.mesh.faces.length,10);

  const movedProject={
    ...converted,
    nodes:converted.nodes.map(node=>node.id==='hero-core'
      ? {...node,geometry:insetGeometry}
      : node),
  };
  const moved=compileWorldForgeCommand({
    project:movedProject,
    selectedNodeId:'hero-core',
    instruction:'move vertices 8 9 10 11 by 0 0 0.2',
  });
  assert.equal(moved.status,'accepted');
  assert.equal(moved.operations[0].type,'set_geometry');
  const movedGeometry=(moved.operations[0] as any).geometry;
  assert.ok(movedGeometry.mesh.vertices.slice(8,12).every((vertex:any)=>vertex.z===.7));
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


test('World Forge command planner compiles bounded physics authoring',()=>{
  const project=createWorldForgeStarterProject();

  const dynamic=compileWorldForgeCommand({
    project,
    selectedNodeId:'hero-core',
    instruction:'make dynamic 3 kg gravity 0.8 damping 0.1 bounce 0.2 collider box',
  });
  assert.equal(dynamic.status,'accepted');
  assert.deepEqual(dynamic.operations,[{
    type:'set_physics',
    nodeId:'hero-core',
    physics:{
      mode:'dynamic',
      massKg:3,
      gravityScale:.8,
      linearDamping:.1,
      restitution:.2,
      collider:{type:'auto_box'},
    },
  }]);

  const staticPlan=compileWorldForgeCommand({
    project,
    selectedNodeId:'hero-core',
    instruction:'make static collider sphere',
  });
  assert.equal(staticPlan.status,'accepted');
  assert.deepEqual(staticPlan.operations,[{
    type:'set_physics',
    nodeId:'hero-core',
    physics:{
      mode:'static',
      massKg:undefined,
      gravityScale:undefined,
      linearDamping:undefined,
      restitution:0,
      collider:{type:'auto_sphere'},
    },
  }]);

  const disabled=compileWorldForgeCommand({
    project:{
      ...project,
      nodes:project.nodes.map(node=>node.id==='hero-core'
        ? {...node,physics:(dynamic.operations[0] as any).physics}
        : node),
    },
    selectedNodeId:'hero-core',
    instruction:'turn off physics',
  });
  assert.equal(disabled.status,'accepted');
  assert.deepEqual(disabled.operations,[{
    type:'set_physics',
    nodeId:'hero-core',
    physics:null,
  }]);
});
