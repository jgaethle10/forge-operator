const assert=require('node:assert/strict');
const test=require('node:test');
const A=require('../site/aero-core.js');
const base={code:'2412',alpha:4,speed:40,area:16,mass:650,ar:8};
test('symmetrical NACA 0012 geometry and zero-lift',()=>{
 const g=A.geometry('0012');assert.equal(g.upper.length,101);assert.equal(g.lower.length,101);
 assert.ok(Math.abs(A.zeroLiftAngle('0012'))<1e-12);
 assert.ok(Math.abs(g.upper[50].y+g.lower[50].y)<1e-12);
});
test('NACA 2412 camber has about -2 deg zero lift',()=>{
 const deg=A.zeroLiftAngle('2412')*180/Math.PI;
 assert.ok(deg < -1.8 && deg > -2.3,deg);
});
test('NASA lift equation, quadratic airspeed scaling',()=>{
 const a=A.estimate(base), b=A.estimate({...base,speed:80});
 assert.ok(a.lift>0);assert.ok(Math.abs(b.lift/a.lift-4)<1e-10);
 assert.ok(Math.abs(a.lift-a.q*a.area*a.cl)<1e-8);
});
test('linear lift slope and symmetric zero-angle wing',()=>{
 const a=A.estimate({...base,code:'0012',alpha:0});assert.ok(Math.abs(a.lift)<1e-9);
 const b=A.estimate({...base,code:'0012',alpha:5});assert.ok(b.lift>0);
});
test('out-of-envelope does not masquerade as validated flight prediction',()=>{
 const a=A.estimate({...base,alpha:16});assert.equal(a.withinEnvelope,false);
 assert.match(a.limitations,/Not CFD/);
});
test('rejects malformed and dangerous/nonsensical inputs',()=>{
 for(const code of ['abc','9990','0000','2500'])assert.throws(()=>A.geometry(code));
 for(const p of [{...base,area:0},{...base,mass:-5},{...base,speed:Infinity},{...base,ar:100}])assert.throws(()=>A.estimate(p));
});
