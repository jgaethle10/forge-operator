import test from 'node:test';import assert from 'node:assert/strict';
import {createRecoveryCase,addRecoveryEvidence,summarizeRecovery} from '../systemia/findmypart/recovery-engine.mjs';
test('universal recovery case can be created from descriptions or evidence',()=>{
 const caseA=createRecoveryCase({description:'Broken gear',equipment:'1994 washing machine'});
 assert.equal(caseA.tracks.length,6);assert.equal(caseA.source_count,0);
 assert.equal(summarizeRecovery(caseA).outcome,'no_search_completed');
 const caseB=createRecoveryCase({references:[{kind:'photo',reference:'private-upload-id',label:'Broken pulley photo'}]});
 assert.equal(caseB.references[0].kind,'photo');
 assert.throws(()=>createRecoveryCase({}));
});
test('evidence creates candidate leads without implied compatibility',()=>{
 let r=createRecoveryCase({description:'Discontinued chainsaw clutch drum'});
 r=addRecoveryEvidence(r,{track:'cad_fabrication',url:'https://example.org/model/123',claim:'Model claims compatible geometry'});
 assert.equal(r.source_count,1);
 assert.equal(r.tracks.find(x=>x.type==='cad_fabrication').candidates[0].manufacturability,'unverified');
 assert.equal(summarizeRecovery(r).outcome,'unverified_leads_for_review');
 assert.throws(()=>addRecoveryEvidence(r,{track:'cad_fabrication',url:'https://example.org/model/123',claim:'Duplicate claim'}));
});
test('safety-critical parts require review; private sources are rejected',()=>{
 const r=createRecoveryCase({description:'Replacement brake component',equipment:'Car'});
 assert.equal(r.safety.review_required,true);
 assert.throws(()=>addRecoveryEvidence(r,{track:'engineered_substitute',url:'http://127.0.0.1/test',claim:'unverified part'}));
});
