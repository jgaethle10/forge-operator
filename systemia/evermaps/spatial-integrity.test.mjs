import test from 'node:test';
import assert from 'node:assert/strict';
import {bboxForGeometry,bboxOverlaps,auditGeojsonCollection,auditStudyEnvelopes} from './spatial-integrity.mjs';

const rect=(xmin,ymin,xmax,ymax)=>({type:'Polygon',coordinates:[[
  [xmin,ymin],[xmax,ymin],[xmax,ymax],[xmin,ymax],[xmin,ymin]
]]});
const f=(id,geometry)=>({type:'Feature',properties:{OBJECTID:id,CLASSIFICATION:'Demonstrated'},geometry});
const fc=(...features)=>({type:'FeatureCollection',features});

test('GeoJSON polygon, multi polygon and point coordinates are assessed without geodesic-area claims',()=>{
  assert.deepEqual(bboxForGeometry(rect(-119,46,-118,47)),[-119,46,-118,47]);
  assert.deepEqual(bboxForGeometry({type:'Point',coordinates:[-119,46,20]}),[-119,46,-119,46]);
  const multi={type:'MultiPolygon',coordinates:[rect(-119,46,-118,47).coordinates,rect(-117,46,-116,47).coordinates]};
  assert.deepEqual(bboxForGeometry(multi),[-119,46,-116,47]);
  assert.equal(auditGeojsonCollection(fc(f(1,multi))).valid_for_mapping,true);
});
test('invalid and non-closed geometry or duplicate IDs block source validation',()=>{
  const invalid={type:'Polygon',coordinates:[[[-119,46],[-118,46],[-118,47],[-119,47]]]};
  assert.equal(auditGeojsonCollection(fc(f(1,invalid))).valid_for_mapping,false);
  const duplicate=auditGeojsonCollection(fc(f(1,rect(-119,46,-118,47)),f(1,rect(-118,46,-117,47))));
  assert.equal(duplicate.invalid_count,1);
  assert.equal(duplicate.valid_for_mapping,false);
  assert.throws(()=>bboxForGeometry({type:'Point',coordinates:[-190,46]}),/Invalid WGS point/);
  assert.throws(()=>bboxForGeometry({type:'Polygon',coordinates:[[[0,0],[1,1],[2,2],[0,0]]]}),/Degenerate/);
});
test('digest stable across API feature order, changes on geometry change',()=>{
  const a=f(1,rect(-119,46,-118,47)),b=f(2,rect(-117,46,-116,47));
  const first=auditGeojsonCollection(fc(a,b));
  const swapped=auditGeojsonCollection(fc(b,a));
  const mutated=auditGeojsonCollection(fc(a,f(2,rect(-117,46,-115,47))));
  assert.equal(first.sha256_source_features,swapped.sha256_source_features);
  assert.notEqual(first.sha256_source_features,mutated.sha256_source_features);
});
test('BBOX intersection is only possible overlap, never certified study containment',()=>{
  const resources=auditGeojsonCollection(fc(
    f(1,rect(-119,46,-118,47)),f(2,rect(-116,46,-115,47))
  ));
  const studies=auditGeojsonCollection(fc(f(9,rect(-119.2,45.9,-118.5,46.5))));
  const report=auditStudyEnvelopes(resources,studies);
  assert.equal(report.resource_envelopes_with_possible_study_overlap,1);
  assert.equal(report.resource_envelopes_disjoint_from_studies,1);
  assert.equal(report.actual_polygon_intersection_verified,false);
  assert.deepEqual(report.candidates[0].possible_study_ids,[9]);
});
test('empty study layer cannot imply study coverage',()=>{
  const a=auditGeojsonCollection(fc(f(1,rect(-119,46,-118,47))));
  const b=auditGeojsonCollection(fc());
  assert.equal(auditStudyEnvelopes(a,b).resource_envelopes_disjoint_from_studies,1);
});
