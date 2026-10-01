const AUTONOMOUS=new Set(['autonomous']);
const ACTIONS=new Set(['github_rerun_failed_jobs']);
export function authorizeRepair(item={}){
 const s=item.selected_strategy;
 if(!s)return {ok:false,reason:'no_selected_strategy'};
 if(!AUTONOMOUS.has(s.authority))return {ok:false,reason:'strategy_not_autonomous'};
 if(!ACTIONS.has(s.action?.type))return {ok:false,reason:'action_not_allowlisted'};
 if(item.authority!=='bounded_autonomous')return {ok:false,reason:'incident_not_autonomous'};
 return {ok:true,action:s.action.type,recipe_id:s.recipe_id};
}
export function buildExecutionPlan(state={}){
 return (state.items||[]).filter(x=>x.next==='repair').map(item=>({finding_key:item.finding_key,fingerprint_key:item.fingerprint?.key||null,...authorizeRepair(item),verification:item.selected_strategy?.verification||[],rollback:item.selected_strategy?.rollback||null}));
}
export function executionReceipt(plan={},result={}){
 const verified=result.verified===true;
 return {schema:'evercraft.systemia.repair-execution-receipt.v1',finding_key:plan.finding_key,fingerprint_key:plan.fingerprint_key,recipe_id:plan.recipe_id||null,action:plan.action||null,executed:result.executed===true,verified,outcome:verified?'verified_green':(result.executed?'failed':'blocked'),evidence_refs:result.evidence_refs||[],at:result.at||new Date().toISOString()};
}
