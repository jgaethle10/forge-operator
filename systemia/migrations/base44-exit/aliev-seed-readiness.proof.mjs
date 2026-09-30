import assert from 'node:assert/strict';
import { evaluateAliEvSeedReadiness } from './aliev-seed-readiness.mjs';

const snapshot={
  schema:'evercraft.aliev.streaming-migration-phase-receipt.v1',
  phase:'snapshot',snapshot_cutoff:'2026-09-30T20:00:00.000Z',phase_cutoff:'2026-09-30T20:00:00.000Z',
  complete:true,
  totals:{source_rows:31600,accepted_rows:31598,excluded_rows:2,ingest_submitted:31598,unexhausted_entities:0},
  source_secret_persisted:false,target_secret_persisted:false,runtime_dependency_created:false
};
function delta(start,end,rows=0){
  return {
    schema:'evercraft.aliev.streaming-migration-phase-receipt.v1',
    phase:'delta',snapshot_cutoff:snapshot.snapshot_cutoff,
    updated_after:start,phase_cutoff:end,complete:true,
    totals:{source_rows:rows,accepted_rows:rows,excluded_rows:0,ingest_submitted:rows,unexhausted_entities:0},
    source_secret_persisted:false,target_secret_persisted:false,runtime_dependency_created:false
  };
}
const d1=delta('2026-09-30T20:00:00.000Z','2026-09-30T20:10:00.000Z',4);
const d2=delta('2026-09-30T20:10:00.000Z','2026-09-30T20:20:00.000Z',0);
const d3=delta('2026-09-30T20:20:00.000Z','2026-09-30T20:30:00.000Z',0);

const ready=evaluateAliEvSeedReadiness({
  snapshotReceipt:snapshot,deltaReceipts:[d1,d2,d3],
  now:'2026-09-30T20:35:00.000Z',minimumQuietWindows:2,maxLagMs:10*60*1000
});
assert.equal(ready.ready,true);
assert.equal(ready.source_seed_reconciled,true);
assert.equal(ready.observed_quiet_tail_windows,2);
assert.equal(ready.counts.snapshot_source_rows,31600);
assert.equal(ready.counts.delta_source_rows,4);

const activeTail=evaluateAliEvSeedReadiness({
  snapshotReceipt:snapshot,deltaReceipts:[d1,d2,delta('2026-09-30T20:20:00.000Z','2026-09-30T20:30:00.000Z',1)],
  now:'2026-09-30T20:35:00.000Z'
});
assert.equal(activeTail.ready,false);
assert.ok(activeTail.blockers.includes('quiet_delta_tail_not_reached'));

const gap=evaluateAliEvSeedReadiness({
  snapshotReceipt:snapshot,
  deltaReceipts:[
    delta('2026-09-30T20:00:00.000Z','2026-09-30T20:10:00.000Z',0),
    delta('2026-09-30T20:11:00.000Z','2026-09-30T20:20:00.000Z',0)
  ],
  now:'2026-09-30T20:25:00.000Z'
});
assert.equal(gap.ready,false);
assert.ok(gap.blockers.some(x=>x.includes('window_gap_or_overlap')));

const stale=evaluateAliEvSeedReadiness({
  snapshotReceipt:snapshot,
  deltaReceipts:[
    delta('2026-09-30T20:00:00.000Z','2026-09-30T20:10:00.000Z',0),
    delta('2026-09-30T20:10:00.000Z','2026-09-30T20:20:00.000Z',0)
  ],
  now:'2026-09-30T21:00:00.000Z',
  maxLagMs:10*60*1000
});
assert.equal(stale.ready,false);
assert.ok(stale.blockers.includes('delta_tail_too_stale'));

const incomplete=structuredClone(snapshot);
incomplete.complete=false;
const badSnapshot=evaluateAliEvSeedReadiness({
  snapshotReceipt:incomplete,deltaReceipts:[d2,d3],now:'2026-09-30T20:35:00.000Z'
});
assert.equal(badSnapshot.ready,false);
assert.ok(badSnapshot.blockers.includes('snapshot_not_complete_or_reconciled'));

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.aliev.seed-readiness-proof.v1',
  exact_snapshot_reconciliation_required:true,
  continuous_delta_windows_required:true,
  consecutive_quiet_windows_required:2,
  fresh_delta_tail_required:true,
  active_tail_blocks_cutover:true,
  stale_tail_blocks_cutover:true,
  source_seed_reconciled_only_after_all_gates:true
},null,2));
