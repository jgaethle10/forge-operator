import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compilePublicReferencePoints,REFERENCE_OVERLAY_SCHEMA} from './public-reference-points.mjs';

const center={lat:28.6083,lon:-80.6043};
const source=()=>({
  type:'FeatureCollection',
  metadata:{coord_units:'WGS84 decimal degrees; lon,lat',modeled_visuals_excluded:true,not_for:['navigation','civil engineering']},
  features:[{type:'Feature',id:'39A',geometry:{type:'Point',coordinates:[-80.604133,28.608422]},properties:{name:'Fictional testing label',coordinate_source:'Public record example',source_url:'https://example.org/public-reference',geometry_state:'sourced_point_only',building_or_pad_footprint_state:'not_provided',engineering_approval:'none'}}]
});
const clone=x=>structuredClone(x);

test('reference point projection preserves WGS84 and no physical or simulation authority',()=>{
  const x=compilePublicReferencePoints(source(),center);
  assert.equal(x.schema,REFERENCE_OVERLAY_SCHEMA);
  assert.equal(x.projection,'local_equirectangular_approximation_meters');
  assert.equal(x.scaleFactor,1);
  assert.deepEqual(x.points[0].wgs84,{lon:-80.604133,lat:28.608422});
  assert.ok(x.points[0].localMetersApprox.x>0);
  assert.ok(x.points[0].localMetersApprox.z<0);
  assert.equal(x.points[0].authority.physicalExtent,false);
  assert.equal(x.points[0].authority.geology,false);
  assert.equal(x.isNavigable,false);
  assert.equal(x.decisionAuthority,false);
});
test('same inputs yield exact equivalent output and do not mutate sources',()=>{
  const f=source(),before=clone(f);
  assert.deepEqual(compilePublicReferencePoints(f,center),compilePublicReferencePoints(f,center));
  assert.deepEqual(f,before);
});
test('sorting and duplicate detection are deterministic',()=>{
  const f=source(),duplicate=clone(f.features[0]);duplicate.id='39B';
  duplicate.geometry.coordinates=[-80.620869,28.627306];f.features.push(duplicate);
  assert.deepEqual(compilePublicReferencePoints(f,center).points.map(v=>v.id),['reference:39A','reference:39B']);
  duplicate.id='39A';assert.throws(()=>compilePublicReferencePoints(f,center),/duplicate_id/);
});
test('rejects every non-point feature and extra altitude data',()=>{
  for(const geometry of [{type:'Polygon',coordinates:[]},{type:'LineString',coordinates:[[0,0],[1,1]]},{type:'Point',coordinates:[-80.6,28.6,40]}]){
    const f=source();f.features[0].geometry=geometry;
    assert.throws(()=>compilePublicReferencePoints(f,center),/point_geometry_only|exact_lonlat_required/);
  }
});
test('rejects source and authority laundering',()=>{
  const patches=[
    p=>p.geometry_state='modeled',p=>p.engineering_approval='approved',p=>p.building_or_pad_footprint_state='measured',p=>p.source_url='http://localhost/private',p=>p.name='',
  ];
  for(const patch of patches){const f=source();patch(f.features[0].properties);assert.throws(()=>compilePublicReferencePoints(f,center));}
  const f=source();delete f.metadata.modeled_visuals_excluded;
  assert.throws(()=>compilePublicReferencePoints(f,center),/missing_truth_boundary/);
});
test('rejects shifted coordinates, projections without origin and distance beyond local extent',()=>{
  for(const coords of [[Infinity,28],[0,90],['-80.6',28.6],[181,30]]){
    const f=source();f.features[0].geometry.coordinates=coords;
    assert.throws(()=>compilePublicReferencePoints(f,center));
  }
  assert.throws(()=>compilePublicReferencePoints(source(),null),/origin_required/);
  assert.throws(()=>compilePublicReferencePoints(source(),{lat:100,lon:-80}),/unsupported_latitude/);
  assert.throws(()=>compilePublicReferencePoints(source(),{lat:47,lon:-122}),/beyond_local_projection_bounds/);
});
test('rejects empty and overlarge datasets',()=>{
  const f=source();f.features=[];
  assert.throws(()=>compilePublicReferencePoints(f,center),/invalid_feature_count/);
  f.features=Array.from({length:257},(_,i)=>({...source().features[0],id:'point'+i}));
  assert.throws(()=>compilePublicReferencePoints(f,center),/invalid_feature_count/);
});
