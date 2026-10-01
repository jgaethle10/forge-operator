#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DurableEntityStore } from '../app-fabric/entity-store.mjs';
import { EvercraftAqueductRuntime, AQUEDUCT_SEED_EDGES } from './runtime.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-aqueduct-proof-'));
let clock=new Date('2026-10-01T16:00:00.000Z');

try{
  const store=new DurableEntityStore({stateDir:path.join(root,'entities')});
  const runtime=new EvercraftAqueductRuntime({
    entityStore:store,
    clock:()=>clock
  });

  assert.equal(runtime.health().source_platform_dependency,false);
  assert.equal(runtime.health().seed_edge_count,10);

  const seeded=runtime.seed();
  assert.equal(seeded.created,10);
  assert.equal(seeded.total,AQUEDUCT_SEED_EDGES.length);
  const reseeded=runtime.seed();
  assert.equal(reseeded.created,0);
  assert.equal(reseeded.existing,10);

  const edgeKey='aliev.observed-usage->rivet.session-evidence';
  let swept=runtime.sweep();
  let target=swept.edges.find((row)=>row.edge_key===edgeKey);
  assert.equal(target.state,'unverified');
  assert.ok(
    store.filter('systemia-command-center','PipelineIncident',{
      edge_key:edgeKey,
      incident_type:'uninstrumented',
      status:'open'
    }).length===1
  );

  clock=new Date('2026-10-01T16:01:00.000Z');
  const silentZero=runtime.emit({
    edge_key:edgeKey,
    stage:'produced',
    artifact_hash:'sha256:artifact-zero',
    contract_version:'aqueduct.aliev-rivet.sessions.v1',
    field_names:['nearby_observed_usage','source_ref','period_start','period_end'],
    record_count:0,
    zero_semantics:'unknown'
  });
  assert.equal(silentZero.edge.state,'broken');
  assert.match(silentZero.edge.blockage_reason,/Zero records/);
  assert.ok(
    store.filter('systemia-command-center','PipelineIncident',{
      edge_key:edgeKey,
      incident_type:'silent_zero',
      status:'open'
    }).length===1
  );

  clock=new Date('2026-10-01T16:02:00.000Z');
  const hash='sha256:artifact-good';
  const fields=['nearby_observed_usage','source_ref','period_start','period_end'];
  runtime.emit({
    edge_key:edgeKey,
    stage:'produced',
    artifact_hash:hash,
    contract_version:'aqueduct.aliev-rivet.sessions.v1',
    field_names:fields,
    record_count:4,
    zero_semantics:'not_applicable'
  });
  target=runtime.graph().edges.find((row)=>row.edge_key===edgeKey);
  assert.equal(target.state,'degraded');

  clock=new Date('2026-10-01T16:13:30.000Z');
  target=runtime.sweep().edges.find((row)=>row.edge_key===edgeKey);
  assert.equal(target.state,'broken');
  assert.match(target.blockage_reason,/delivery receipt/);

  clock=new Date('2026-10-01T16:14:00.000Z');
  runtime.emit({
    edge_key:edgeKey,
    stage:'delivered',
    artifact_hash:hash,
    contract_version:'aqueduct.aliev-rivet.sessions.v1',
    record_count:4,
    zero_semantics:'not_applicable'
  });
  target=runtime.graph().edges.find((row)=>row.edge_key===edgeKey);
  assert.equal(target.state,'degraded');

  clock=new Date('2026-10-01T16:25:30.000Z');
  target=runtime.sweep().edges.find((row)=>row.edge_key===edgeKey);
  assert.equal(target.state,'broken');
  assert.match(target.blockage_reason,/consumption receipt/);

  clock=new Date('2026-10-01T16:26:00.000Z');
  runtime.emit({
    edge_key:edgeKey,
    stage:'consumed',
    artifact_hash:hash,
    contract_version:'aqueduct.aliev-rivet.sessions.v1',
    record_count:4,
    zero_semantics:'not_applicable'
  });
  clock=new Date('2026-10-01T16:26:30.000Z');
  const verified=runtime.emit({
    edge_key:edgeKey,
    stage:'verified',
    artifact_hash:hash,
    contract_version:'aqueduct.aliev-rivet.sessions.v1',
    record_count:4,
    zero_semantics:'not_applicable'
  });
  assert.equal(verified.edge.state,'healthy');
  assert.equal(verified.edge.last_artifact_hash,hash);

  const graph=runtime.graph();
  target=graph.edges.find((row)=>row.edge_key===edgeKey);
  assert.equal(target.state,'healthy');
  assert.equal(
    graph.incidents.filter((row)=>row.edge_key===edgeKey).length,
    0
  );
  const resolved=store.filter('systemia-command-center','PipelineIncident',{
    edge_key:edgeKey,
    status:'resolved'
  },{limit:100});
  assert.ok(resolved.some((row)=>row.incident_type==='uninstrumented'));
  assert.ok(resolved.some((row)=>row.incident_type==='silent_zero'));
  assert.ok(resolved.some((row)=>row.incident_type==='drain'));
  assert.ok(resolved.some((row)=>row.incident_type==='consumer_gap'));

  const schemaEdge='rivet.report->rivet.pdf';
  clock=new Date('2026-10-01T16:27:00.000Z');
  const drift=runtime.emit({
    edge_key:schemaEdge,
    stage:'produced',
    artifact_hash:'sha256:drift',
    contract_version:'wrong.contract.v1',
    field_names:['decision','traffic','charging'],
    record_count:1,
    zero_semantics:'not_applicable'
  });
  assert.equal(drift.edge.state,'broken');
  assert.match(drift.edge.blockage_reason,/contract version/);

  console.log(JSON.stringify({
    schema:'evercraft.aqueduct.runtime-proof.v1',
    status:'pass',
    seed_idempotent:true,
    uninstrumented_detected:true,
    silent_zero_rejected:true,
    delivery_drain_detected:true,
    consumer_gap_detected:true,
    exact_artifact_verification_restores_health:true,
    resolved_incidents_do_not_remain_open:true,
    contract_drift_detected:true,
    source_platform_dependency:false
  }));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
