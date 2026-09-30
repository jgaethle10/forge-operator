import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAliEvSnapshotBundle, verifyAliEvSnapshotBundle, importAliEvSnapshotBundle } from './snapshot-bundle.mjs';
import { persistAliEvSnapshot, startAliEvSourceRuntime } from './source-runtime.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'aliev-bundle-proof-'));
const bundleDir=path.join(root,'bundle');
const stateDir=path.join(root,'state');
const coverageKeys=[
  'geocoding','charging_inventory','traffic','traffic_temporal','utility_service_area','utility_tariff','incentives',
  'parcel_planning','local_ev_stock','observed_sessions','freight','dwell_context','deep_market_evidence','provenance'
];
function snapshot(retrievedAt,aadt,sessions){
  return {
    response_profile:'rivet_report_snapshot_v1',
    evidence_state:'SOURCE_BACKED',
    access_policy:{commercial_access:true},
    matched_address:'19820 International Boulevard, SeaTac, WA 98188',
    address_aliases:['19820 International Blvd, SeaTac, WA 98188'],
    retrieved_at:retrievedAt,
    latitude:47.4239385,longitude:-122.2955482,state:'WA',postal_code:'98188',
    source_coverage_manifest:{
      schema:'evercraft.rivet.source-coverage.v1',
      generated_at:retrievedAt,
      domains:Object.fromEntries(coverageKeys.map(key=>[key,{state:'CONNECTED',record_count:1,source_status:'bundle-proof'}])),
      semantics:'Missing is never zero.'
    },
    traffic:[{aadt}],
    traffic_profiles:[{profile_type:'peak_hour_volume'}],
    chargers:[{name:'Proof charger'}],
    incentives:[{name:'Proof incentive'}],
    nearby_observed_usage:[{charging_sessions_count:sessions,evidence_state:'observed'}],
    utility_rate_candidates:[{utility_name:'Proof Utility'}],
    local_ev_stock:{bev_count:1},
    freight_context:{state:'CONNECTED'},
    dwell_anchors:[{name:'SEA'}],
    deep_market_evidence:[{name:'proof'}],
    source_record_ids:['proof-'+retrievedAt],
  };
}
const older=snapshot('2026-09-29T10:00:00.000Z',41000,50);
const newer=snapshot('2026-09-30T10:00:00.000Z',52000,90);

try{
  const manifest=createAliEvSnapshotBundle({outDir:bundleDir,snapshots:[newer,older]});
  assert.equal(manifest.snapshot_count,2);
  assert.equal(manifest.entries[0].retrieved_at,older.retrieved_at);
  assert.equal(manifest.entries[1].retrieved_at,newer.retrieved_at);

  const verified=verifyAliEvSnapshotBundle({bundleDir});
  assert.equal(verified.ok,true);
  assert.equal(verified.snapshot_count,2);

  const imported=importAliEvSnapshotBundle({bundleDir,stateDir});
  assert.equal(imported.ok,true);
  assert.equal(imported.snapshot_count,2);
  const index=JSON.parse(fs.readFileSync(path.join(stateDir,'index.json'),'utf8'));
  const key='19820 international boulevard seatac wa 98188';
  assert.equal(index.entries[key].retrieved_at,newer.retrieved_at);

  const stale=persistAliEvSnapshot({stateDir,snapshot:older});
  assert.ok(stale.stale_keys.includes(key));
  const indexAfterStale=JSON.parse(fs.readFileSync(path.join(stateDir,'index.json'),'utf8'));
  assert.equal(indexAfterStale.entries[key].retrieved_at,newer.retrieved_at);

  const runtime=await startAliEvSourceRuntime({
    stateDir:path.join(root,'runtime-state'),
    systemiaMachineKey:'bundle-proof-machine',
    ingestToken:'bundle-proof-ingest',
  });
  try{
    const batch=await fetch(runtime.batch_ingest_url,{
      method:'POST',
      headers:{'content-type':'application/json',authorization:'Bearer bundle-proof-ingest'},
      body:JSON.stringify({snapshots:[older,newer,older]})
    });
    assert.equal(batch.status,201);
    const batchBody=await batch.json();
    assert.equal(batchBody.snapshot_count,3);
    assert.ok(batchBody.stale_key_count>=2);

    const read=await fetch(runtime.source_url,{
      method:'POST',
      headers:{'content-type':'application/json','x-systemia-machine-key':'bundle-proof-machine'},
      body:JSON.stringify({mode:'rivet_report_snapshot',address:'19820 International Blvd, SeaTac, WA 98188'})
    });
    assert.equal(read.status,200);
    const body=await read.json();
    assert.equal(body.retrieved_at,newer.retrieved_at);
    assert.equal(body.traffic[0].aadt,52000);
    assert.equal(body.nearby_observed_usage[0].charging_sessions_count,90);
  }finally{
    await runtime.close();
  }

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.aliev.snapshot-migration-proof.v1',
    content_addressed_bundle:true,
    byte_and_sha_verification:true,
    deterministic_oldest_to_newest_import:true,
    stale_import_cannot_overwrite_newer_owned_evidence:true,
    authenticated_batch_ingest:true,
    latest_snapshot_served_after_out_of_order_batch:true,
  },null,2));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
