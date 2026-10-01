import test from 'node:test';
import assert from 'node:assert/strict';
import { rivetAliEvProductionAnatomy, formationWaves } from '../systemia/saban/workload-anatomy.mjs';

test('RIVET/AliEV anatomy separates micro shards from stateful core',()=>{
  const anatomy=rivetAliEvProductionAnatomy();
  assert.equal(anatomy.schema,'evercraft.saban.workload-anatomy.v1');
  assert.equal(anatomy.invariants.durable_state_never_requires_micro_nodes,true);
  assert.equal(anatomy.invariants.private_data_requires_authorized_compute,true);

  const byId=new Map(anatomy.tasks.map(t=>[t.task_id,t]));
  assert.equal(byId.get('source-domain-normalize').execution_shape,'shardable');
  assert.equal(byId.get('source-domain-normalize').shard_count,14);
  assert.equal(byId.get('source-domain-normalize').continuity.preemptible,true);

  assert.equal(byId.get('aliev-source-runtime').execution_shape,'atomic');
  assert.equal(byId.get('aliev-source-runtime').trust.private_data,true);
  assert.equal(byId.get('aliev-source-runtime').continuity.require_always_on,true);
  assert.ok(byId.get('aliev-source-runtime').forbidden_device_classes.includes('refrigerator'));

  assert.equal(byId.get('rivet-report-runtime').trust.private_data,true);
  assert.equal(byId.get('rivet-report-runtime').resources_per_execution.memory_mb,8192);
  assert.ok(byId.get('rivet-report-runtime').forbidden_device_classes.includes('router'));
});

test('formation waves preserve source-before-report dependencies',()=>{
  const anatomy=rivetAliEvProductionAnatomy();
  const waves=formationWaves(anatomy);
  const waveOf=new Map();
  for(const wave of waves.waves){
    for(const id of wave.task_ids) waveOf.set(id,wave.wave);
  }
  assert.ok(waveOf.get('source-domain-normalize')<waveOf.get('aliev-source-runtime'));
  assert.ok(waveOf.get('source-domain-content-hash')<waveOf.get('aliev-source-runtime'));
  assert.ok(waveOf.get('aliev-source-runtime')<waveOf.get('rivet-report-runtime'));
  assert.ok(waveOf.get('rivet-report-runtime')<waveOf.get('rivet-report-projection'));
  assert.ok(waveOf.get('aliev-source-runtime')<waveOf.get('aliev-content-addressed-backup'));
});

test('anatomy can scale safe shards without scaling stateful core',()=>{
  const anatomy=rivetAliEvProductionAnatomy({domainParallelism:28,reportParallelism:8});
  const byId=new Map(anatomy.tasks.map(t=>[t.task_id,t]));
  assert.equal(byId.get('source-domain-normalize').shard_count,28);
  assert.equal(byId.get('source-domain-content-hash').shard_count,28);
  assert.equal(byId.get('rivet-report-projection').shard_count,8);
  assert.equal(byId.get('aliev-source-runtime').shard_count,1);
  assert.equal(byId.get('rivet-report-runtime').shard_count,1);
});
