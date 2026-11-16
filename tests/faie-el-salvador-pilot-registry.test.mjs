import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data=JSON.parse(readFileSync(new URL('../systemia/faie/international/el-salvador-coffee-pilot.v1.json',import.meta.url),'utf8'));

test('El Salvador candidate is explicit about held deployment, payment and authority',()=>{
  assert.equal(data.schema,'evercraft.faie.international-pilot-source-registry.v1');
  assert.equal(data.country.iso2,'SV');
  assert.equal(data.admission,'CANDIDATE_PENDING_SYSTEMIA_ADMISSION');
  assert.equal(data.deployment_state,'NOT_DEPLOYED');
  assert.equal(data.integration_state,'SOURCE_DISCOVERY_ONLY');
  assert.equal(data.public_demo_verified,false);
  assert.equal(data.payment_verified,false);
  assert.equal(data.field_evidence_verified,false);
  for(const key of ['publication_authority','decision_authority','payments_or_outreach_authority']){
    assert.equal(data.evidence_policy[key],false,key);
  }
  assert.equal(data.evidence_policy.mapped_data_not_field_observation,true);
});

test('Sources are official HTTPS discoveries, not synthetic ingestion receipts',()=>{
  assert.ok(data.sources.length>=4);
  const seen=new Set();
  for(const source of data.sources){
    assert.ok(source.id&&!seen.has(source.id),'source IDs unique');
    seen.add(source.id);
    const url=new URL(source.url);
    assert.equal(url.protocol,'https:');
    assert.ok(url.hostname.endsWith('.gob.sv')||url.hostname==='geoportal.bcr.gob.sv',
      'government source expected: '+url.hostname);
    assert.equal(source.source_state,'DISCOVERED_NOT_INGESTED');
    assert.ok(source.data_character&&source.notes);
    assert.ok(source.dimensions.length>0);
  }
});

test('Modeled soil map is never relabeled as observed farm evidence',()=>{
  const map=data.sources.find(x=>x.id==='sv-marn-mag-centa-soil-mapserver');
  assert.ok(map);
  assert.deepEqual(map.layers.map(x=>x.id),[0,1,2]);
  assert.match(map.data_character,/MODELED/);
  assert.match(map.notes,/field soil test/i);
});

test('A reviewed country-specific pilot must address water, source rights and human decisions',()=>{
  assert.ok(data.minimum_evidence_dimensions.includes('water'));
  assert.ok(data.minimum_evidence_dimensions.includes('soil'));
  assert.ok(data.launch_gates.some(g=>/license/i.test(g)));
  assert.ok(data.launch_gates.some(g=>/Systemia/i.test(g)));
  assert.ok(data.launch_gates.some(g=>/payment-to-fulfillment/i.test(g)));
});
