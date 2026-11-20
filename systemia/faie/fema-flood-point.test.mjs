import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectFemaFloodAtPoint,parseFemaPointFeatures,
  femaPointLayerUrl,validateFemaPoint,OFFICIAL_FEMA_FLOOD_SOURCE
} from './fema-flood-point.mjs';

const point={latitude:46.6021,longitude:-120.5059};
const zoneResponse={features:[{attributes:{
  FLD_ZONE:'AE',ZONE_SUBTY:'FLOODWAY',SFHA_TF:'T',
  FLD_AR_ID:'SAFE-FIXTURE-001',SOURCE_CIT:'53077C',
  STATIC_BFE:1100,DEPTH:null,VELOCITY:null
}}]};
const panelResponse={features:[{attributes:{
  FIRM_PAN:'53077C0307D',EFF_DATE:1665532800000,
  PANEL_TYP:'Printed Panel',SOURCE_CIT:'53077C'
}}]};
function sourceFetch({zone=zoneResponse,panel=panelResponse,failZone=false,failPanel=false}={}){
  const urls=[];
  const fetchImpl=async(url,options)=>{
    urls.push(url);
    const u=new URL(url);
    assert.equal(u.origin,'https://hazards.fema.gov');
    assert.equal(u.searchParams.get('geometryType'),'esriGeometryPoint');
    assert.equal(u.searchParams.get('inSR'),'4326');
    assert.equal(u.searchParams.get('spatialRel'),'esriSpatialRelIntersects');
    assert.equal(u.searchParams.get('returnGeometry'),'false');
    assert.equal(u.searchParams.get('geometry'),'-120.505900,46.602100');
    assert.equal(options.redirect,'error');
    if(u.pathname.endsWith('/28/query'))return {
      ok:!failZone,status:failZone?503:200,text:async()=>JSON.stringify(zone)
    };
    if(u.pathname.endsWith('/3/query'))return {
      ok:!failPanel,status:failPanel?503:200,text:async()=>JSON.stringify(panel)
    };
    throw Error('unexpected_URL');
  };
  return {fetchImpl,urls};
}
test('fixed FEMA owned service layers with exact WGS84 point and no dynamic URL',()=>{
  const url=femaPointLayerUrl(28,point);
  assert.ok(url.startsWith(OFFICIAL_FEMA_FLOOD_SOURCE.zone_layer+'/query?'));
  assert.match(url,/inSR=4326/);
  assert.throws(()=>femaPointLayerUrl(55,point),/not_allowlisted/);
  assert.throws(()=>validateFemaPoint(0,0),/contiguous_us/);
});
test('mapped official zone and FIRM panel are source-linked but not insurance approval',async()=>{
  const source=sourceFetch();
  const result=await collectFemaFloodAtPoint({
    ...point,retrievedAt:'2026-11-20T07:00:00Z',fetchImpl:source.fetchImpl
  });
  assert.equal(result.schema,'evercraft.faie.fema-flood-point.v1');
  assert.equal(result.status,'mapped_hazard_polygon_at_point');
  assert.equal(result.hazard_polygons[0].flood_zone,'AE');
  assert.equal(result.hazard_polygons[0].special_flood_hazard_area,true);
  assert.equal(result.firm_panels[0].firm_panel,'53077C0307D');
  assert.equal(result.firm_panels[0].effective_date,'2022-10-12');
  assert.equal(result.panel_lookup_status,'returned');
  assert.equal(result.evidence_state,'REPORTED');
  assert.equal(result.insurance_premium_estimate,null);
  assert.equal(result.insurance_eligibility_decision,null);
  assert.equal(result.site_suitability_verdict,null);
  assert.equal(result.decision_authority,false);
  assert.equal(result.request_persisted,false);
  assert.equal(source.urls.length,2);
});
test('no polygon with effective panel is an incomplete mapped result, not a safety finding',async()=>{
  const source=sourceFetch({zone:{features:[]}});
  const result=await collectFemaFloodAtPoint({...point,fetchImpl:source.fetchImpl});
  assert.equal(result.status,'no_hazard_polygon_returned_with_panel_context');
  assert.deepEqual(result.hazard_polygons,[]);
  assert.ok(result.limitations.some(s=>s.includes('NOT evidence')));
});
test('no polygon and no panel is an unknown-coverage result, never an X or low-risk zone',async()=>{
  const source=sourceFetch({zone:{features:[]},panel:{features:[]}});
  const result=await collectFemaFloodAtPoint({...point,fetchImpl:source.fetchImpl});
  assert.equal(result.status,'zone_not_returned_coverage_unverified');
  assert.equal(result.firm_panels.length,0);
  assert.equal(result.site_suitability_verdict,null);
});
test('missing panel source is explicitly unavailable, not invented effective date',async()=>{
  const source=sourceFetch({failPanel:true});
  const result=await collectFemaFloodAtPoint({...point,fetchImpl:source.fetchImpl});
  assert.equal(result.panel_lookup_status,'unavailable');
  assert.deepEqual(result.firm_panels,[]);
  assert.equal(result.status,'mapped_hazard_polygon_at_point');
});
test('failed zone source fails closed even if panel is available',async()=>{
  const source=sourceFetch({failZone:true});
  await assert.rejects(collectFemaFloodAtPoint({...point,fetchImpl:source.fetchImpl}),/hazard_zone_unverified/);
});
test('ArcGIS error, incomplete polygons, excessive and malformed payloads rejected',()=>{
  for(const payload of [
    {error:{code:403}}, {features:null}, {features:[],exceededTransferLimit:true},
    {features:new Array(7).fill({attributes:{}})},{features:[{}]}
  ])assert.throws(()=>parseFemaPointFeatures(payload,'zone'),/invalid|incomplete|malformed/);
});
test('source attributes are allowlisted and no arbitrary provider data is reflected',()=>{
  const parsed=parseFemaPointFeatures({
    features:[{attributes:{FLD_ZONE:'X',SFHA_TF:'F',SECRET:'should never leak'}}]
  },'zone');
  assert.equal(parsed[0].FLD_ZONE,'X');
  assert.equal(parsed[0].SFHA_TF,'F');
  assert.ok(!JSON.stringify(parsed).includes('SECRET'));
  assert.ok(!JSON.stringify(parsed).includes('should never leak'));
});
