import test from 'node:test';import assert from 'node:assert/strict';
import {createRecoveryCase} from '../systemia/findmypart/recovery-engine.mjs';
import {ingestProviderResults} from '../systemia/findmypart/provider-ingest.mjs';
test('approved supplier result is traceable but cannot claim verified fitment',()=>{
 const initial=createRecoveryCase({description:'Broken washer drive gear'});
 const out=ingestProviderResults(initial,{id:'fixture-catalog',approved:true},[
  {track:'original',url:'https://example.org/washer-part',description:'Catalog lists replacement gear',claimed_available:true,claimed_compatible:true}
 ]);
 assert.equal(out.receipt.accepted.length,1);
 assert.equal(out.recovery.source_count,1);
 const candidate=out.recovery.tracks[0].candidates[0];
 assert.equal(candidate.fitment,'unverified');assert.equal(candidate.availability,'unverified');
 assert.equal(out.receipt.externally_verified,false);
 assert.equal(initial.source_count,0);
});
test('unapproved providers are rejected; invalid items are quarantined',()=>{
 const r=createRecoveryCase({description:'Lost chainsaw clutch'});
 assert.throws(()=>ingestProviderResults(r,{id:'unknown',approved:false},[]),/approved/);
 const x=ingestProviderResults(r,{id:'fixture-cad',approved:true},[
  {track:'cad_fabrication',url:'http://localhost/internal',description:'Private address'},
  {track:'cad_fabrication',url:'https://example.org/stl',description:'Possible CAD model'},
  {track:'cad_fabrication',url:'https://example.org/stl',description:'Duplicate model'}
 ]);
 assert.equal(x.receipt.accepted.length,1);assert.equal(x.receipt.rejected.length,2);
 assert.equal(x.recovery.tracks.find(t=>t.type==='cad_fabrication').candidates[0].manufacturability,'unverified');
});
