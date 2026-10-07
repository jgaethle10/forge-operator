import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorldForgeStarterProject } from './world-forge-http.js';
import {
  applyWorldForgeChangeSet,
  createWorldForgeChangeSet,
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
