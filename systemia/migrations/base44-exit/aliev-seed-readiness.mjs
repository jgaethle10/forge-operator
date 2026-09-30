const clean=(v)=>String(v??'').trim();
const time=(v)=>{const n=Date.parse(clean(v));return Number.isFinite(n)?n:null;};

function validPhase(receipt,phase){
  if(receipt?.schema!=='evercraft.aliev.streaming-migration-phase-receipt.v1') return false;
  if(receipt?.phase!==phase||receipt?.complete!==true) return false;
  const t=receipt?.totals||{};
  return Number(t.unexhausted_entities||0)===0 &&
    Number(t.source_rows||0)===Number(t.accepted_rows||0)+Number(t.excluded_rows||0) &&
    Number(t.accepted_rows||0)===Number(t.ingest_submitted||0) &&
    receipt.source_secret_persisted===false &&
    receipt.target_secret_persisted===false &&
    receipt.runtime_dependency_created===false;
}

export function evaluateAliEvSeedReadiness({
  snapshotReceipt,
  deltaReceipts=[],
  now=new Date().toISOString(),
  minimumQuietWindows=2,
  maxLagMs=10*60*1000,
}={}){
  const blockers=[];
  if(!validPhase(snapshotReceipt,'snapshot')) blockers.push('snapshot_not_complete_or_reconciled');
  const snapshotCutoff=clean(snapshotReceipt?.snapshot_cutoff);
  const snapshotTime=time(snapshotCutoff);
  if(snapshotTime===null) blockers.push('snapshot_cutoff_invalid');

  const deltas=[...(deltaReceipts||[])].sort((a,b)=>
    (time(a?.updated_after)||0)-(time(b?.updated_after)||0)
  );
  if(deltas.length<minimumQuietWindows) blockers.push('insufficient_delta_windows');

  let expectedStart=snapshotCutoff;
  let continuous=true;
  for(const [index,delta] of deltas.entries()){
    if(!validPhase(delta,'delta')){
      blockers.push('delta_'+index+'_not_complete_or_reconciled');
      continuous=false;
      continue;
    }
    if(clean(delta.updated_after)!==expectedStart){
      blockers.push('delta_'+index+'_window_gap_or_overlap');
      continuous=false;
    }
    const end=clean(delta.phase_cutoff);
    const startTime=time(delta.updated_after),endTime=time(end);
    if(startTime===null||endTime===null||endTime<=startTime){
      blockers.push('delta_'+index+'_window_invalid');
      continuous=false;
    }
    expectedStart=end;
  }

  const quietTail=deltas.slice(-Math.max(1,Number(minimumQuietWindows)||2));
  const quietWindows=quietTail.filter(delta=>
    validPhase(delta,'delta') &&
    Number(delta?.totals?.source_rows||0)===0
  ).length;
  if(quietWindows<minimumQuietWindows) blockers.push('quiet_delta_tail_not_reached');

  const nowMs=time(now);
  const lastCutoff=time(deltas.at(-1)?.phase_cutoff);
  const lagMs=nowMs!==null&&lastCutoff!==null?nowMs-lastCutoff:null;
  if(lagMs===null||lagMs<0||lagMs>maxLagMs) blockers.push('delta_tail_too_stale');

  const snapshotRows=Number(snapshotReceipt?.totals?.source_rows||0);
  const deltaRows=deltas.reduce((n,x)=>n+Number(x?.totals?.source_rows||0),0);
  const ready=blockers.length===0&&continuous;

  return {
    schema:'evercraft.aliev.seed-readiness.v1',
    ready,
    source_seed_reconciled:ready,
    snapshot_cutoff:snapshotCutoff||null,
    delta_tail_cutoff:clean(deltas.at(-1)?.phase_cutoff)||null,
    delta_lag_ms:lagMs,
    minimum_quiet_windows:minimumQuietWindows,
    observed_quiet_tail_windows:quietWindows,
    counts:{
      snapshot_source_rows:snapshotRows,
      delta_source_rows:deltaRows,
      delta_windows:deltas.length,
      complete_delta_windows:deltas.filter(x=>validPhase(x,'delta')).length,
    },
    blockers,
    semantics:'Owned AliEV is seed-ready only after exact snapshot reconciliation and a continuous, fresh, quiet delta tail. A completed bulk copy alone is never sufficient for cutover.',
    evaluated_at:now,
  };
}
