import test from 'node:test';
import assert from 'node:assert/strict';
import {PASSAGE_QA_SUITES,validatePassageQaAssignment,runAssignment} from '../systemia/passage/saban-qa-adapter.mjs';
const a=role=>({role,agent_id:'test-'+role,idempotency_key:'unit-test',work:{kind:'qa_suite',key:role},item:{kind:'qa_suite',key:role,raw:{}}});
test('Passage Saban QA only accepts registered fixed suites',()=>{
 assert.equal(Object.keys(PASSAGE_QA_SUITES).length,5);
 assert.deepEqual(validatePassageQaAssignment(a('signature_auditor')).files,['tests/passage-package.test.mjs']);
 assert.throws(()=>validatePassageQaAssignment(a('shell_agent')),/unregistered_role/);
 assert.throws(()=>validatePassageQaAssignment({...a('signature_auditor'),work:{kind:'qa_suite',key:'../../evil'}}),/scope_invalid/);
 assert.throws(()=>validatePassageQaAssignment({...a('signature_auditor'),item:{kind:'qa_suite',key:'signature_auditor',raw:{command:'rm'}}}),/external_parameters_not_allowed/);
});
test('Registered Saban adapter executes original Passage catalog tests',async()=>{
 const result=await runAssignment({assignment:a('catalog_auditor')});
 assert.equal(result.role,'catalog_auditor');
 assert.equal(result.status,'passed');
 assert.ok(result.test_count>=1);
 assert.equal(result.test_count,result.passed_count);
 assert.match(result.stdout_sha256,/^sha256:[a-f0-9]{64}$/);
 assert.equal(result.failure_excerpt,null);
});
