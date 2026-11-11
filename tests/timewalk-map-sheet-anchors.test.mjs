import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateArchiveAcquisition,acquisitionReadiness} from '../public/worlds/timewalk/archive-acquisition.mjs';
import {makeMapSheetAnchors} from '../public/worlds/timewalk/map-sheet-anchors.mjs';
import {makeTimewalkSceneHandoff} from '../public/worlds/timewalk/walk-topology.mjs';

const load=file=>JSON.parse(readFileSync(
  new URL('../public/worlds/timewalk/yakima-1960/'+file,import.meta.url),'utf8'
));
const ledger=load('evidence.v1.json');
const acquisition=load('csun-1960-acquisition.v1.json');
const route=load('walk-topology.v1.json');
const architecture=load('larson-periods.v1.json');
const duplicate=()=>structuredClone(acquisition);

test('authentic CSUN reply identifies sheets 6 and 15 without making original 1960 images inspected',()=>{
 assert.equal(validateArchiveAcquisition(acquisition,ledger),acquisition);
 const r=acquisitionReadiness(acquisition,ledger);
 assert.equal(r.catalogHoldingConfirmed,true);
 assert.equal(r.sheetNumbersIdentifiedByArchivist,true);
 assert.deepEqual(r.identifiedSheetNumbers,[6,15]);
 assert.equal(r.exactSheetConfirmed,false);
 assert.equal(r.originalItemExamined,false);
 assert.equal(r.publicSceneAccuracyVerified,false);
});

test('historical map anchors tie 1952 LOC references to Larson and Capitol but do not overclaim 1960',()=>{
 const a=makeMapSheetAnchors(acquisition,ledger);
 assert.equal(a.anchors.length,2);
 assert.deepEqual(a.anchors.map(x=>x.sheetNumber),[6,15]);
 assert.deepEqual(a.anchors.map(x=>x.digitalViewerPage),[11,20]);
 assert.deepEqual(a.anchors.map(x=>x.placeId),['ae-larson','capitol']);
 assert.ok(a.anchors.every(x=>x.digitalEditionYear===1952));
 assert.equal(a.curatorReportedFootprintsMatch1952,true);
 assert.equal(a.independentFootprintComparisonComplete,false);
 assert.equal(a.individual1960CorrectionDateVerified,false);
 assert.equal(a.accurate1960SceneAuthorized,false);
 assert.equal(a.sourceImageRights1952,'loc-online-public-domain');
 assert.equal(a.sourceImageRights1960,'unverified-separate-physical-copy');
});

test('named 1952 maps can flow into the original Worlds handoff without geometry or runtime ownership',()=>{
 const out=makeTimewalkSceneHandoff(ledger,route,architecture,acquisition);
 assert.equal(out.targetRuntime,'evercraft-worlds');
 assert.equal(out.historicalMapAnchors.anchors.length,2);
 assert.equal(out.geometry,null);
 assert.equal(out.physics,null);
 assert.equal(out.renderer,null);
 assert.equal(out.productionWorldReady,false);
 assert.ok(out.historicalMapAnchors.anchors.every(x=>
   x.extractedPolygon===null && x.historicCoordinates===null && x.imageEmbedded===false));
});

test('missing archive confirmation cannot silently create a sheet anchor',()=>{
 const a=duplicate();
 a.sourceAccess.replyReceived=false;
 a.sourceAccess.archiveSheetNumbersConfirmed=false;
 a.sourceAccess.inquiryStatus='sent-awaiting-archive-response';
 delete a.curatorConfirmation;
 assert.equal(validateArchiveAcquisition(a,ledger),a);
 assert.throws(()=>makeMapSheetAnchors(a,ledger),/archive_has_not_identified_sheets/);
});

test('false 1960 scan, artificial map position or rights claim is rejected',()=>{
 for(const [key,value] of [
   ['original1960ImagesObtained',true],
   ['independentSheetComparisonCompleted',true],
   ['exactRevisionStampsRead',true],
   ['publicOriginal1960SheetReproductionAllowed',true],
   ['coordinates',{latitude:46.6,longitude:-120.5}]
 ]){
  const a=duplicate(); a.curatorConfirmation[key]=value;
  assert.throws(()=>validateArchiveAcquisition(a,ledger),/unsupported_1960_original_claim/);
 }
});

test('wrong LOC page or mismatched identity must not enter the scene',()=>{
 let a=duplicate();a.curatorConfirmation.sheetMatches[0].locViewerPage=20;
 assert.throws(()=>validateArchiveAcquisition(a,ledger),/wrong_archive_sheet_or_viewer/);
 a=duplicate();a.curatorConfirmation.sheetMatches[1].landmark='ae-larson';
 assert.throws(()=>makeMapSheetAnchors(a,ledger),/sheet_not_bound_to_named_place/);
 a=duplicate();a.curatorConfirmation.sheetMatches[0].locViewerUrl='https://example.com/not-a-source';
 assert.throws(()=>validateArchiveAcquisition(a,ledger),/wrong_archive_sheet_or_viewer/);
});
