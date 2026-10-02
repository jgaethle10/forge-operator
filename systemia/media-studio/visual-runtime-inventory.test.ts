import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVisualRuntimeInventory } from './visual-runtime-inventory.js';
import type { VisualModelEndpoint } from './model-fabric.js';
import type { VisualModelAdapter } from './model-fabric-runtime.js';

function endpoint(id:string,providerId:string,state:'declared'|'verified'='verified'):VisualModelEndpoint{
  return {
    id,providerId,displayName:id,enabled:true,executionState:state,
    capabilities:[{
      task:'video',inputModes:['text'],requirements:[],
      qualityTier:5,costTier:3,latencyTier:2
    }]
  };
}

function adapter(id:string,modelId:string,providerId:string,verified=true):VisualModelAdapter{
  return {
    id,modelId,providerId,verified,
    async execute(){throw new Error('inventory must never execute adapters');}
  };
}

test('only exact verified endpoint+adapter pairs become executable',()=>{
  const inventory=buildVisualRuntimeInventory({
    schema:'evercraft.fallen.visual-runtime-inventory-input.v1',
    id:'runtime',
    endpoints:[
      endpoint('veo','elevenlabs'),
      endpoint('runway','runway'),
      endpoint('declared','other','declared')
    ],
    adapters:[
      adapter('veo-adapter','veo','elevenlabs'),
      adapter('runway-adapter','runway','runway'),
      adapter('declared-adapter','declared','other')
    ],
    sourceRefs:['raven:runtime']
  });
  assert.deepEqual(inventory.executableModelIds,['runway','veo']);
  assert.deepEqual(inventory.blockedModelIds,['declared']);
  assert.equal(inventory.rows.find(row=>row.modelId==='declared')?.reasons.includes('endpoint_not_verified'),true);
  assert.equal(inventory.boundaries.noProviderCallExecuted,true);
});

test('provider binding mismatch blocks an otherwise verified adapter',()=>{
  const inventory=buildVisualRuntimeInventory({
    schema:'evercraft.fallen.visual-runtime-inventory-input.v1',id:'runtime',
    endpoints:[endpoint('veo','elevenlabs')],
    adapters:[adapter('wrong-provider','veo','runway')],
    sourceRefs:['raven:runtime']
  });
  assert.deepEqual(inventory.executableModelIds,[]);
  assert.ok(inventory.rows[0].reasons.includes('adapter_provider_binding_mismatch'));
});

test('missing and unverified adapters stay visible as blockers',()=>{
  const inventory=buildVisualRuntimeInventory({
    schema:'evercraft.fallen.visual-runtime-inventory-input.v1',id:'runtime',
    endpoints:[endpoint('a','p'),endpoint('b','p')],
    adapters:[adapter('a-adapter','a','p',false)],
    sourceRefs:['raven:runtime']
  });
  assert.deepEqual(inventory.blockedModelIds,['a','b']);
  assert.ok(inventory.rows.find(row=>row.modelId==='a')?.reasons.includes('adapter_not_verified'));
  assert.ok(inventory.rows.find(row=>row.modelId==='b')?.reasons.includes('adapter_missing'));
});

test('orphan adapters are surfaced instead of silently implying a registered model',()=>{
  const inventory=buildVisualRuntimeInventory({
    schema:'evercraft.fallen.visual-runtime-inventory-input.v1',id:'runtime',
    endpoints:[endpoint('a','p')],
    adapters:[
      adapter('a-adapter','a','p'),
      adapter('orphan-adapter','ghost','p')
    ],
    sourceRefs:['raven:runtime']
  });
  assert.deepEqual(inventory.executableModelIds,['a']);
  assert.deepEqual(inventory.orphanAdapterIds,['orphan-adapter']);
});

test('duplicate adapters for one model fail that model closed',()=>{
  const inventory=buildVisualRuntimeInventory({
    schema:'evercraft.fallen.visual-runtime-inventory-input.v1',id:'runtime',
    endpoints:[endpoint('a','p')],
    adapters:[
      adapter('a1','a','p'),
      adapter('a2','a','p')
    ],
    sourceRefs:['raven:runtime']
  });
  assert.deepEqual(inventory.executableModelIds,[]);
  assert.ok(inventory.rows[0].reasons.includes('duplicate_adapter_for_model'));
});
