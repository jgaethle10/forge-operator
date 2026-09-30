const SAFE = new Set(['github_workflow_failed','public_door_http_failure','public_door_unreachable']);
export function planRepairUnit(findings=[], {maxAttempts=3}={}) {
  return findings.map(f => ({
    finding_key:f.finding_key, code:f.code, subject:f.subject,
    authority: f.human_gate_required ? 'human_gate' : (SAFE.has(f.code)||f.repair_recipe?.recipe_id ? 'bounded_autonomous' : 'diagnose_only'),
    recipe_id:f.repair_recipe?.recipe_id||null,
    attempt_budget:maxAttempts,
    verify_required:true, rollback_required:true,
    escalation:['diagnose','retry','alternate_recipe','quarantine','human_gate'],
    close_rule:'production evidence must prove recovery; attempted repair is never success'
  }));
}
export function repairPressure(item, prior={}) {
  const attempts=Number(prior.attempts||0);
  if(item.authority!=='bounded_autonomous') return {...item,next:'escalate'};
  if(attempts < item.attempt_budget) return {...item,next:'repair',attempt:attempts+1};
  return {...item,next:'quarantine_and_escalate',attempt:attempts};
}
