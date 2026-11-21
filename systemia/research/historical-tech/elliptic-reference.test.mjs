import test from 'node:test';
import assert from 'node:assert/strict';
import {maxwellEllipticMutualInductance} from './elliptic-reference.mjs';
import {coaxialMutualInductance} from './coupling-model.mjs';
function compare(config, tolerance=2e-6) {
  const direct = coaxialMutualInductance(config).mutualInductanceHenries;
  const elliptic = maxwellEllipticMutualInductance(config).mutualInductanceHenries;
  assert.ok(direct > 0 && elliptic > 0);
  const difference = Math.abs(direct-elliptic)/elliptic;
  assert.ok(difference < tolerance, 'Cross-check deviation ' + difference + ' for ' + JSON.stringify(config));
}
const base = {transmitterRadiusMm:25, receiverRadiusMm:15, transmitterTurns:2, receiverTurns:3};
test('Maxwell elliptic result agrees with Neumann integral at six separations',()=>{
  for (const separationMm of [10,20,30,40,60,80]) compare({...base,separationMm});
});
test('elliptic reference agrees for unequal radii',()=>{
  compare({transmitterRadiusMm:45,receiverRadiusMm:8,separationMm:15});
});
test('elliptic reference agrees for equal radii with positive gap',()=>{
  compare({transmitterRadiusMm:20,receiverRadiusMm:20,separationMm:10});
});
test('elliptic reference respects reciprocity',()=>{
  const a = maxwellEllipticMutualInductance({...base,separationMm:20}).mutualInductanceHenries;
  const b = maxwellEllipticMutualInductance({transmitterRadiusMm:base.receiverRadiusMm,
    receiverRadiusMm:base.transmitterRadiusMm,transmitterTurns:base.receiverTurns,
    receiverTurns:base.transmitterTurns,separationMm:20}).mutualInductanceHenries;
  assert.ok(Math.abs(a-b)/a < 1e-12);
});
test('turn scaling does not imply measured efficiency',()=>{
  const one = maxwellEllipticMutualInductance({transmitterRadiusMm:25,receiverRadiusMm:15,separationMm:20});
  const six = maxwellEllipticMutualInductance({...base,separationMm:20});
  assert.ok(Math.abs(6*one.mutualInductanceHenries - six.mutualInductanceHenries)/six.mutualInductanceHenries < 1e-12);
  assert.equal(six.evidenceKind,'theoretical_calculation_only');
});
test('reject coincident filaments',()=>{
  assert.throws(()=>maxwellEllipticMutualInductance({transmitterRadiusMm:20,receiverRadiusMm:20,separationMm:0}),RangeError);
});
test('reject poorly conditioned or invalid inputs',()=>{
  assert.throws(()=>maxwellEllipticMutualInductance({transmitterRadiusMm:25,receiverRadiusMm:15,separationMm:5000}),RangeError);
  assert.throws(()=>maxwellEllipticMutualInductance({transmitterRadiusMm:25,receiverRadiusMm:15,separationMm:NaN}),RangeError);
  assert.throws(()=>maxwellEllipticMutualInductance({transmitterRadiusMm:25,receiverRadiusMm:15,separationMm:20,transmitterTurns:0}),RangeError);
});
