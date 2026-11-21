import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSourceReview,sourceInspectionPacket} from '../public/worlds/timewalk/source-review-workbench.mjs';

const load=f=>JSON.parse(readFileSync(
 new URL('../public/worlds/timewalk/yakima-1960/'+f,import.meta.url),'utf8'));
const queue=load('source-review-queue.v1.json');
const ledger=load('evidence.v1.json');
const acquisition=load('csun-1960-acquisition.v1.json');
const fresh=()=>structuredClone(queue);

test('1952 LOC sheet 6/15 inspection tickets exist without certified pixels',()=>{
 assert.equal(validateSourceReview(queue,ledger,acquisition),queue);
 const packet=sourceInspectionPacket(queue,ledger,acquisition);
 assert.deepEqual(packet.primarySheets.map(s=>s.sheet),[6,15]);
 assert.deepEqual(packet.primarySheets.map(s=>s.viewerPage),[11,20]);
 assert.equal(packet.productionWorldReady,false);
 assert.ok(packet.primarySheets.every(x=>x.pixelsInspected===false&&x.geometry===null));
});
test('surrounding structures have separate review tickets, not fabricated buildings',()=>{
 const result=sourceInspectionPacket(queue,ledger,acquisition);
 assert.equal(result.confirmedNearbyChangesExist,true);
 assert.equal(result.unknownChangedBuildings,true);
 assert.deepEqual(result.reviewTickets.map(t=>t.category),
  ['named-landmark','named-landmark','unidentified-neighbor-inventory','unidentified-neighbor-inventory']);
 assert.ok(result.reviewTickets.every(t=>t.approved===false&&t.polygon===null));
});
test('mapsnap automatic Yakima placement is research-only and separately licensed',()=>{
 const m=sourceInspectionPacket(queue,ledger,acquisition).researchGeoreference;
 assert.equal(m.importedCoordinates,null);
 assert.equal(m.usableAsProductionGeometry,false);
 assert.match(m.license,/Open Database License 1.0/);
 assert.match(m.volumePlacementSummary,/73 of 92/);
});
test('source review fails closed for claimed 1960 inspection, rights or auto placement',()=>{
 const cases=[
  q=>q.verifiedHistoricalSources[0].digitalPixelsExamined=true,
  q=>q.verifiedHistoricalSources[1].viewerPage=11,
  q=>q.verifiedHistoricalSources[0].viewerUrl='https://other.example.org/sheet',
  q=>q.physicalAtlas.originalSheetImagesExamined=true,
  q=>q.physicalAtlas.commercial3dDerivativeRights='granted',
  q=>q.supplementalAlignment.exactSheet6Placed=true,
  q=>q.supplementalAlignment.importedControls.push({x:0,y:0}),
  q=>q.supplementalAlignment.mayDetermineProductionPlacement=true,
  q=>q.reviewUnits[2].approvedFor1960Geometry=true,
  q=>q.productionApproved=true,
  q=>q.worldGeometry={fake:true}
 ];
 for(const mutate of cases){
  const q=fresh();mutate(q);
  assert.throws(()=>validateSourceReview(q,ledger,acquisition),/timewalk_source_review_/);
 }
});
test('fake 1960 timeline or wrong city fails source inspection',()=>{
 let q=fresh();q.targetYear=1952;
 assert.throws(()=>sourceInspectionPacket(q,ledger,acquisition),/wrong_world_or_jurisdiction/);
 q=fresh();q.city='Seattle';
 assert.throws(()=>sourceInspectionPacket(q,ledger,acquisition),/wrong_world_or_jurisdiction/);
 q=fresh();q.reviewUnits[3].placeId='random-shop';
 assert.throws(()=>sourceInspectionPacket(q,ledger,acquisition),/unapproved_feature_geometry/);
});
