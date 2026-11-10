import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateDrawingCatalog,makeDrawingResearchQueue} from '../public/worlds/timewalk/architectural-drawing-intake.mjs';

const load=name=>JSON.parse(readFileSync(
 new URL('../public/worlds/timewalk/yakima-1960/'+name,import.meta.url),'utf8'
));
const ledger=load('evidence.v1.json');
const drawings=load('yvm-architectural-drawings.v1.json');
const copy=()=>structuredClone(drawings);

test('Yakima museum index is a catalog lead, not physical 1960 plans',()=>{
 assert.equal(validateDrawingCatalog(drawings,ledger),drawings);
 assert.equal(drawings.catalogItems.length,4);
 assert.equal(drawings.archive.inquirySent,true);
 assert.equal(drawings.archive.replyReceived,false);
 assert.equal(drawings.archive.purchaseAuthorized,false);
 assert.equal(drawings.archive.paid,false);
});
test('original Larson plans are indexed with precise archived shelf locations',()=>{
 const office=drawings.catalogItems.find(x=>x.id==='larson-office-july1930');
 assert.equal(office.displayDate,'July 15, 1930');
 assert.match(office.catalogLocation,/Drawer 7, bottom left/);
 assert.deepEqual(office.listedSheetGroups.map(x=>x.type),['architectural','electrical','structural']);
 const tracings=drawings.catalogItems.find(x=>x.id==='larson-linen-tracings-july1930');
 assert.match(tracings.catalogLocation,/5-2/);
});
test('Fox Capitol four 1930 alteration drawings stay unverified as-built',()=>{
 const theatre=drawings.catalogItems.find(x=>x.placeId==='capitol');
 assert.equal(theatre.title,'Alterations to the Fox Capitol Theatre');
 assert.equal(theatre.displayDate,'June 27, 1930');
 assert.match(theatre.catalogLocation,/Y-11/);
 assert.equal(theatre.historicallyBuiltAsDrawn,null);
 assert.equal(theatre.unchangedBy1960,null);
});
test('queue never exports surveyed geometry, a renderer or licensed images',()=>{
 const q=makeDrawingResearchQueue(drawings,ledger);
 assert.equal(q.worldsAuthority,false);
 assert.equal(q.readyForProduction,false);
 assert.equal(q.geometry,null);
 assert.equal(q.renderer,null);
 assert.deepEqual(q.originalImages,[]);
 assert.equal(q.unresolvedItemCount,4);
 assert.ok(q.items.every(x=>x.originalInspected===false &&
   x.actualAsBuiltYear1960Verified===false && x.publicAndCommercialReuseApproved===false));
 assert.ok(!q.allowableActions.includes('order_scans'));
});
test('a catalog item cannot silently turn into an inspected original or 1960 proof',()=>{
 for(const field of ['archiveItemConfirmed','geometrySourceApproved']){
  const c=copy(); c.catalogItems[0][field]=true;
  assert.throws(()=>validateDrawingCatalog(c,ledger),/uninspected_plan_claiming/);
 }
 for(const field of ['historicallyBuiltAsDrawn','unchangedBy1960']){
  const c=copy();c.catalogItems[0][field]=true;
  assert.throws(()=>validateDrawingCatalog(c,ledger),/uninspected_plan_claiming/);
 }
});
test('a catalog record cannot grant image or derivative publication rights',()=>{
 for(const field of ['itemReviewed','commercialDerivativeAllowed','publicReproductionAllowed']){
  const c=copy();c.catalogItems[0].rights[field]=true;
  assert.throws(()=>validateDrawingCatalog(c,ledger),/item_rights_not_proven/);
 }
 const c=copy();c.outputAuthority.canUseAsBuilt1960Geometry=true;
 assert.throws(()=>validateDrawingCatalog(c,ledger),/unapproved_render_or_rights/);
});
test('wrong source, world, place, accession or physical access status fail closed',()=>{
 let c=copy();c.worldId='wrong-world';
 assert.throws(()=>validateDrawingCatalog(c,ledger),/schema_or_world/);
 c=copy();c.archive.catalogSourceId='nps-larson';
 assert.throws(()=>validateDrawingCatalog(c,ledger),/unverified_archive_catalog/);
 c=copy();c.catalogItems[0].placeId='seattle-capitol';
 assert.throws(()=>validateDrawingCatalog(c,ledger),/invalid_catalog_item/);
 c=copy();c.catalogItems[0].catalogAccession='not-in-index';
 assert.throws(()=>validateDrawingCatalog(c,ledger),/invalid_catalog_item/);
 c=copy();c.archive.replyReceived=true;
 assert.throws(()=>validateDrawingCatalog(c,ledger),/unverified_or_paid_archive_status/);
 c=copy();c.archive.purchaseAuthorized=true;
 assert.throws(()=>validateDrawingCatalog(c,ledger),/unverified_or_paid_archive_status/);
});
