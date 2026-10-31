// FindMyPart Saban scorecard v1: submitted evidence bookkeeping, not independent verification or launch authority.
export const DIMENSIONS=['identification','sourcing','cad','substitution','safety'];
const OUTCOMES=['verified','unverified','not_attempted','failed'];
export function scoreRecoveryTrial(trial){
 if(!trial||typeof trial!=='object'||!trial.case_id)throw Error('case_id_required');
 const rows=DIMENSIONS.map(d=>{
  const x=trial[d]||{outcome:'not_attempted'};
  if(!OUTCOMES.includes(x.outcome))throw Error('invalid_outcome_'+d);
  if(x.outcome==='verified'&&(!Array.isArray(x.evidence)||!x.evidence.length||
    x.evidence.some(e=>typeof e!=='string'||!/^https:\/\//.test(e))))
   throw Error('verified_requires_source_evidence_'+d);
  return {dimension:d,outcome:x.outcome,passed:x.outcome==='verified',evidence_count:x.evidence?.length||0};
 });
 const safety=rows.find(x=>x.dimension==='safety');
 const requiresReview=trial.safety_critical===true;
 const blocked=requiresReview&&!safety.passed;
 const successes=rows.filter(x=>x.passed).length;
 return {schema:'evercraft.findmypart.saban-score.v1',case_id:String(trial.case_id),
  dimensions:rows,verified_count:successes,total:DIMENSIONS.length,
  verification_rate:successes/DIMENSIONS.length,
  release_eligible:false,requires_independent_validation:true,
  safety_hold:blocked,contains_customer_pii:false};
}
