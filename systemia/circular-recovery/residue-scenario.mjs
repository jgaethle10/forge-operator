// Scenario math, not a material availability measurement or financial forecast.
// Keep dry mass, as-received mass, ownership and competing uses separate.
const fraction=x=>Number.isFinite(x)&&x>=0&&x<=1;
export function modelOrchardResidue(input={}){
 const {orchardAcres,dryResidueKgPerAcre,moistureWetBasis,collectableFraction,
  participatingFraction,uncommittedFraction,assumptionRef}=input;
 if(!Number.isFinite(orchardAcres)||orchardAcres<0||
    !Number.isFinite(dryResidueKgPerAcre)||dryResidueKgPerAcre<0||
    !fraction(moistureWetBasis)||moistureWetBasis===1||
    ![collectableFraction,participatingFraction,uncommittedFraction].every(fraction)||
    typeof assumptionRef!=='string'||!assumptionRef.trim())throw Error('explicit_residue_assumptions_required');
 const grossDryKg=orchardAcres*dryResidueKgPerAcre;
 const modeledDryKg=grossDryKg*collectableFraction*participatingFraction*uncommittedFraction;
 const modeledWetKg=modeledDryKg/(1-moistureWetBasis);
 if(![grossDryKg,modeledDryKg,modeledWetKg].every(Number.isFinite))throw Error('residue_scenario_overflow');
 return {schema:'evercraft.circular-recovery.residue-scenario.v1',grossDryKg,modeledDryKg,modeledWetKg,
  assumptionRef,actualAvailableDryKg:null,sourceState:'modeled',supplyVerified:false,
  buyerVerified:false,environmentalClaimVerified:false,commercialCommitment:false,physicalExecution:false};
}
