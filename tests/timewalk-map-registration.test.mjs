import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  MAP_REGISTRATION_SCHEMA, registerHistoricalMapDraft, mapRegistrationChecklist
} from '../public/worlds/timewalk/map-registration.mjs';

const pending=JSON.parse(readFileSync(new URL(
  '../public/worlds/timewalk/yakima-1960/map-registration-pending.v1.json',import.meta.url
),'utf8'));
const points=[
  [0,0],[200,0],[0,200],[200,200],[110,260]
].map(([pixelX,pixelY],i)=>({
  id:'synthetic-tie-'+(i+1),pixelX,pixelY,
  easting:100+2*pixelX+.5*pixelY,
  northing:200-pixelX+3*pixelY,
  surveySourceUrl:'https://example.org/synthetic-not-real',
  mapFeatureNote:'Synthetic test-only tie point '+(i+1)+'; not actual Yakima coordinates',
  checkedByReviewer:true
}));
const valid=()=>({
  schema:MAP_REGISTRATION_SCHEMA,
  worldId:'yakima-wa-downtown-1960-alpha',
  sheetId:'synthetic-sheet-not-real',
  mapEditionYear:1950,sceneTargetYear:1960,
  collectionUrl:'https://www.loc.gov/item/sanborn09381_002/',
  sheetUrl:'https://example.org/synthetic-sheet',
  sheetIndexVerified:true,sheetInspected:true,
  jurisdiction:{city:'Yakima',region:'WA',country:'US'},
  projectedCrs:'EPSG:26910',
  controls:structuredClone(points),
  publicationRightsReviewed:true
});
const check=(f,regex)=>assert.throws(()=>registerHistoricalMapDraft(f),regex);

test('unidentified real Sanborn sheet remains pending with zero invented controls',()=>{
  assert.equal(pending.sheetUrl,null);
  assert.equal(pending.controls.length,0);
  const status=mapRegistrationChecklist(pending);
  assert.equal(status.readyToFit,false);
  assert.equal(status.readyToPublish,false);
  assert.equal(status.checks.find(x=>x.id==='publication-rights').done,true);
});
test('synthetic affine control fit reports residuals without claiming real historical map',()=>{
  const out=registerHistoricalMapDraft(valid());
  assert.equal(out.schema,MAP_REGISTRATION_SCHEMA);
  assert.equal(out.controlCount,5);
  assert.ok(out.rmsMeters<1e-4);
  assert.ok(out.maxResidualMeters<1e-4);
  const expected=[100,2,.5,200,-1,3];
  for(let i=0;i<6;i++)assert.ok(Math.abs(out.affineCoefficients[i]-expected[i])<1e-5);
  assert.equal(out.observedHistoricalAtTargetYear,false);
  assert.equal(out.geometryAuthorized,false);
  assert.equal(out.productionAuthoritative,false);
  assert.equal(out.publicMapTileAuthorized,false);
  assert.equal(out.reviewStatus,'draft_requires_review');
});
test('does not fit when the real map sheet index was not inspected',()=>{
  let x=valid();x.sheetInspected=false;check(x,/unreviewed_sheet_index/);
  x=valid();x.sheetIndexVerified=false;check(x,/unreviewed_sheet_index/);
  x=valid();x.sheetUrl=null;check(x,/unlinked_sheet/);
});
test('rejects wrong city and wrong coordinate reference authority',()=>{
  let x=valid();x.jurisdiction.city='Seattle';check(x,/wrong_city/);
  x=valid();x.jurisdiction.city='Tacoma';check(x,/wrong_city/);
  x=valid();x.projectedCrs=null;check(x,/missing_projected_crs/);
});
test('rejects underdetermined, collinear or unreviewed controls',()=>{
  let x=valid();x.controls=x.controls.slice(0,3);check(x,/insufficient_controls/);
  x=valid();x.controls=x.controls.map((p,i)=>({...p,pixelX:i*10,pixelY:i*10}));check(x,/collinear_or_singular/);
  x=valid();x.controls[2].checkedByReviewer=false;check(x,/control_not_reviewed/);
  x=valid();x.controls[2].surveySourceUrl='';check(x,/control_without_provenance/);
  x=valid();x.controls[2].id=x.controls[0].id;check(x,/duplicate_or_invalid_control/);
});
test('a map fitter cannot silently authorize 1960 geometry',()=>{
  let x=valid();x.mapEditionYear=1960;
  const out=registerHistoricalMapDraft(x);
  assert.equal(out.observedHistoricalAtTargetYear,true);
  assert.equal(out.geometryAuthorized,false);
  assert.equal(out.productionAuthoritative,false);
  assert.equal(mapRegistrationChecklist(x).readyToPublish,false);
});
