import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateProductLaunchClock as check} from '../systemia/launch-governance/product-launch-clock.mjs';
test('10:28 AM local Pacific is an eligible first-launch time',()=>{
  const v=check('2026-10-22T17:28:00Z');
  assert.equal(v.local_clock_face,'10:28'); assert.equal(v.time_eligible,true); assert.equal(v.publication_authorized,false);
});
test('2:05 PM and 7:04 PM local Pacific are eligible',()=>{
  assert.equal(check('2026-10-22T21:05:00Z').time_eligible,true);
  assert.equal(check('2026-10-23T02:04:00Z').time_eligible,true);
});
test('12-hour clock format also honors AM occurrences until founder specifies otherwise',()=>{
  assert.equal(check('2026-10-22T09:05:00Z').time_eligible,true); // 02:05 PDT
});
test('missed time must hold; not approximate by one minute',()=>{
  assert.equal(check('2026-10-22T17:29:00Z').status,'HOLD');
  assert.equal(check('2026-10-22T21:06:00Z').time_eligible,false);
});
test('Pacific DST rules are used, not hard-coded offsets',()=>{
  assert.equal(check('2026-11-22T18:28:00Z').local_clock_face,'10:28');
  assert.equal(check('2026-11-22T18:28:00Z').time_eligible,true);
});
test('ambiguous local time without offset must fail closed',()=>{
  assert.equal(check('2026-10-22T10:28:00').status,'HOLD');
  assert.equal(check('not-a-time').time_eligible,false);
});
