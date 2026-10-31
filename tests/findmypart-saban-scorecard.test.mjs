import test from 'node:test';import assert from 'node:assert/strict';
import {scoreRecoveryTrial} from '../systemia/findmypart/saban-scorecard.mjs';
test('missing search and CAD results score zero, not invented success',()=>{
 const x=scoreRecoveryTrial({case_id:'synthetic-washer',safety_critical:false});
 assert.equal(x.verified_count,0);assert.equal(x.release_eligible,false);
 assert.equal(x.dimensions.length,5);
});
test('verified requires external source evidence',()=>{
 assert.throws(()=>scoreRecoveryTrial({case_id:'a',identification:{outcome:'verified'}}),/source_evidence/);
 assert.equal(scoreRecoveryTrial({case_id:'b',identification:{outcome:'verified',evidence:['https://example.org/manual']}}).verified_count,1);
});
test('safety-critical substitute cannot be green without safety review',()=>{
 const x=scoreRecoveryTrial({case_id:'synthetic-brake',safety_critical:true,
  substitution:{outcome:'verified',evidence:['https://example.org/drawing']}});
 assert.equal(x.safety_hold,true);assert.equal(x.release_eligible,false);
});
test('invalid score and insecure evidence fail closed',()=>{
 assert.throws(()=>scoreRecoveryTrial({case_id:'a',cad:{outcome:'made_up'}}));
 assert.throws(()=>scoreRecoveryTrial({case_id:'a',cad:{outcome:'verified',evidence:['http://localhost']}}));
});
