import test from 'node:test';
import assert from 'node:assert/strict';
import {PORTFOLIO_QA_SUITES,validatePortfolioQaAssignment,runAssignment} from '../systemia/saban/product-qa-adapter.mjs';
const assignment=role=>({
 agent_id:'test-'+role,idempotency_key:'unit-'+role,role,
 work:{kind:'qa_suite',key:role},
 item:{kind:'qa_suite',key:role,raw:{}},
});
test('Saban portfolio QA roles are fixed and never accept arbitrary commands or file scopes',()=>{
 assert.deepEqual(Object.keys(PORTFOLIO_QA_SUITES),[
  'work_saban_checker','findmypart_checker','forensiscope_checker','research_checker'
 ]);
 assert.ok(validatePortfolioQaAssignment(assignment('work_saban_checker')).files.includes('tests/work-saban-customer-csv.test.mjs'));
 assert.throws(()=>validatePortfolioQaAssignment(assignment('shell')),/unregistered/);
 assert.throws(()=>validatePortfolioQaAssignment({...assignment('work_saban_checker'),work:{kind:'arbitrary',key:'work_saban_checker'}}),/scope/);
 assert.throws(()=>validatePortfolioQaAssignment({...assignment('findmypart_checker'),item:{kind:'qa_suite',key:'findmypart_checker',raw:{command:'curl'}}}),/parameters_disallowed/);
 assert.throws(()=>validatePortfolioQaAssignment(assignment('work_saban_checker'),'/tmp'),/root_mismatch/);
});
test('Saban QA adapter actually executes bounded Work Saban regression tests',async()=>{
 const result=await runAssignment({assignment:assignment('work_saban_checker')});
 assert.equal(result.status,'passed',JSON.stringify(result));
 assert.ok(result.test_count>=2);
 assert.equal(result.test_count,result.passed_count);
 assert.equal(result.failed_count,0);
 assert.match(result.stdout_sha256,/^sha256:[a-f0-9]{64}$/);
 assert.deepEqual(result.suite_files,PORTFOLIO_QA_SUITES.work_saban_checker);
});
