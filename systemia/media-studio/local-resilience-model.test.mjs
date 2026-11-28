import test from 'node:test';
import assert from 'node:assert/strict';
import {simulate} from './local-resilience-model.mjs';
const base={households:1000,monthlyDollars:100,shiftBps:2500,chainBps:3000,localBps:6000,respendingBps:5000,rounds:5};
test('scenario conserves cash and distinguishes turnover from new wealth',()=>{
 const r=simulate(base);
 assert.equal(r.initialCents,120000000);
 assert.equal(r.scenario.redirectedCents,30000000);
 assert.equal(r.baseline.firstRetainedCents,36000000);
 assert.equal(r.scenario.firstRetainedCents,45000000);
 assert.equal(r.deltaLocalReceiptsCents,17437500);
 for(const p of [r.baseline,r.scenario])assert.equal(p.escapedCents+p.remainingCents,r.initialCents);
 assert.equal(r.notGdp,true);assert.equal(r.notJobsForecast,true);
});
test('zero shift, equal retention and reversed retention behave honestly',()=>{
 assert.equal(simulate({...base,shiftBps:0}).deltaLocalReceiptsCents,0);
 assert.equal(simulate({...base,localBps:3000}).deltaLocalReceiptsCents,0);
 assert.ok(simulate({...base,localBps:1000}).deltaLocalReceiptsCents<0);
 assert.equal(simulate({...base,respendingBps:0}).scenario.steps[1].localReceiptCents,0);
});
test('bounded integer arithmetic and invalid inputs',()=>{
 const r=simulate({...base,households:100000,monthlyDollars:10000,shiftBps:10000,localBps:10000,respendingBps:10000,rounds:12});
 assert.equal(r.scenario.remainingCents,r.initialCents);
 assert.equal(r.scenario.cumulativeLocalReceiptsCents,r.initialCents*12);
 for(const patch of [{shiftBps:10001},{households:-1},{monthlyDollars:1.5},{rounds:0},{chainBps:NaN}])assert.throws(()=>simulate({...base,...patch}));
});
