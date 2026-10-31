import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecoveryCase,addRecoveryEvidence,summarizeRecovery} from '../systemia/findmypart/recovery-engine.mjs';
import {analyzePartQuery,buildSourceSearches} from '../public/findmypart/search/engine.mjs';
import {recoveryResearchLinks} from '../public/findmypart/search/recovery-links.mjs';

// Synthetic benchmark cases. These are NOT verified real-world part matches.
const fixtures=[
 ['washer','1994 washing machine stripped drive gear','Washing machine'],
 ['chainsaw','Old chainsaw clutch drum unavailable locally','Chainsaw'],
 ['tractor','Ford tractor hydraulic pump D8NN-600-AA','Farm tractor'],
 ['boat','Marine outboard shift linkage missing','Boat outboard'],
 ['industrial','Discontinued conveyor roller mounting bracket','Industrial conveyor'],
 ['electronics','Obsolete receiver tuning knob','Vintage radio'],
 ['automotive','Car brake master cylinder substitution','Passenger car'],
 ['medical','Life support ventilator valve replacement','Medical device'],
 ['photo','', 'Unknown equipment']
];
for(const [id,description,equipment] of fixtures){
 test('Saban synthetic recovery case: '+id,()=>{
  const recovery=createRecoveryCase({
   description,equipment,
   references:id==='photo'?[{kind:'photo',reference:'synthetic-private-asset-id',label:'Unidentified broken component'}]:[]
  });
  assert.equal(recovery.tracks.length,6);
  assert.deepEqual(recovery.tracks.map(t=>t.status),Array(6).fill('not_searched'));
  assert.equal(recovery.source_count,0);
  assert.equal(recovery.fulfillment,'not_authorized');
  assert.equal(summarizeRecovery(recovery).outcome,'no_search_completed');
  if(description){
   const query=analyzePartQuery(description);
   assert.equal(query.valid,true);
   assert.equal(buildSourceSearches(query).length,4);
   assert.equal(recoveryResearchLinks(query.query).length,6);
  }
  if(['automotive','medical'].includes(id))assert.equal(recovery.safety.review_required,true);
 });
}
test('Saban evidence honesty: a CAD listing is not proof it can be printed',()=>{
 let record=createRecoveryCase({description:'Discontinued plastic knob',equipment:'Vintage radio'});
 record=addRecoveryEvidence(record,{track:'cad_fabrication',url:'https://example.com/sample-model',claim:'User reports a possible printable model'});
 const lead=record.tracks.find(x=>x.type==='cad_fabrication').candidates[0];
 assert.equal(lead.fitment,'unverified');
 assert.equal(lead.manufacturability,'unverified');
 assert.equal(lead.availability,'unverified');
});
test('Saban privacy and bad inputs fail closed',()=>{
 assert.throws(()=>createRecoveryCase({description:'',equipment:'Unknown'}));
 assert.equal(analyzePartQuery(' ').valid,false);
 const record=createRecoveryCase({description:'Unknown part'});
 assert.throws(()=>addRecoveryEvidence(record,{track:'salvage',url:'http://localhost/private',claim:'Private localhost data'}));
});
