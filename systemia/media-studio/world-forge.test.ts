import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyWorldForgeOperations,
  buildWorldForgeRenderPlan,
  createEmptyWorldForgeProject,
  identityWorldForgeTransform,
  validateWorldForgeProject,
  worldForgeDigest,
  type WorldForgeProject,
} from './world-forge.js';

function specimen():WorldForgeProject{
  const project=createEmptyWorldForgeProject({
    id:'world-forge-test',
    title:'World Forge Test',
  });

  project.assets.push({
    id:'mesh-table',
    kind:'mesh',
    uri:'asset://mesh-table',
    digest:'abc123',
    evidenceState:'licensed',
    rightsState:'owned',
    sourceRefs:['asset-ledger:mesh-table'],
  });

  project.materials.push({
    id:'mat-black',
    name:'Black',
    model:'pbr',
    baseColor:[.02,.02,.02,1],
    metallic:.2,
    roughness:.35,
  });

  project.nodes.push({
    id:'table',
    name:'Table',
    kind:'mesh',
    transform:identityWorldForgeTransform(),
    geometry:{kind:'asset',assetId:'mesh-table'},
    materialIds:['mat-black'],
  });

  return project;
}

test('World Forge validates a canonical scene and ignores timestamps in digest',()=>{
  const project=specimen();
  const validation=validateWorldForgeProject(project);
  assert.equal(validation.status,'accepted');

  const digest=worldForgeDigest(project);
  project.createdAt='2099-01-01T00:00:00.000Z';
  project.updatedAt='2099-01-02T00:00:00.000Z';
  assert.equal(worldForgeDigest(project),digest);
});

test('World Forge fails closed on hierarchy cycles',()=>{
  const project=specimen();
  project.nodes.push({
    id:'a',
    name:'A',
    kind:'empty',
    parentId:'b',
    transform:identityWorldForgeTransform(),
  });
  project.nodes.push({
    id:'b',
    name:'B',
    kind:'empty',
    parentId:'a',
    transform:identityWorldForgeTransform(),
  });

  const validation=validateWorldForgeProject(project);
  assert.equal(validation.status,'rejected');
  assert.ok(validation.errors.some(error=>error.startsWith('node_hierarchy_cycle:')));
});

test('World Forge agent mutations are bounded, versioned, and reversible',()=>{
  const project=specimen();
  const result=applyWorldForgeOperations({
    project,
    expectedVersion:1,
    operations:[
      {
        type:'set_transform',
        nodeId:'table',
        transform:{position:{x:2,y:1,z:.5}},
      },
      {
        type:'add_modifier',
        nodeId:'table',
        modifier:{id:'bev-1',type:'bevel',width:.03,segments:3},
      },
    ],
  });

  assert.equal(result.status,'completed');
  assert.equal(result.project.version,2);
  const table=result.project.nodes.find(node=>node.id==='table');
  assert.deepEqual(table?.transform.position,{x:2,y:1,z:.5});
  assert.equal(table?.modifiers?.[0].type,'bevel');
  assert.equal(result.receipt.inverseOperations.length,2);
  assert.notEqual(result.receipt.digestBefore,result.receipt.digestAfter);
});

test('World Forge refuses destructive edits without explicit authority',()=>{
  const project=specimen();
  const result=applyWorldForgeOperations({
    project,
    expectedVersion:1,
    operations:[{type:'remove_node',nodeId:'table'}],
  });

  assert.equal(result.status,'blocked');
  assert.equal(result.project.version,1);
  assert.match(result.receipt.rejectedOperations[0].reason,/destructive_authority_required/);
});


test('World Forge material bindings carry a real inverse operation',()=>{
  const project=specimen();
  project.materials.push({
    id:'mat-gold',
    name:'Gold',
    model:'pbr',
    baseColor:[.72,.55,.23,1],
    metallic:.8,
    roughness:.22,
  });

  const result=applyWorldForgeOperations({
    project,
    expectedVersion:1,
    operations:[{type:'bind_material',nodeId:'table',materialId:'mat-gold',slot:0}],
  });

  assert.equal(result.status,'completed');
  assert.equal(result.project.nodes.find(node=>node.id==='table')?.materialIds?.[0],'mat-gold');
  assert.deepEqual(
    result.receipt.inverseOperations[0],
    {type:'bind_material',nodeId:'table',materialId:'mat-black',slot:0},
  );
});

test('World Forge render planning blocks uncleared assets',()=>{
  const project=specimen();
  const accepted=buildWorldForgeRenderPlan({project,renderIntentId:'preview'});
  assert.equal(accepted.requirements.true3DScene,true);
  assert.equal(accepted.backend.executable,false);

  project.assets[0].rightsState='restricted';
  assert.throws(
    ()=>buildWorldForgeRenderPlan({project,renderIntentId:'preview'}),
    /render_assets_not_cleared/,
  );
});
