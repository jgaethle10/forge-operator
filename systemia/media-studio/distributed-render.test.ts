import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDistributedRenderPlan,
  buildRenderShardInventory,
  verifyRenderReceipts,
  type RenderWorkerReceipt,
  type ShardReceiptEnvelope,
} from './distributed-render.js';
import type { VisualStage } from './visual-stage.js';

const stage:VisualStage={
  schema:'evercraft.fallen.visual-stage.v1',
  id:'distributed-proof',
  width:640,height:360,fps:10,durationSec:1,
  background:'#080b0b',
  camera:{keyframes:[{t:0,x:0,y:0,zoom:1}]},
  layers:[{id:'title',kind:'text',z:1,x:20,y:20,width:600,height:80,text:'proof',fontSize:40}],
  createdAt:'2026-09-27T00:00:00.000Z'
};

function receipt(plan:ReturnType<typeof buildDistributedRenderPlan>,index:number):ShardReceiptEnvelope{
  const shard=plan.shards[index];
  const frames=Array.from({length:shard.frameCount},(_,offset)=>{
    const frame=shard.frameStart+offset;
    return {
      frame,
      filename:`frame-${String(frame).padStart(8,'0')}.png`,
      bytes:100,
      sha256:(frame.toString(16).padStart(2,'0')+'a'.repeat(62)).slice(0,64),
      time_sec:frame/plan.fps
    };
  });
  const row:RenderWorkerReceipt={
    schema:'evercraft.fallen.render-receipt.v1',
    job_id:shard.jobId,
    asset_scope_id:plan.assetScopeId,
    stage_id:plan.stage.id,
    stage_sha256:plan.stageDigest,
    frame_start:shard.frameStart,
    frame_count:shard.frameCount,
    total_frames:plan.totalFrames,
    frames,
    receipt_sha256:'b'.repeat(64)
  };
  return {workerId:`worker-${index}`,shardId:shard.id,receipt:row};
}

test('render planner creates bounded complete shards and Saban-ready jobs',()=>{
  const plan=buildDistributedRenderPlan({id:'render-proof',stage,maxFramesPerShard:4,createdAt:'2026-09-27T00:00:00.000Z'});
  assert.equal(plan.totalFrames,10);
  assert.deepEqual(plan.shards.map(row=>row.frameCount),[4,4,2]);
  const inventory=buildRenderShardInventory(plan);
  assert.equal(inventory.jobs.length,3);
  assert.equal(inventory.jobs[0].render_job.frame_start,0);
  assert.equal(inventory.jobs[2].render_job.frame_start,8);
});

test('receipt reconciliation proves exact no-gap no-duplicate frame coverage',()=>{
  const plan=buildDistributedRenderPlan({id:'render-proof',stage,maxFramesPerShard:4});
  const rows=plan.shards.map((_,index)=>receipt(plan,index));
  const result=verifyRenderReceipts(plan,rows);
  assert.equal(result.status,'accepted');
  assert.equal(result.observedFrames,10);
  assert.equal(result.frameSetDigest.length,64);
});

test('missing or duplicate shard output fails closed',()=>{
  const plan=buildDistributedRenderPlan({id:'render-proof',stage,maxFramesPerShard:4});
  const rows=plan.shards.slice(0,2).map((_,index)=>receipt(plan,index));
  const missing=verifyRenderReceipts(plan,rows);
  assert.equal(missing.status,'rejected');
  assert.match(missing.errors.join(' '),/shard_receipt_missing/);
  assert.match(missing.errors.join(' '),/frame_missing/);

  const duplicate=verifyRenderReceipts(plan,[receipt(plan,0),receipt(plan,0),receipt(plan,1),receipt(plan,2)]);
  assert.equal(duplicate.status,'rejected');
  assert.match(duplicate.errors.join(' '),/duplicate_shard_receipt/);
});
