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

export function buildRepairUnitState(findings=[], previous={}, options={}) {
  const priorByKey=new Map((previous.items||[]).map(x=>[x.finding_key,x]));
  const items=planRepairUnit(findings,options).map(item=>{
    const prior=priorByKey.get(item.finding_key)||{};
    const pressure=repairPressure(item,prior);
    return {...pressure, attempts: pressure.next==='repair' ? Number(prior.attempts||0)+1 : Number(prior.attempts||0),
      first_seen:prior.first_seen||new Date().toISOString(), last_seen:new Date().toISOString()};
  });
  return {schema:'evercraft.systemia.repair-unit.state.v1',items,
    summary:{active:items.length,repairing:items.filter(x=>x.next==='repair').length,
      quarantined:items.filter(x=>x.next==='quarantine_and_escalate').length,
      gated:items.filter(x=>x.authority==='human_gate').length}};
}
