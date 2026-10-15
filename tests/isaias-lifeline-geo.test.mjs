import test from 'node:test';
import assert from 'node:assert/strict';
import {joinIsaiasForecastAndLifelines,geometryContainsPoint} from '../systemia/newsroom/isaias-lifeline-geo.mjs';

const square=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d],[a,b]];
const forecast={type:'FeatureCollection',features:[
 {type:'Feature',properties:{record_id:'NHC-TEST-1'},geometry:{type:'Polygon',coordinates:[square(-90,29,-86,32),square(-89,30,-88,31)]}}
]};
const sites={type:'FeatureCollection',features:[
 {type:'Feature',properties:{record_id:'FEMA-TEST-1',status:'unknown'},geometry:{type:'Point',coordinates:[-89.5,29.5]}},
 {type:'Feature',properties:{record_id:'FEMA-TEST-2',status:null},geometry:{type:'Point',coordinates:[-88.5,30.5]}},
 {type:'Feature',properties:{record_id:'FEMA-TEST-3',status:'open'},geometry:{type:'Point',coordinates:[-85,30]}}
]};
const metadata={
 forecastEvidence:{source_url:'https://www.nhc.noaa.gov/gis/',cyclone_id:'AL092026',issued_at:'2026-10-08T15:00:00Z',record_id:'AL092026-008-TEST',layer_semantics:'official_wind_probability_threshold',threshold_percent:34},
 facilityEvidence:{source_url:'https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/FeatureServer',retrieved_at:'2026-10-08T16:00:00Z',record_id:'FEMA-TEST-SHELTERS'}
};
test('no source evidence produces unknown, not zero',()=>{
 const result=joinIsaiasForecastAndLifelines();
 assert.equal(result.state,'held');
 assert.equal(result.forecast_exposure_candidates_count,null);
 assert.equal(result.confirmed_disruptions_count,null);
});
test('source-bound synthetic polygon computes candidates, excludes hole and offsite',()=>{
 const x=joinIsaiasForecastAndLifelines({forecast,facilities:sites,...metadata});
 assert.equal(x.state,'candidate_intersections_only');
 assert.equal(x.forecast_exposure_candidates_count,1);
 assert.equal(x.candidate_facilities[0].facility_record_id,'FEMA-TEST-1');
 assert.equal(x.confirmed_disruptions_count,null);
 assert.equal(x.source_validation,'caller_supplied_not_independently_authenticated');
 assert.match(x.forecast_evidence.sha256,/^[a-f0-9]{64}$/);
});
test('multipolygon works without treating observed disruptions as measured',()=>{
 const multi={type:'MultiPolygon',coordinates:[[square(-90,29,-86,32)],[square(-83,28,-81,30)]]};
 assert.equal(geometryContainsPoint(multi,[-82,29]),true);
 assert.equal(geometryContainsPoint(multi,[-84,29]),false);
});
test('source spoof and missing lineage fail closed',()=>{
 assert.equal(joinIsaiasForecastAndLifelines({forecast,facilities:sites,forecastEvidence:{...metadata.forecastEvidence,source_url:'https://nhc.noaa.gov.evil.test/gis/'},facilityEvidence:metadata.facilityEvidence}).state,'held');
 assert.equal(joinIsaiasForecastAndLifelines({forecast,facilities:sites,forecastEvidence:{...metadata.forecastEvidence,record_id:null},facilityEvidence:metadata.facilityEvidence}).state,'held');
});
test('invalid geometry, source ambiguity and duplicated facility IDs reject',()=>{
 assert.throws(()=>geometryContainsPoint({type:'LineString',coordinates:[]},[-88,30]),/must_be_polygon/);
 const dup={...sites,features:[sites.features[0],sites.features[0]]};
 assert.throws(()=>joinIsaiasForecastAndLifelines({forecast,facilities:dup,...metadata}),/duplicated/);
 assert.throws(()=>geometryContainsPoint(forecast.features[0].geometry,[220,31]),/invalid_geojson_point/);
});

test('forecast cone and non-hazard polygon are never labeled exposed facilities',()=>{
 const coneMetadata={...metadata.forecastEvidence,layer_semantics:'forecast_uncertainty_cone'};
 const x=joinIsaiasForecastAndLifelines({forecast,facilities:sites,forecastEvidence:coneMetadata,facilityEvidence:metadata.facilityEvidence});
 assert.equal(x.state,'held');
 assert.equal(x.reason,'forecast_layer_not_a_verified_hazard');
 assert.equal(x.forecast_exposure_candidates_count,null);
});
test('wind probability layers require quantitative threshold',()=>{
 const bad={...metadata.forecastEvidence,threshold_percent:undefined};
 const x=joinIsaiasForecastAndLifelines({forecast,facilities:sites,forecastEvidence:bad,facilityEvidence:metadata.facilityEvidence});
 assert.equal(x.reason,'wind_probability_threshold_missing');
});
