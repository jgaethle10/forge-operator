import test from 'node:test';
import assert from 'node:assert/strict';
import {modelOrchardResidue} from './residue-scenario.mjs';
test('explicit assumptions preserve dry/wet distinction and never assert availability',()=>{
 const input={orchardAcres:100,dryResidueKgPerAcre:200,moistureWetBasis:0.5,collectableFraction:0.5,
  participatingFraction:0.2,uncommittedFraction:0.5,assumptionRef:'synthetic:test'};
 const r=modelOrchardResidue(input);
 assert.equal(r.grossDryKg,20000);assert.equal(r.modeledDryKg,1000);assert.equal(r.modeledWetKg,2000);
 assert.equal(r.actualAvailableDryKg,null);assert.equal(r.supplyVerified,false);
 assert.equal(modelOrchardResidue({...input,participatingFraction:0}).modeledDryKg,0);
 for(const patch of [{moistureWetBasis:1},{collectableFraction:1.1},{dryResidueKgPerAcre:-1},{assumptionRef:''},{participatingFraction:undefined}])
  assert.throws(()=>modelOrchardResidue({...input,...patch}),/explicit_residue_assumptions_required/);
});
