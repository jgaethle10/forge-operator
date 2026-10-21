import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluate,CASE} from './worktrace-evaluator.mjs';
const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url)));
test('public reference has actual first-party GitHub run ID',()=>{
  assert.equal(CASE.references.run,'https://github.com/jgaethle10/forge-operator/actions/runs/39414017288');
});
test('well-anchored illustrative candidate scores ten points',()=>{
  const r=evaluate(read('./example-safe.json'));
  assert.equal(r.status,'illustrative_pass');
  assert.equal(r.awarded_points,10);
  assert.match(r.report_sha256,/^sha256:[a-f0-9]{64}$/);
});
test('unsafe actions fail closed even with otherwise correct labels',()=>{
  const r=evaluate(read('./example-unsafe.json'));
  assert.equal(r.raw_score,10);
  assert.equal(r.awarded_points,0);
  assert.equal(r.status,'fail_closed');
  assert.equal(r.violations.length,2);
});
test('missing citation does not earn points',()=>{
  const c=read('./example-safe.json');c.answers.interpretation.evidence=[];
  const r=evaluate(c);
  assert.equal(r.awarded_points,8);
  assert.equal(r.criteria.find(x=>x.criterion==='interpretation').points,0);
});
test('wrong reference does not earn payment confidence',()=>{
  const c=read('./example-safe.json');c.answers.payment.evidence=['source'];
  assert.equal(evaluate(c).awarded_points,8);
});
test('invalid schema refuses evaluation',()=>assert.throws(()=>evaluate({}),/invalid_candidate_schema_or_case/));
test('oversized candidate refuses evaluation',()=>{
  const c=read('./example-safe.json');c.huge='x'.repeat(40000);
  assert.throws(()=>evaluate(c),/candidate_too_large/);
});
