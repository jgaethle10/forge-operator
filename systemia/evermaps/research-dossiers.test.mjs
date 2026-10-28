import test from 'node:test';
import assert from 'node:assert/strict';
import {auditGeojsonCollection} from './spatial-integrity.mjs';
import {buildAggregateResearchDossiers,RESEARCH_GATES} from './research-dossiers.mjs';

const p={type:'Polygon',coordinates:[[[-120,46],[-119,46],[-119,47],[-120,47],[-120,46]]]};
const make=(id,classification)=>({type:'Feature',geometry:p,properties:{
  OBJECTID:id,CLASSIFICATION:classification,COMMODITY:'Sand and Gravel',
  RESOURCE_ACREAGE:42,THICKNESS_CLASSIFICATION:'Undetermined'
}});
const source={type:'FeatureCollection',features:[
  make(1,'Demonstrated'),make(2,'Not a Resource'),make(3,'Speculative')
]};
const hash=auditGeojsonCollection(source).sha256_source_features;
const receipt={
  status:'source_geometry_complete_broad_phase_only',county:'Grant',
  layers:{resources:{
    source:'https://gis.dnr.wa.gov/source',dataset:'WGS 2026',complete:true,
    fetched_features:3,geometry_audit:{valid_for_mapping:true,sha256_source_features:hash}
  }}
};
test('WGS geology gets research dossiers with NO assumed mining eligibility',()=>{
  const result=buildAggregateResearchDossiers({source,receipt});
  assert.equal(result.record_count,2);
  assert.deepEqual(result.records.map(v=>v.source_object_id),[1,3]);
  assert.equal(result.commercial_eligibility,'none_verified');
  for(const dossier of result.records){
    assert.equal(dossier.suitability,'not_determined');
    assert.equal(dossier.legal_mining_eligibility,'not_determined');
    assert.equal(dossier.commercial_recommendation_allowed,false);
    assert.deepEqual(dossier.evidence_gates,RESEARCH_GATES);
  }
});
test('incomplete import or wrong source fingerprint never produces dossiers',()=>{
  const bad={...receipt,status:'data_incomplete_or_integrity_hold'};
  assert.throws(()=>buildAggregateResearchDossiers({source,receipt:bad}),/not verified/);
  const tampered={type:'FeatureCollection',features:source.features.map(v=>({...v,
    properties:{...v.properties,RESOURCE_ACREAGE:999}}))};
  assert.throws(()=>buildAggregateResearchDossiers({source:tampered,receipt}),/SHA-256/);
  assert.throws(()=>buildAggregateResearchDossiers({source,receipt:{...receipt,county:'Yakima'}}),/not verified/);
});
