import test from 'node:test';
import assert from 'node:assert/strict';
import {buildArcLengthTable} from './arc-length.mjs';
test('nonlinear parameter becomes near-uniform spatial movement',()=>{
 const table=buildArcLengthTable(t=>({x:t*t,y:0,z:0}),128);
 for(let i=0;i<=20;i++)assert.ok(Math.abs(table.pointAt(i/20).x-i/20)<.0001);
});
test('3D length, exact boundaries and clamping',()=>{
 const table=buildArcLengthTable(t=>({x:3*t,y:4*t,z:12*t}));
 assert.ok(Math.abs(table.length-13)<1e-9);
 assert.equal(table.parameterAt(-1),0);assert.equal(table.parameterAt(2),1);
 assert.deepEqual(table.pointAt(1),{x:3,y:4,z:12});
});
test('reject malformed or degenerate data and excessive budgets',()=>{
 assert.throws(()=>buildArcLengthTable(()=>({x:0,y:0,z:0})),/degenerate/);
 assert.throws(()=>buildArcLengthTable(()=>({x:NaN,y:0,z:0})),/invalid_curve_point/);
 assert.throws(()=>buildArcLengthTable(t=>({x:t,y:0,z:0}),999),/invalid_curve_budget/);
 assert.throws(()=>buildArcLengthTable(t=>({x:t,y:0,z:0})).pointAt(NaN),/invalid_distance_fraction/);
});
test('stationary segment does not create a nonfinite parameter',()=>{
 const table=buildArcLengthTable(t=>({x:Math.max(0,t-.5),y:0,z:0}));
 for(let i=0;i<=20;i++)assert.ok(Number.isFinite(table.parameterAt(i/20)));
});
