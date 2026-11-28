// Offline desktop screening only. No network, scheduler, execution authority, or live integration.
export function assessRecovery(input) {
  if (!input || typeof input !== "object") throw Error("record_required");
  const {id,stream,pathway,evidence,material,balance,environment,market}=input;
  const allowed={plastic:["mechanical","chemical","energy"],tire:["mechanical","devulcanization","thermal"],biomass:["fiber","biochar","digestion","energy"]};
  if(typeof id!=="string"||!id.trim()||!Object.hasOwn(allowed,stream)||!allowed[stream].includes(pathway))throw Error("invalid_record_identity");
  const validEvidence=e=>e&&typeof e.source==="string"&&e.source.trim()&&typeof e.ref==="string"&&e.ref.trim()&&["observed","reported","modeled"].includes(e.state);
  const refs=Array.isArray(evidence)?evidence.filter(validEvidence):[];
  const gaps=[];
  if(!refs.length)gaps.push("source_evidence");
  if(!material||material.identityVerified!==true||material.contaminantsScreened!==true)gaps.push("feedstock_characterization");
  const numbers=balance&&[balance.inputKg,balance.productKg,balance.residueKg,balance.emissionKg,balance.otherOutputKg];
  let residualKg=null;
  if(!numbers||!numbers.every(n=>Number.isFinite(n)&&n>=0)||numbers[0]<=0)gaps.push("mass_balance_missing");
  else {
    residualKg=numbers[0]-numbers.slice(1).reduce((a,b)=>a+b,0);
    if(Math.abs(residualKg)>Math.max(0.000001,numbers[0]*0.001))gaps.push("mass_balance_open");
  }
  if(!environment||!["energyKwh","baselineKgCO2e","processKgCO2e"].every(k=>Number.isFinite(environment[k])&&environment[k]>=0)||!environment.boundaryRef)gaps.push("environmental_comparison_missing");
  if(!market||typeof market.specRef!=="string"||!market.specRef.trim()||typeof market.buyerEvidenceRef!=="string"||!market.buyerEvidenceRef.trim())gaps.push("market_validation");
  if(["thermal","chemical","energy","biochar","digestion"].includes(pathway))gaps.push("qualified_process_safety_and_permit_review");
  return {schema:"evercraft.circular-recovery.screen.v0",id,stream,pathway,sourceCount:refs.length,residualKg,gaps,stage:gaps.length?"research_gaps":"desktop_review_candidate",authorityGranted:false,physicalExecution:false,commercialCommitment:false,environmentalClaimVerified:false};
}
