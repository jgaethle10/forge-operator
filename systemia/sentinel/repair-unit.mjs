import { fingerprintFinding, selectRepairStrategies } from './repair-strategy.mjs';
const SAFE = new Set(['github_workflow_failed','public_door_http_failure','public_door_unreachable']);
const TERMINAL = new Set(['verified_green','quarantined','human_gate']);

function iso(now) { return (now instanceof Date ? now : new Date(now || Date.now())).toISOString(); }

export function planRepairUnit(findings=[], {maxAttempts=3, recipeRegistry={recipes:[]}, treatmentMemory=[]}={}) {
  return findings.map(f => {
    const fingerprint=fingerprintFinding(f);
    const strategies=selectRepairStrategies(f,recipeRegistry,treatmentMemory);
    return ({
    finding_key:f.finding_key, code:f.code, subject:f.subject,
    fingerprint,
    strategies:strategies.slice(0,5),
    selected_strategy:strategies[0]||null,
    severity:f.severity||'medium',
    authority:f.human_gate_required ? 'human_gate' : (SAFE.has(f.code)||f.repair_recipe?.recipe_id ? 'bounded_autonomous' : 'diagnose_only'),
    recipe_id:f.repair_recipe?.recipe_id||null,
    attempt_budget:maxAttempts,
    verify_required:true, rollback_required:true,
    escalation:['diagnose','retry','alternate_recipe','quarantine','human_gate'],
    close_rule:'production evidence must prove recovery; attempted repair is never success'
  });});
}

export function repairPressure(item, prior={}, now=new Date()) {
  const attempts=Number(prior.attempts||0);
  if(item.authority==='human_gate') return {...item,state:'human_gate',next:'escalate'};
  if(item.authority!=='bounded_autonomous') return {...item,state:'diagnosing',next:'diagnose'};
  if(prior.quarantined) return {...item,state:'quarantined',next:'verify_or_hold'};
  if(attempts >= item.attempt_budget) return {...item,state:'quarantined',next:'quarantine_and_escalate',attempt:attempts,quarantined:true};
  const delayMinutes=Math.min(60, Math.max(0, 2 ** attempts - 1));
  const last=prior.last_attempt_at ? new Date(prior.last_attempt_at).getTime() : 0;
  const eligibleAt=last + delayMinutes*60000;
  if(last && new Date(now).getTime() < eligibleAt) return {...item,state:'cooldown',next:'wait',attempt:attempts,next_eligible_at:new Date(eligibleAt).toISOString()};
  return {...item,state:'repairing',next:'repair',attempt:attempts+1};
}

export function buildRepairUnitState(findings=[], previous={}, options={}) {
  const now=options.now||new Date();
  const priorByKey=new Map((previous.items||[]).map(x=>[x.finding_key,x]));
  const planned=planRepairUnit(findings,options);
  const activeKeys=new Set(planned.map(x=>x.finding_key));
  const items=planned.map(item=>{
    const prior=priorByKey.get(item.finding_key)||{};
    const pressure=repairPressure(item,prior,now);
    const attempted=pressure.next==='repair';
    return {...pressure,
      attempts: attempted ? Number(prior.attempts||0)+1 : Number(prior.attempts||0),
      first_seen:prior.first_seen||iso(now), last_seen:iso(now),
      last_attempt_at:attempted ? iso(now) : (prior.last_attempt_at||null),
      history:[...(prior.history||[]).slice(-9),{at:iso(now),state:pressure.state,next:pressure.next}]
    };
  });
  const resolved=(previous.items||[]).filter(x=>!activeKeys.has(x.finding_key)&&!TERMINAL.has(x.state)).map(x=>({...x,state:'verified_green',next:'close',resolved_at:iso(now)}));
  return {schema:'evercraft.systemia.repair-unit.state.v2',observed_at:iso(now),items,
    recently_resolved:resolved.slice(-50),
    summary:{active:items.length,repairing:items.filter(x=>x.state==='repairing').length,
      cooldown:items.filter(x=>x.state==='cooldown').length,
      diagnosing:items.filter(x=>x.state==='diagnosing').length,
      quarantined:items.filter(x=>x.state==='quarantined').length,
      gated:items.filter(x=>x.state==='human_gate').length,
      verified_green:resolved.length}};
}

export function executableRepairItems(state={}) {
  return (state.items||[]).filter(x=>x.next==='repair'&&x.authority==='bounded_autonomous');
}
