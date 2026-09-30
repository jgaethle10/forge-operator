import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractAliEvSnapshots } from './aliev-extractor.mjs';
import { verifyAliEvSnapshotBundle } from '../../aliev/snapshot-bundle.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'aliev-extractor-proof-'));
const coverage=[
  'geocoding','charging_inventory','traffic','traffic_temporal','utility_service_area','utility_tariff','incentives',
  'parcel_planning','local_ev_stock','observed_sessions','freight','dwell_context','deep_market_evidence','provenance'
];
const snapshots=new Map([
  ['A',{
    response_profile:'rivet_report_snapshot_v1',access_policy:{commercial_access:true},evidence_state:'SOURCE_BACKED',
    matched_address:'Address A',retrieved_at:'2026-09-30T10:00:00.000Z',
    source_coverage_manifest:{schema:'evercraft.rivet.source-coverage.v1',domains:Object.fromEntries(coverage.map(k=>[k,{state:'CONNECTED'}]))}
  }],
  ['B',{
    response_profile:'rivet_report_snapshot_v1',access_policy:{commercial_access:true},evidence_state:'SOURCE_BACKED',
    matched_address:'Address B',retrieved_at:'2026-09-30T11:00:00.000Z',
    source_coverage_manifest:{schema:'evercraft.rivet.source-coverage.v1',domains:Object.fromEntries(coverage.map(k=>[k,{state:'CONNECTED'}]))}
  }]
]);
let calls=0;
const secret='proof-machine-secret-never-persist';
const sourceFetch=async(_url,options)=>{
  calls++;
  assert.equal(options.headers['x-systemia-machine-key'],secret);
  const body=JSON.parse(options.body);
  const snapshot=snapshots.get(body.address);
  return new Response(JSON.stringify(snapshot),{status:snapshot?200:404,headers:{'content-type':'application/json'}});
};

try{
  const result=await extractAliEvSnapshots({
    addresses:['A','B','A'],
    legacyEndpoint:'https://legacy.example.test/energySiteLookup',
    systemiaMachineKey:secret,
    outDir:root,
    sourceFetch,
    concurrency:2,
  });
  assert.equal(calls,2);
  assert.equal(result.extraction.addresses_requested,2);
  assert.equal(result.extraction.snapshots_extracted,2);
  assert.equal(result.extraction.machine_key_exposed,false);
  assert.equal(result.extraction.machine_key_persisted,false);
  const verification=verifyAliEvSnapshotBundle({bundleDir:root});
  assert.equal(verification.ok,true);
  const receiptText=fs.readFileSync(path.join(root,'extraction-receipt.json'),'utf8');
  const manifestText=fs.readFileSync(path.join(root,'manifest.json'),'utf8');
  assert.equal(receiptText.includes(secret),false);
  assert.equal(manifestText.includes(secret),false);
  assert.equal(result.extraction.source_role,'migration_only');
  assert.equal(result.extraction.runtime_dependency_created,false);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.aliev.legacy-extraction-proof.v1',
    deduplicated_addresses:true,
    bounded_concurrency:true,
    source_contract_verified:true,
    coverage_contract_verified:true,
    content_addressed_bundle_verified:true,
    migration_secret_not_persisted:true,
    legacy_runtime_dependency_created:false,
  },null,2));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
