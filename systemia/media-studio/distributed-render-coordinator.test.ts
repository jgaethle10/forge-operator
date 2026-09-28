import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDistributedRenderPlan, renderJobForShard } from './distributed-render.js';
import type { VisualStage } from './visual-stage.js';

test('shared asset scope survives distinct shard job ids',()=>{
  const stage:VisualStage={
    schema:'evercraft.fallen.visual-stage.v1',
    id:'asset-scope-proof',
    width:640,height:360,fps:10,durationSec:.5,
    background:'#000',
    camera:{keyframes:[{t:0,x:0,y:0,zoom:1}]},
    layers:[{
      id:'media',kind:'media',z:1,x:0,y:0,width:640,height:360,
      sourcePath:'asset://hero',mediaKind:'image',fit:'cover',
      evidenceState:'licensed',sourceRefs:['license:hero']
    }],
    createdAt:'2026-09-27T00:00:00.000Z'
  };
  const plan=buildDistributedRenderPlan({
    id:'render-proof',
    stage,
    assetScopeId:'shared-assets',
    assets:[{id:'hero',filename:'hero.png',sha256:'a'.repeat(64),media_type:'image/png'}],
    maxFramesPerShard:2
  });
  assert.ok(plan.shards.length>1);
  const jobs=plan.shards.map(shard=>renderJobForShard(plan,shard));
  assert.equal(new Set(jobs.map(job=>job.asset_scope_id)).size,1);
  assert.equal(new Set(jobs.map(job=>job.job_id)).size,plan.shards.length);
});
