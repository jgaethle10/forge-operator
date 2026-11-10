import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateArchiveAcquisition, archiveInquiryPacket, acquisitionReadiness} from '../public/worlds/timewalk/archive-acquisition.mjs';

const load=name=>JSON.parse(readFileSync(new URL(
  '../public/worlds/timewalk/yakima-1960/'+name,import.meta.url),'utf8'));
const a=load('csun-1960-acquisition.v1.json');
const ledger=load('evidence.v1.json');
const copy=()=>structuredClone(a);

test('the CSUN record is catalog-only, not a historical 1960 sheet',()=>{
 assert.equal(validateArchiveAcquisition(a,ledger),a);
 assert.equal(a.selectedYear,1960);
 assert.equal(a.catalog.holdingYearsListed.includes(1960),true);
 assert.equal(a.catalog.originalSheetInspected,false);
 assert.equal(a.catalog.originalSheetId,null);
 assert.equal(a.sourceAccess.purchaseAuthorized,false);
});
test('no original or public-world accuracy is inferred from catalog date',()=>{
 const r=acquisitionReadiness(a,ledger);
 assert.equal(r.catalogHoldingConfirmed,true);
 assert.equal(r.exactSheetConfirmed,false);
 assert.equal(r.originalItemExamined,false);
 assert.equal(r.georeferencingAuthorized,false);
 assert.equal(r.publicSceneAccuracyVerified,false);
 assert.equal(r.publishOriginalMapAllowed,false);
});
test('reflects confirmed inquiry delivery without sending again or charging',()=>{
 const r=archiveInquiryPacket(a,ledger);
 assert.equal(r.recipient,'sanborn@csun.edu');
 assert.match(r.subject,/1960 Yakima Sanborn/);
 assert.match(r.body,/South Second Street and East Yakima Avenue/);
 assert.match(r.body,/South Third Street and East Yakima Avenue/);
 assert.match(r.body,/permission/i);
 assert.match(r.body,/not authorization for any paid service/);
 assert.equal(r.sendAuthorized,false);
 assert.equal(r.feeApproved,false);
 assert.equal(r.inquiryAlreadySent,true);
 assert.equal(r.deliveryStatus,'sent-awaiting-archive-response');
 assert.ok(r.flags.includes('sent-awaiting-archive-response'));
 assert.ok(!r.flags.includes('not-sent'));
});
test('rejects wrong-city and unrelated historical maps',()=>{
 let b=copy();b.location.city='Seattle';
 assert.throws(()=>validateArchiveAcquisition(b,ledger),/wrong_city/);
 b=copy();b.evidenceSourceId='loc-sanborn';
 assert.throws(()=>validateArchiveAcquisition(b,ledger),/source_catalog_unverified/);
 b=copy();b.catalog.holdingYearsListed=[1959];
 assert.throws(()=>validateArchiveAcquisition(b,ledger),/no_selected_year_in_catalog/);
});
test('catalog-only map cannot be upgraded to examined or mapped without real inspection',()=>{
 for(const [section,field,value] of [
   ['catalog','originalSheetInspected',true],
   ['catalog','originalSheetId','sheet-5'],
   ['catalog','exactCoverageConfirmed',true],
   ['catalog','sheetUpdateDate','1960'],
   ['catalog','imageOriginalUrl','https://example.org/test.jpg'],
   ['catalog','currentGeoreferencing',{}],
   ['catalog','originalImageHash','a'.repeat(64)]
 ]){
   const b=copy();b[section][field]=value;
   assert.throws(()=>validateArchiveAcquisition(b,ledger),/cannot_assert_1960_original_from_collection_listing/);
 }
});
test('cannot authorize expense, commercial publication or geometry via the research candidate',()=>{
 for(const [section,field] of [
   ['sourceAccess','purchaseAuthorized'],
   ['sourceAccess','acquisitionPaid'],
   ['sourceAccess','publicDistributionAllowed'],
   ['sourceAccess','originalMapImageEmbeddingAllowed'],
   ['sourceAccess','commercialDerivedGeometryAllowed'],
   [null,'geometryReady'],
   [null,'worldsRuntimeAuthorized']
 ]){
  const b=copy();
  if(section)b[section][field]=true;
  else b[field]=true;
  assert.throws(()=>validateArchiveAcquisition(b,ledger),/premature_publication_purchase_or_geometry/);
 }
});

test('never silently changes archive contact status or purchase authority',()=>{
 let b=copy();b.sourceAccess.inquiryStatus='not-sent';
 assert.throws(()=>validateArchiveAcquisition(b,ledger),/inconsistent_inquiry_state/);
 b=copy();b.sourceAccess.replyReceived=true;
 assert.throws(()=>validateArchiveAcquisition(b,ledger),/inconsistent_inquiry_state/);
 const status=acquisitionReadiness(a,ledger);
 assert.match(status.outstanding[0],/Await CSUN response/);
 assert.equal(a.sourceAccess.purchaseAuthorized,false);
});
