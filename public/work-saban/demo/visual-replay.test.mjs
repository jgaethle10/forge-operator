import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareVerifiedReplay} from './visual-replay.mjs';
const hash='c'.repeat(64);
const input={rowCount:6,months:[{month:'2026-07',cents:1250050},{month:'2026-08',cents:1230000},{month:'2026-09',cents:1150050}],grandTotal:3630100};
const proof={sourceHash:hash,reportHash:'f'.repeat(64),auditPassed:true};
test('verified source values become a normalized visual replay with no fictional workers',()=>{
  const m=prepareVerifiedReplay(input,proof);
  assert.equal(m.bars.length,3);
  assert.equal(m.bars[0].percent,100);
  assert.equal(m.grandTotal,3630100);
  assert.equal(m.steps.length,3);
  assert.match(m.steps.at(-1).detail,/Second arithmetic pass/);
  assert.ok(m.steps.every(s=>!/agent|AI worker|dispatched/i.test(s.label+' '+s.detail)));
});
test('cannot render unverified or forged numeric outcomes',()=>{
  assert.throws(()=>prepareVerifiedReplay(input,{...proof,auditPassed:false}),/check/);
  assert.throws(()=>prepareVerifiedReplay(input,{...proof,sourceHash:'no'}),/digests/);
  assert.throws(()=>prepareVerifiedReplay({...input,grandTotal:42},proof),/disagree/);
  assert.throws(()=>prepareVerifiedReplay({...input,months:[...input.months,input.months[0]]},proof));
  assert.throws(()=>prepareVerifiedReplay({...input,months:[{month:'x',cents:3}]},proof));
});
test('all-zero months remain visually true',()=>{
  const m=prepareVerifiedReplay({rowCount:1,months:[{month:'2026-10',cents:0}],grandTotal:0},proof);
  assert.equal(m.bars[0].percent,0);
});
