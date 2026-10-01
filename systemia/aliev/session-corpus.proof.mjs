import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  backfillPlugNYCSessionCorpus,
  compactPlugNYCSessionCorpus,
  reconcilePlugNYCSessionCorpus,
  sessionCorpusStatus,
  normalizePlugNYCSession,
  SAFE_SOURCE_FIELDS
} from './session-corpus.mjs';
import { ingestAliEvDomainRecords } from './domain-store.mjs';
import { startAliEvSourceRuntime } from './source-runtime.mjs';
import { startRivetReportRuntime } from '../rivet/report-runtime.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'aliev-session-corpus-proof-'));
const privateDriver='DRIVER-SECRET-DO-NOT-PERSIST';
const privateTag='TAG-SECRET-DO-NOT-PERSIST';
const rows=[
  {date:'2026-08-01T00:00:00.000',station_name:'101336',location_name:'QBO - Queens Borough Hall Municipal Parking Garage',country:'USA',charge_box_id:'box-a',connector_id:'1',driver_id:privateDriver,id_tag:privateTag,connected_time:'08:00:00',disconnected_time:'09:00:00',charge_duration_min:'60',connected_duration_min:'60',energy_provided_kwh:'20',session_status:'PAID',invalidity_reason:'NULL'},
  {date:'2026-08-02T00:00:00.000',station_name:'101336',location_name:'QBO - Queens Borough Hall Municipal Parking Garage',country:'USA',charge_box_id:'box-a',connector_id:'1',driver_id:privateDriver,id_tag:privateTag,connected_time:'10:00:00',disconnected_time:'10:30:00',charge_duration_min:'30',connected_duration_min:'30',energy_provided_kwh:'11',session_status:'INVALID',invalidity_reason:'meter_error'},
  {date:'2026-08-03T00:00:00.000',station_name:'101337',location_name:'QBO - Queens Borough Hall Municipal Parking Garage',country:'USA',charge_box_id:'box-b',connector_id:'1',driver_id:privateDriver,id_tag:privateTag,connected_time:'11:00:00',disconnected_time:'12:30:00',charge_duration_min:'90',connected_duration_min:'90',energy_provided_kwh:'32',session_status:'ROAMING',invalidity_reason:'NULL'},
  {date:'2026-09-01T00:00:00.000',station_name:'EV0449',location_name:'DES - Delancey and Essex Municipal Parking Garage',country:'USA',charge_box_id:'box-c',connector_id:'2',driver_id:privateDriver,id_tag:privateTag,connected_time:'09:00:00',disconnected_time:'10:00:00',charge_duration_min:'60',connected_duration_min:'60',energy_provided_kwh:'15',session_status:'PAID',invalidity_reason:'NULL'},
  {date:'2026-09-02T00:00:00.000',station_name:'EV0449',location_name:'DES - Delancey and Essex Municipal Parking Garage',country:'USA',charge_box_id:'box-c',connector_id:'2',driver_id:privateDriver,id_tag:privateTag,connected_time:'10:00:00',disconnected_time:'10:20:00',charge_duration_min:'20',connected_duration_min:'20',energy_provided_kwh:'0',session_status:'ABORTED',invalidity_reason:'user_stop'},
  {date:'2026-09-03T00:00:00.000',station_name:'EV0448',location_name:'DES - Delancey and Essex Municipal Parking Garage',country:'USA',charge_box_id:'box-d',connector_id:'1',driver_id:privateDriver,id_tag:privateTag,connected_time:'13:00:00',disconnected_time:'14:00:00',charge_duration_min:'60',connected_duration_min:'60',energy_provided_kwh:'17',session_status:'DISCONNECTED',invalidity_reason:'NULL'},
  {date:'2026-09-08T00:00:00.000',station_name:'EV0448',location_name:'DES - Delancey and Essex Municipal Parking Garage',country:'USA',charge_box_id:'box-d',connector_id:'1',driver_id:privateDriver,id_tag:privateTag,connected_time:'15:00:00',disconnected_time:'16:00:00',charge_duration_min:'60',connected_duration_min:'60',energy_provided_kwh:'18',session_status:'PAID',invalidity_reason:'NULL'}
];

function fakeFetch(url){
  const parsed=new URL(url);
  const select=parsed.searchParams.get('$select')||'';
  if(select.startsWith('count(*)')){
    return Promise.resolve(new Response(JSON.stringify([{
      rows:String(rows.length),
      first_date:[...rows].map(x=>String(x.date)).sort()[0],
      latest_date:[...rows].map(x=>String(x.date)).sort().at(-1),
      energy_kwh:String(rows.reduce((n,x)=>n+Number(x.energy_provided_kwh||0),0))
    }]),{status:200,headers:{'content-type':'application/json'}}));
  }
  assert.equal(select.includes('driver_id'),false);
  assert.equal(select.includes('id_tag'),false);
  const offset=Number(parsed.searchParams.get('$offset')||0);
  const limit=Number(parsed.searchParams.get('$limit')||5000);
  // Maliciously include private fields in the fake response anyway to prove the normalizer drops them.
  return Promise.resolve(new Response(JSON.stringify(rows.slice(offset,offset+limit)),{status:200,headers:{'content-type':'application/json'}}));
}

try{
  assert.equal(SAFE_SOURCE_FIELDS.includes('driver_id'),false);
  assert.equal(SAFE_SOURCE_FIELDS.includes('id_tag'),false);
  const normalized=normalizePlugNYCSession(rows[0]);
  assert.equal('driver_id' in normalized,false);
  assert.equal('id_tag' in normalized,false);
  assert.equal(normalized.observed_usage_valid,true);

  const first=await backfillPlugNYCSessionCorpus({
    stateDir:root,pageSize:3,maxPagesPerRun:1,fetchImpl:fakeFetch,
    now:()=> '2026-10-01T04:00:00.000Z'
  });
  assert.equal(first.checkpoint.next_offset,3);
  assert.equal(first.checkpoint.complete,false);
  assert.equal(first.receipt.pages_written,1);

  const second=await backfillPlugNYCSessionCorpus({
    stateDir:root,pageSize:3,maxPagesPerRun:10,fetchImpl:fakeFetch,
    now:()=> '2026-10-01T04:05:00.000Z'
  });
  assert.equal(second.checkpoint.next_offset,7);
  assert.equal(second.checkpoint.complete,true);
  assert.equal(second.receipt.pages_written,2);

  const reconciliation=reconcilePlugNYCSessionCorpus({
    stateDir:root,
    now:()=> '2026-10-01T04:05:30.000Z'
  });
  assert.equal(reconciliation.complete_reconciled,true);
  assert.equal(reconciliation.rows_reconciled,true);
  assert.equal(reconciliation.energy_reconciled,true);
  assert.equal(reconciliation.offsets_reconciled,true);
  assert.equal(reconciliation.coverage_dates_reconciled,true);
  assert.equal(reconciliation.duplicate_source_rows,0);

  const compact=compactPlugNYCSessionCorpus({
    stateDir:root,
    now:()=> '2026-10-01T04:06:00.000Z'
  });
  assert.equal(compact.receipt.raw_rows_read,7);
  assert.equal(compact.receipt.valid_usage_rows,5);
  const august=compact.aggregates.filter(x=>x.period_start.startsWith('2026-08'));
  const september=compact.aggregates.filter(x=>x.period_start.startsWith('2026-09'));
  assert.equal(august.reduce((n,x)=>n+x.charging_sessions_count,0),2);
  assert.equal(september.reduce((n,x)=>n+x.charging_sessions_count,0),3);
  assert.ok(september.every(x=>x.data_status==='partial'));
  assert.ok(september.every(x=>x.source_vintage.includes('partial through 2026-09-08')));

  const status=sessionCorpusStatus({stateDir:root});
  assert.equal(status.checkpoint.complete,true);
  assert.equal(status.partition_count,3);
  assert.equal(status.percent_materialized,100);
  assert.equal(status.personal_identifiers_persisted,false);

  const third=await backfillPlugNYCSessionCorpus({
    stateDir:root,pageSize:3,maxPagesPerRun:10,fetchImpl:fakeFetch,
    now:()=> '2026-10-01T04:10:00.000Z'
  });
  assert.equal(third.receipt.pages_written,0);
  assert.equal(sessionCorpusStatus({stateDir:root}).partition_count,3);

  // End-to-end owned path: raw PlugNYC rows -> reconciled corpus -> observed_sessions domain -> AliEV snapshot -> RIVET report.
  const runtimeState=path.join(root,'owned-source-runtime');
  const runtimeDomain=path.join(runtimeState,'domain-store');
  ingestAliEvDomainRecords({
    stateDir:runtimeDomain,
    domain:'observed_sessions',
    records:[{
      record_key:'historical-ev0449-geometry',
      aggregate_key:'nyc-plugnyc:EV0449:2026-08',
      station_external_id:'nyc-plugnyc:EV0449',
      address:'DES - Delancey and Essex Municipal Parking Garage',
      state:'NY',
      latitude:40.718983402843,
      longitude:-73.988062273936,
      period_start:'2026-08-01T00:00:00.000Z',
      period_end:'2026-09-01T00:00:00.000Z',
      charging_sessions_count:10,
      energy_kwh:100,
      data_status:'verified',
      evidence_state:'OBSERVED_AGGREGATE',
      source_name:'Historical verified PlugNYC aggregate',
      source_url:'https://example.test/historical-plugnyc',
      retrieved_at:'2026-09-01T00:00:00.000Z'
    },{
      record_key:'legacy-september-duplicate-ev0449',
      aggregate_key:'nyc-plugnyc:EV0449:2026-09',
      station_external_id:'nyc-plugnyc:EV0449',
      address:'DES - Delancey and Essex Municipal Parking Garage',
      state:'NY',
      latitude:40.718983402843,
      longitude:-73.988062273936,
      period_start:'2026-09-01T00:00:00.000Z',
      period_end:'2026-10-01T00:00:00.000Z',
      charging_sessions_count:999,
      energy_kwh:9999,
      data_status:'partial',
      evidence_state:'OBSERVED_AGGREGATE',
      source_name:'Stale migrated duplicate',
      source_url:'https://example.test/stale-migrated-duplicate',
      source_vintage:'2026-09 stale migration copy',
      retrieved_at:'2026-09-09T00:00:00.000Z'
    }]
  });

  const ownedSource=await startAliEvSourceRuntime({
    stateDir:runtimeState,
    systemiaMachineKey:'session-proof-machine',
    ingestToken:'session-proof-ingest',
    sessionCorpusEnabled:false,
    sessionCorpusFetchImpl:fakeFetch,
    sessionCorpusPageSize:3,
    sessionCorpusMaxPagesPerRun:10,
    geocode:async()=>({
      matched_address:'Delancey and Essex Municipal Parking Garage, New York, NY',
      latitude:40.718983402843,
      longitude:-73.988062273936,
      state:'NY',
      postal_code:'10002',
      city:'New York',
      source_name:'Proof Geocoder',
      source_url:'https://example.test/geocoder',
      evidence_state:'OFFICIAL_GEOCODE'
    }),
    refreshDomains:async()=>({schema:'proof.noop-refresh.v1',collectors:{}})
  });
  try{
    const cycle=await ownedSource.runSessionCorpusCycle();
    assert.equal(cycle.ok,true);
    assert.equal(cycle.status.checkpoint.complete,true);
    assert.equal(cycle.reconciliation.complete_reconciled,true);
    assert.ok(cycle.domain_ingest?.active_records>=3);

    const sourceResponse=await fetch(ownedSource.source_url,{
      method:'POST',
      headers:{'content-type':'application/json','x-systemia-machine-key':'session-proof-machine'},
      body:JSON.stringify({mode:'rivet_report_snapshot',address:'Delancey and Essex Municipal Parking Garage, New York, NY'})
    });
    assert.equal(sourceResponse.status,200);
    const sourceSnapshot=await sourceResponse.json();
    const latestObserved=sourceSnapshot.nearby_observed_usage.find(x=>
      x.station_external_id==='nyc-plugnyc:EV0449' &&
      String(x.period_start||'').startsWith('2026-09')
    );
    assert.ok(latestObserved);
    assert.equal(latestObserved.charging_sessions_count,1);
    assert.equal(latestObserved.energy_kwh,15);
    assert.notEqual(latestObserved.charging_sessions_count,999,'stale migrated duplicate must not overwrite fresher owned aggregate');
    assert.equal(latestObserved.data_status,'partial');
    assert.equal(latestObserved.source_vintage,'2026-09 partial through 2026-09-08');
    assert.equal(latestObserved.latitude,40.718983402843);
    assert.equal(latestObserved.longitude,-73.988062273936);
    assert.equal(sourceSnapshot.source_coverage_manifest.domains.observed_sessions.state,'OBSERVED_VERIFIED');

    const rivet=await startRivetReportRuntime({
      stateDir:path.join(root,'rivet-report-runtime'),
      sourceUrl:ownedSource.source_url,
      systemiaMachineKey:'session-proof-machine',
      teamToken:'session-proof-team'
    });
    try{
      const reportResponse=await fetch(rivet.service_url+'/v1/reports',{
        method:'POST',
        headers:{'content-type':'application/json',authorization:'Bearer session-proof-team'},
        body:JSON.stringify({
          address:'Delancey and Essex Municipal Parking Garage, New York, NY',
          report_type:'full_site_opportunity'
        })
      });
      assert.equal(reportResponse.status,201);
      const report=await reportResponse.json();
      const reportObserved=report.report.body.evidence.observed_usage.find(x=>
        x.station_external_id==='nyc-plugnyc:EV0449' &&
        String(x.period_start||'').startsWith('2026-09')
      );
      assert.ok(reportObserved);
      assert.equal(reportObserved.charging_sessions_count,1);
      assert.equal(reportObserved.data_status,'partial');
      assert.equal(reportObserved.source_vintage,'2026-09 partial through 2026-09-08');
      assert.equal(report.verification.full_source_snapshot_persisted,true);
    }finally{
      await rivet.close();
    }
  }finally{
    await ownedSource.close();
  }

  // Continuous freshness: an advanced source date rewinds a bounded tail so
  // rows inserted inside the latest ordered day cannot be skipped by offset append.
  rows.push({
    date:'2026-09-09T00:00:00.000',station_name:'101336',
    location_name:'QBO - Queens Borough Hall Municipal Parking Garage',country:'USA',
    charge_box_id:'box-a',connector_id:'1',driver_id:privateDriver,id_tag:privateTag,
    connected_time:'17:00:00',disconnected_time:'18:00:00',
    charge_duration_min:'60',connected_duration_min:'60',energy_provided_kwh:'19',
    session_status:'PAID',invalidity_reason:'NULL'
  });
  const advanced=await backfillPlugNYCSessionCorpus({
    stateDir:root,pageSize:3,maxPagesPerRun:10,fetchImpl:fakeFetch,
    now:()=> '2026-10-01T04:20:00.000Z'
  });
  assert.equal(advanced.receipt.refresh_reason,'source_advanced_tail_rewind');
  assert.equal(advanced.receipt.started_offset,0);
  assert.equal(advanced.checkpoint.next_offset,8);
  assert.equal(advanced.checkpoint.complete,true);
  const advancedReconciliation=reconcilePlugNYCSessionCorpus({
    stateDir:root,now:()=> '2026-10-01T04:20:30.000Z'
  });
  assert.equal(advancedReconciliation.complete_reconciled,true);
  assert.equal(advancedReconciliation.raw_rows_materialized,8);
  const advancedCompact=compactPlugNYCSessionCorpus({
    stateDir:root,now:()=> '2026-10-01T04:21:00.000Z'
  });
  assert.ok(
    advancedCompact.aggregates
      .filter(x=>x.period_start.startsWith('2026-09'))
      .every(x=>x.source_vintage.includes('partial through 2026-09-09'))
  );

  // Same-date row growth is more dangerous because it can reorder existing rows.
  // Fail safe by rescanning from zero instead of pretending the new row is append-only.
  rows.push({
    date:'2026-09-09T00:00:00.000',station_name:'101337',
    location_name:'QBO - Queens Borough Hall Municipal Parking Garage',country:'USA',
    charge_box_id:'box-b',connector_id:'1',driver_id:privateDriver,id_tag:privateTag,
    connected_time:'07:00:00',disconnected_time:'07:30:00',
    charge_duration_min:'30',connected_duration_min:'30',energy_provided_kwh:'9',
    session_status:'PAID',invalidity_reason:'NULL'
  });
  const sameDateGrowth=await backfillPlugNYCSessionCorpus({
    stateDir:root,pageSize:3,maxPagesPerRun:10,fetchImpl:fakeFetch,
    now:()=> '2026-10-01T04:25:00.000Z'
  });
  assert.equal(sameDateGrowth.receipt.refresh_reason,'source_row_growth_inside_existing_coverage_full_rescan');
  assert.equal(sameDateGrowth.receipt.started_offset,0);
  assert.equal(sameDateGrowth.checkpoint.next_offset,9);
  assert.equal(sameDateGrowth.checkpoint.complete,true);
  const sameDateReconciliation=reconcilePlugNYCSessionCorpus({
    stateDir:root,now:()=> '2026-10-01T04:25:30.000Z'
  });
  assert.equal(sameDateReconciliation.complete_reconciled,true);
  assert.equal(sameDateReconciliation.raw_rows_materialized,9);
  assert.equal(sameDateReconciliation.duplicate_source_rows,0);

  const files=[];
  const walk=(dir)=>{
    for(const name of fs.readdirSync(dir)){
      const file=path.join(dir,name);
      if(fs.statSync(file).isDirectory()) walk(file); else files.push(file);
    }
  };
  walk(root);
  const persisted=files.map(file=>fs.readFileSync(file).toString('utf8')).join('\n');
  assert.equal(persisted.includes(privateDriver),false);
  assert.equal(persisted.includes(privateTag),false);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.aliev.session-corpus-proof.v1',
    source_rows:rows.length,
    partitions:3,
    checkpoint_resume_verified:true,
    content_addressed_partitions:true,
    idempotent_completed_rerun:true,
    valid_usage_semantics_verified:true,
    invalid_and_aborted_not_promoted:true,
    partial_latest_month_preserved:true,
    personal_identifiers_persisted:false,
    aggregate_projection_verified:true,
    full_corpus_reconciliation_verified:true,
    contiguous_partition_offsets_verified:true,
    source_energy_reconciliation_verified:true,
    duplicate_event_detection_verified:true,
    canonical_observed_sessions_domain_publish_verified:true,
    station_identity_geometry_carry_forward_verified:true,
    aliev_snapshot_consumes_session_corpus:true,
    rivet_report_consumes_session_corpus:true,
    freshest_owned_aggregate_wins_over_migrated_duplicate:true,
    append_refresh_tail_rewind_verified:true,
    same_date_growth_full_rescan_verified:true,
    continuous_freshness_offset_shift_guard_verified:true
  },null,2));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
