import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateArchiveAcquisition,acquisitionReadiness} from '../public/worlds/timewalk/archive-acquisition.mjs';
import {makeMapChangeReview,classify1952MapFeatureFor1960} from '../public/worlds/timewalk/map-change-review.mjs';
import {makeTimewalkSceneHandoff} from '../public/worlds/timewalk/walk-topology.mjs';
const load=file=>JSON.parse(readFileSync(new URL('../public/worlds/timewalk/yakima-1960/'+file,import.meta.url),'utf8'));
const ledger=load('evidence.v1.json');
const a=load('csun-1960-acquisition.v1.json');
const route=load('walk-topology.v1.json');
const profile=load('larson-periods.v1.json');
const draft=()=>structuredClone(a);

test('six correction rounds and nearby changes are source-reported, not a direct 1960 scan',()=>{
 assert.equal(validateArchiveAcquisition(a,ledger),a);
 const r=makeMapChangeReview(a,ledger);
 assert.equal(r.correctionRoundsReported,6);
 assert.equal(r.bothSheetsCorrected,true);
 assert.equal(r.sixRoundDatesKnown,false);
 assert.equal(r.pasteoverDateGranularity,'not_recorded');
 assert.equal(r.evidenceKind,'archivist_correspondence_not_direct_1960_scan');
 assert.equal(r.surroundingStructures.knownChangesOccurred,true);
 assert.equal(r.surroundingStructures.changedStructureIds,null);
 assert.equal(r.surroundingStructures.changedStructureCount,null);
 assert.equal(r.all1952BuildingsSuitableFor1960,false);
 assert.equal(r.productionSceneAuthorized,false);
});
test('only two named landmarks receive archivist-reported apparent continuity',()=>{
 const r=makeMapChangeReview(a,ledger);
 assert.deepEqual(r.landmarkComparisons.map(x=>x.placeId),['ae-larson','capitol']);
 assert.deepEqual(r.landmarkComparisons.map(x=>x.sheetNumber),[6,15]);
 assert.ok(r.landmarkComparisons.every(x=>x.supportsExact1960AsBuiltGeometry===false &&
   x.supportsFacadeOrStorefront1960===false && x.measuredPolygon===null));
});
test('1952 neighbor building is NOT copied into the 1960 world',()=>{
 const r=makeMapChangeReview(a,ledger);
 const n=classify1952MapFeatureFor1960({
   id:'test-neighbor',placeId:'unknown-downtown-neighbor',
   sourceYear:1952,requestedYear:1960,sourceType:'loc-online-sanborn'
 },r);
 assert.equal(n.category,'surrounding_structure_1960_unresolved');
 assert.equal(n.sheetNumber,null);
 assert.equal(n.canCopy1952FootprintInto1960,false);
 assert.equal(n.currentGeometryVerified,false);
 assert.equal(n.geometry,null);
});
test('1952 landmark is also NOT approved as 1960 geometry without independent review',()=>{
 const r=makeMapChangeReview(a,ledger);
 const n=classify1952MapFeatureFor1960({
   id:'test-larson',placeId:'ae-larson',
   sourceYear:1952,requestedYear:1960,sourceType:'loc-online-sanborn'
 },r);
 assert.equal(n.category,'named_landmark_reported_unchanged');
 assert.equal(n.evidenceConfidence,'archivist_report_only');
 assert.equal(n.sheetNumber,6);
 assert.equal(n.canCopy1952FootprintInto1960,false);
 assert.equal(n.canCopy1952FacadeInto1960,false);
});
test('Worlds receives warning about 1952–1960 nearby changes, but no renderer',()=>{
 const out=makeTimewalkSceneHandoff(ledger,route,profile,a);
 assert.equal(out.neighborhoodChangeReview.correctionRoundsReported,6);
 assert.equal(out.neighborhoodChangeReview.surroundingStructures.knownChangesOccurred,true);
 assert.equal(out.neighborhoodChangeReview.geometry,null);
 assert.equal(out.geometry,null);
 assert.equal(out.physics,null);
 assert.equal(out.renderer,null);
 assert.equal(out.productionWorldReady,false);
 assert.ok(out.warnings.some(s=>s.includes('blanket 1952 neighborhood')));
});
test('cannot turn unrecorded pasteover dates into dated evidence or cleared rights',()=>{
 for(const [key,value] of [
  ['reportedCorrectionRounds',5],
  ['individualPasteoverDatesRecorded',true],
  ['surroundingBuildingsChangedBetween1952And1960',false],
  ['changedSurroundingBuildingsIdentified',true],
  ['changedSurroundingBuildingGeometryExtracted',true],
  ['copyrightClarificationStatus','permission_granted']
 ]){
   const c=draft();c.curatorConfirmation.additionalReply[key]=value;
   assert.throws(()=>validateArchiveAcquisition(c,ledger),/unsupported_archivist_followup_claim/);
 }
});
test('wrong source year or fake authority cannot enter review classification',()=>{
 const r=makeMapChangeReview(a,ledger);
 assert.throws(()=>classify1952MapFeatureFor1960({
   id:'not-1952',sourceYear:1960,requestedYear:1960,sourceType:'loc-online-sanborn'
 },r),/invalid_feature_provenance/);
 const changed={...r,productionSceneAuthorized:true};
 assert.throws(()=>classify1952MapFeatureFor1960({
   id:'a',sourceYear:1952,requestedYear:1960,sourceType:'loc-online-sanborn'
 },changed),/invalid_review_authority/);
});
test('readiness reports undated pasteovers and unknown changed neighbors',()=>{
 const r=acquisitionReadiness(a,ledger);
 assert.equal(r.correctionRoundsReported,6);
 assert.equal(r.surroundingBuildingsChangedReported,true);
 assert.ok(r.outstanding.some(x=>x.includes('Individual pasteover dates were not recorded')));
 assert.ok(r.outstanding.some(x=>x.includes('Map and assess nearby')));
});
