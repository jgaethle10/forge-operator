import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  validateHistoricalEvidence, makeHistoricalOverlay,
  isDirectTargetYearObservation, mediaAssetCanBeEmbedded
} from '../public/worlds/timewalk/historical-evidence.mjs';

const ledger=JSON.parse(readFileSync(new URL(
  '../public/worlds/timewalk/yakima-1960/evidence.v1.json',import.meta.url
),'utf8'));
const clone=()=>structuredClone(ledger);

test('Yakima evidence is explicitly scoped to the city, not a street name',()=>{
  assert.deepEqual(ledger.location.jurisdiction,{city:'Yakima',region:'WA',country:'US'});
  assert.ok(ledger.sources.every(s=>s.targetJurisdiction.city==='Yakima'));
  assert.ok(ledger.excludedSearchResults.some(x=>
    x.sourceJurisdiction.city==='Seattle' && x.allowedForScene===false));
  assert.equal(validateHistoricalEvidence(ledger),ledger);
});

test('rejects same-named Yakima Avenue directory from another city',()=>{
  const wrong=clone(); wrong.sources[0].targetJurisdiction.city='Seattle';
  assert.throws(()=>validateHistoricalEvidence(wrong),/jurisdiction mismatch/);
  const wrongCity=clone(); wrongCity.sources[0].targetJurisdiction.city='Tacoma';
  assert.throws(()=>validateHistoricalEvidence(wrongCity),/jurisdiction mismatch/);
});

test('rejects promoting an excluded Seattle document to accepted evidence',()=>{
  const wrong=clone();
  const excluded=wrong.excludedSearchResults[0];
  wrong.sources.push({
    id:excluded.id,name:'Wrong city record',url:excluded.url,
    targetJurisdiction:excluded.sourceJurisdiction,
    rights:{status:'metadata_link_only'},evidencePeriod:['1960']
  });
  assert.throws(()=>validateHistoricalEvidence(wrong),/jurisdiction mismatch/);
});

test('no 1960 verification without a direct dated source and item review',()=>{
  const noProof=clone();
  const c=noProof.places[0].claims.find(x=>x.period==='1960');
  c.evidence='documented';
  assert.equal(isDirectTargetYearObservation(c,noProof),false);
  assert.throws(()=>validateHistoricalEvidence(noProof),/target year/);
});

test('future direct-year evidence is technically representable when reviewed, not permanently banned',()=>{
  // Synthetic fixture tests schema behavior, NOT a real historical fact about Yakima.
  const example=clone();
  example.sources.push({
    id:'test-direct-1960',name:'SYNTHETIC test-only record, do not publish',
    url:'https://example.org/synthetic-item',
    targetJurisdiction:{city:'Yakima',region:'WA',country:'US'},
    evidencePeriod:['1960'],rights:{status:'metadata_link_only'}
  });
  const c=example.places[0].claims.find(x=>x.id==='ae-1960-existence');
  c.evidence='documented';
  c.sourceIds=['test-direct-1960'];
  c.targetYearProof={
    sourceId:'test-direct-1960',observationDate:'1960-05-01',
    itemLocator:'synthetic-archive:illustrative-fixture-only',
    reviewNote:'Synthetic 1960 item and geographic identity inspected in fixture',
    locationChecked:true,originalItemInspected:true
  };
  assert.equal(isDirectTargetYearObservation(c,example),true);
  assert.equal(validateHistoricalEvidence(example),example);
  const out=makeHistoricalOverlay(example,1960);
  const fact=out.places.find(x=>x.id==='ae-larson').claims.find(x=>x.id==='ae-1960-existence');
  assert.equal(fact.directTargetYearProof,true);
  assert.equal(fact.directSourceItem.observationDate,'1960-05-01');
  assert.equal(out.accurateSceneClaimAllowed,false);
  const wrongDate=structuredClone(example);
  wrongDate.places[0].claims.find(x=>x.id==='ae-1960-existence').targetYearProof.observationDate='1959';
  assert.throws(()=>validateHistoricalEvidence(wrongDate),/target year/);
});

test('collection-level rights alone cannot publish a sourced historic image',()=>{
  const loc=ledger.sources.find(s=>s.id==='loc-sanborn');
  const photo=ledger.sources.find(s=>s.id==='wshs-yakima-avenue-ca1950');
  const item={sourceId:loc.id,itemId:'digital-sheet-001',originalUrl:'https://www.loc.gov/item/sanborn09381_002/',
    credit:'Library of Congress',itemRights:'public-domain-verified',
    reviewedForPublication:true};
  assert.equal(mediaAssetCanBeEmbedded(loc,item),true);
  assert.equal(mediaAssetCanBeEmbedded(loc,{...item,reviewedForPublication:false}),false);
  assert.equal(mediaAssetCanBeEmbedded(loc,{...item,itemId:''}),false);
  assert.equal(mediaAssetCanBeEmbedded(photo,{...item,sourceId:photo.id}),false);
  assert.equal(mediaAssetCanBeEmbedded(photo,{
    ...item,sourceId:photo.id,itemRights:'permission-granted',explicitPermissionRecord:true
  }),true);
  assert.equal(mediaAssetCanBeEmbedded(photo,{
    ...item,sourceId:photo.id,itemRights:'permission-granted'
  }),false);
});
