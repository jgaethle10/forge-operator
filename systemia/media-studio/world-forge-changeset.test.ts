import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorldForgeStarterProject } from './world-forge-http.js';
import {
  applyWorldForgeChangeSet,
  createWorldForgeChangeSet,
  rebaseWorldForgeChangeSet,
} from './world-forge-changeset.js';

test('World Forge ChangeSet applies multiple scene edits atomically in one version',()=>{
  const project=createWorldForgeStarterProject();
  const changeSet=createWorldForgeChangeSet({
    project,
    id:'layout-pass-001',
    title:'Layout pass',
    author:{kind:'agent',id:'saban-layout'},
    operations:[
      {
        type:'set_transform',
        nodeId:'hero-core',
        transform:{position:{x:1,y:0,z:1}},
      },
      {
        type:'set_visibility',
        nodeId:'plinth-left',
        visible:false,
      },
    ],
  });

  const result=applyWorldForgeChangeSet({project,changeSet});
  assert.equal(result.status,'applied');
  assert.ok(result.mutation);
  assert.equal(result.mutation?.project.version,project.version+1);
  assert.equal(
    result.mutation?.project.nodes.find(node=>node.id==='hero-core')?.transform.position.x,
    1,
  );
  assert.equal(
    result.mutation?.project.nodes.find(node=>node.id==='plinth-left')?.visible,
    false,
  );
  assert.equal(result.boundaries.atomic,true);
  assert.equal(result.boundaries.publicationAuthorityGranted,false);
});

test('World Forge ChangeSet rejects stale digest and version without mutating the project',()=>{
  const project=createWorldForgeStarterProject();
  const changeSet=createWorldForgeChangeSet({
    project,
    id:'stale-layout',
    title:'Stale layout',
    author:{kind:'agent',id:'saban-layout'},
    operations:[{
      type:'set_transform',
      nodeId:'hero-core',
      transform:{position:{x:2,y:0,z:1}},
    }],
  });

  const newer={
    ...project,
    version:project.version+1,
    nodes:project.nodes.map(node=>node.id==='hero-core'
      ? {...node,transform:{...node.transform,position:{x:.5,y:0,z:1}}}
      : node),
  };

  const result=applyWorldForgeChangeSet({project:newer,changeSet});
  assert.equal(result.status,'blocked');
  assert.match(result.reason??'',/change_set_version_conflict/);
  assert.equal(result.mutation,undefined);
});

test('World Forge ChangeSet is atomic when a later operation fails',()=>{
  const project=createWorldForgeStarterProject();
  const changeSet=createWorldForgeChangeSet({
    project,
    id:'atomic-failure',
    title:'Atomic failure proof',
    author:{kind:'human',id:'studio-operator'},
    operations:[
      {
        type:'set_transform',
        nodeId:'hero-core',
        transform:{position:{x:3,y:0,z:1}},
      },
      {
        type:'set_transform',
        nodeId:'world-floor',
        transform:{position:{x:0,y:0,z:0}},
      },
    ],
  });

  const result=applyWorldForgeChangeSet({project,changeSet});
  assert.equal(result.status,'blocked');
  assert.ok(result.mutation);
  assert.equal(result.mutation?.status,'blocked');
  assert.equal(
    result.mutation?.project.nodes.find(node=>node.id==='hero-core')?.transform.position.x,
    0,
  );
});

test('destructive ChangeSet operations require explicit ChangeSet authority',()=>{
  const project=createWorldForgeStarterProject();
  const ungranted=createWorldForgeChangeSet({
    project,
    id:'remove-plinth',
    title:'Remove plinth',
    author:{kind:'agent',id:'saban-layout'},
    operations:[{
      type:'remove_node',
      nodeId:'plinth-left',
      allowDestructive:true,
    }],
  });

  const blocked=applyWorldForgeChangeSet({project,changeSet:ungranted});
  assert.equal(blocked.status,'blocked');
  assert.equal(blocked.reason,'change_set_destructive_authority_required');

  const granted=createWorldForgeChangeSet({
    project,
    id:'remove-plinth-approved',
    title:'Remove plinth approved',
    author:{kind:'human',id:'studio-operator'},
    operations:[{
      type:'remove_node',
      nodeId:'plinth-left',
      allowDestructive:true,
    }],
    destructiveAuthority:true,
  });

  const applied=applyWorldForgeChangeSet({project,changeSet:granted});
  assert.equal(applied.status,'applied');
  assert.equal(
    applied.mutation?.project.nodes.some(node=>node.id==='plinth-left'),
    false,
  );
});

test('tampered ChangeSet digest fails closed',()=>{
  const project=createWorldForgeStarterProject();
  const changeSet=createWorldForgeChangeSet({
    project,
    id:'tampered',
    title:'Tampered',
    author:{kind:'system',id:'test'},
    operations:[{
      type:'set_visibility',
      nodeId:'hero-core',
      visible:false,
    }],
  });
  changeSet.operations[0]={
    type:'set_visibility',
    nodeId:'hero-core',
    visible:true,
  };

  const result=applyWorldForgeChangeSet({project,changeSet});
  assert.equal(result.status,'blocked');
  assert.equal(result.reason,'change_set_digest_invalid');
});


test('World Forge ChangeSet safely rebases across unrelated node changes',()=>{
  const project=createWorldForgeStarterProject();
  const changeSet=createWorldForgeChangeSet({
    project,
    id:'hero-layout',
    title:'Hero layout',
    author:{kind:'agent',id:'saban-layout'},
    operations:[{
      type:'set_transform',
      nodeId:'hero-core',
      transform:{position:{x:2,y:0,z:1}},
    }],
  });

  assert.equal(changeSet.preconditions.length,1);
  assert.equal(changeSet.preconditions[0].nodeId,'hero-core');
  assert.equal(changeSet.preconditions[0].state,'present');

  const unrelated={
    ...project,
    version:project.version+1,
    nodes:project.nodes.map(node=>node.id==='plinth-right'
      ? {...node,visible:false}
      : node),
  };

  const strict=applyWorldForgeChangeSet({project:unrelated,changeSet});
  assert.equal(strict.status,'blocked');
  assert.match(strict.reason??'',/change_set_version_conflict/);

  const rebase=rebaseWorldForgeChangeSet({project:unrelated,changeSet});
  assert.equal(rebase.status,'rebased');
  assert.ok(rebase.changeSet);
  assert.equal(rebase.conflicts.length,0);
  assert.equal(rebase.changeSet?.baseVersion,unrelated.version);
  assert.equal(rebase.changeSet?.lineage?.parentChangeSetDigest,changeSet.digest);

  const applied=applyWorldForgeChangeSet({
    project:unrelated,
    changeSet:rebase.changeSet!,
  });
  assert.equal(applied.status,'applied');
  assert.equal(
    applied.mutation?.project.nodes.find(node=>node.id==='hero-core')?.transform.position.x,
    2,
  );
  assert.equal(
    applied.mutation?.project.nodes.find(node=>node.id==='plinth-right')?.visible,
    false,
  );
});

test('World Forge ChangeSet rebase blocks when a touched node changed',()=>{
  const project=createWorldForgeStarterProject();
  const changeSet=createWorldForgeChangeSet({
    project,
    id:'hero-camera-pass',
    title:'Hero pass',
    author:{kind:'agent',id:'saban-layout'},
    operations:[{
      type:'set_transform',
      nodeId:'hero-core',
      transform:{position:{x:2,y:0,z:1}},
    }],
  });

  const conflicting={
    ...project,
    version:project.version+1,
    nodes:project.nodes.map(node=>node.id==='hero-core'
      ? {...node,name:'Hero Core Human Edit'}
      : node),
  };

  const rebase=rebaseWorldForgeChangeSet({project:conflicting,changeSet});
  assert.equal(rebase.status,'blocked');
  assert.equal(rebase.reason,'change_set_resource_conflict');
  assert.ok(rebase.conflicts.some(conflict=>conflict.startsWith('node_changed:hero-core:')));
  assert.equal(rebase.changeSet,undefined);
});

test('World Forge ChangeSet rebase detects concurrent creation of the same node ID',()=>{
  const project=createWorldForgeStarterProject();
  const node={
    id:'new-prop',
    name:'New Prop',
    kind:'mesh' as const,
    transform:{
      position:{x:0,y:0,z:1},
      rotationDeg:{x:0,y:0,z:0},
      scale:{x:1,y:1,z:1},
    },
    geometry:{kind:'primitive' as const,primitive:'cube' as const},
  };
  const changeSet=createWorldForgeChangeSet({
    project,
    id:'add-prop',
    title:'Add prop',
    author:{kind:'agent',id:'saban-props'},
    operations:[{type:'add_node',node}],
  });

  assert.equal(changeSet.preconditions[0].state,'absent');

  const concurrent={
    ...project,
    version:project.version+1,
    nodes:[...project.nodes,{...node,name:'Human Prop'}],
  };

  const rebase=rebaseWorldForgeChangeSet({project:concurrent,changeSet});
  assert.equal(rebase.status,'blocked');
  assert.deepEqual(rebase.conflicts,['node_expected_absent:new-prop']);
});
