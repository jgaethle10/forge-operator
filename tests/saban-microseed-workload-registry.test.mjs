import test from 'node:test';
import assert from 'node:assert/strict';

import {
  executeRegisteredMicroSeedWorkload,
  microSeedWorkloadCatalog,
  microSeedWorkloadSpec,
  microSeedConformanceDefinition,
  RivetRequiredSourceDomains,
} from '../systemia/saban/microseed-workload-registry.mjs';

test('registered workload catalog is closed, bounded, and contains real RIVET/AliEV integrity work',()=>{
  const catalog=microSeedWorkloadCatalog();
  assert.equal(catalog.schema,'evercraft.microseed.workload-catalog.v1');
  assert.equal(catalog.arbitrary_code_execution,false);
  for(const id of [
    'systemia.rivet.source-coverage-audit.v1',
    'systemia.aliev.domain-record-digest.v1',
    'systemia.rivet.observed-session-sanity.v1',
    'systemia.json-canonicalize.v1',
  ]){
    const spec=microSeedWorkloadSpec(id);
    assert.ok(spec,id);
    assert.ok(spec.max_payload_bytes<=64*1024);
    assert.equal(spec.private_data_allowed,true);
    assert.ok(microSeedConformanceDefinition(id)?.payload!==undefined);
  }
});

test('RIVET source coverage audit requires all 14 explicit domains',()=>{
  const domains=Object.fromEntries(
    RivetRequiredSourceDomains.map(k=>[k,{state:'CONNECTED',record_count:1,source_status:'proof'}])
  );
  const good=executeRegisteredMicroSeedWorkload(
    'systemia.rivet.source-coverage-audit.v1',
    {
      snapshot:{
        response_profile:'rivet_report_snapshot_v1',
        source_coverage_manifest:{
          schema:'evercraft.rivet.source-coverage.v1',
          domains,
        },
      },
    }
  );
  assert.equal(good.ok,true);
  assert.equal(good.required_domain_count,14);
  assert.equal(good.explicit_domain_count,14);
  assert.deepEqual(good.missing_domains,[]);

  delete domains.observed_sessions;
  const bad=executeRegisteredMicroSeedWorkload(
    'systemia.rivet.source-coverage-audit.v1',
    {
      snapshot:{
        response_profile:'rivet_report_snapshot_v1',
        source_coverage_manifest:{
          schema:'evercraft.rivet.source-coverage.v1',
          domains,
        },
      },
    }
  );
  assert.equal(bad.ok,false);
  assert.deepEqual(bad.missing_domains,['observed_sessions']);
});

test('AliEV domain digest is deterministic independent of record order',()=>{
  const a=executeRegisteredMicroSeedWorkload(
    'systemia.aliev.domain-record-digest.v1',
    {domain:'traffic',records:[
      {record_key:'b',aadt:200},
      {record_key:'a',aadt:100},
    ]}
  );
  const b=executeRegisteredMicroSeedWorkload(
    'systemia.aliev.domain-record-digest.v1',
    {domain:'traffic',records:[
      {record_key:'a',aadt:100},
      {record_key:'b',aadt:200},
    ]}
  );
  assert.equal(a.domain_digest,b.domain_digest);
  assert.deepEqual(a.records.map(x=>x.record_key),['a','b']);
});

test('observed-session audit preserves missing-is-not-zero and modeled-is-not-observed',()=>{
  const result=executeRegisteredMicroSeedWorkload(
    'systemia.rivet.observed-session-sanity.v1',
    {records:[
      {aggregate_key:'good',charging_sessions_count:12,measurement_state:'observed'},
      {aggregate_key:'missing',measurement_state:'observed'},
      {aggregate_key:'modeled',charging_sessions_count:4,measurement_state:'modeled'},
    ]}
  );
  assert.equal(result.ok,false);
  assert.equal(result.valid_count,1);
  assert.equal(result.invalid_count,2);
  assert.equal(result.missing_is_never_zero,true);
  assert.equal(result.modeled_is_never_observed,true);
  assert.ok(result.invalid_records.find(x=>x.record_key==='missing').issues.includes('sessions_missing_not_zero'));
  assert.ok(result.invalid_records.find(x=>x.record_key==='modeled').issues.includes('non_observed_measurement_state'));
});

test('unknown workload is not executable',()=>{
  assert.equal(executeRegisteredMicroSeedWorkload('systemia.arbitrary-shell.v1',{}),null);
});
