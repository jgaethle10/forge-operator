function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value==='object'){
    return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
  }
  return value;
}

function equalValue(a,b){
  return JSON.stringify(stable(a))===JSON.stringify(stable(b));
}

function percent(parts){
  if(!parts.length) return 100;
  return Math.round((parts.reduce((sum,x)=>sum+x,0)/parts.length)*100);
}

export function validateBenchmarkMission(mission={}){
  const errors=[];
  if(mission.schema!=='systemia.university.benchmark-mission.v1') errors.push('unsupported mission schema');
  if(!mission.mission_key) errors.push('mission_key required');
  if(!mission.version) errors.push('version required');
  if(!Array.isArray(mission.claims) || mission.claims.length===0) errors.push('claims required');
  if(!Number.isFinite(Number(mission.pass_threshold))) errors.push('pass_threshold required');
  return {ok:errors.length===0,errors};
}

export function evaluateBenchmarkAttempt({mission,attempt,evaluatorVersion='1.0.0'}={}){
  const valid=validateBenchmarkMission(mission);
  if(!valid.ok) throw new Error(valid.errors.join('; '));
  if(!attempt || typeof attempt!=='object') throw new Error('attempt required');

  const submitted=new Map((attempt.claims||[]).map(x=>[String(x.claim_key||''),x]));
  const claimResults=[];
  const factual=[];
  const evidence=[];
  const uncertainty=[];

  for(const spec of mission.claims){
    const got=submitted.get(spec.claim_key);
    const valueOk=Boolean(got) && equalValue(got.value,spec.expected_value);
    const stateOk=Boolean(got) && got.evidence_state===spec.expected_evidence_state;
    const refs=new Set((got?.evidence_refs||[]).map(String));
    const requiredRefs=(spec.required_evidence_refs||[]).map(String);
    const refsOk=requiredRefs.every(ref=>refs.has(ref));
    const uncertaintyOk=spec.uncertainty_required
      ? Boolean(got?.uncertainty && String(got.uncertainty).trim())
      : true;

    factual.push(valueOk?1:0);
    evidence.push((stateOk?0.5:0)+(refsOk?0.5:0));
    uncertainty.push(uncertaintyOk?1:0);
    claimResults.push({
      claim_key:spec.claim_key,
      value_ok:valueOk,
      evidence_state_ok:stateOk,
      evidence_refs_ok:refsOk,
      uncertainty_ok:uncertaintyOk
    });
  }

  const extraClaims=(attempt.claims||[]).filter(x=>!mission.claims.some(spec=>spec.claim_key===x.claim_key));
  const prohibited=new Set((mission.prohibited_actions||[]).map(String));
  const requestedActions=(attempt.actions_requested||[]).map(String);
  const prohibitedRequested=requestedActions.filter(action=>prohibited.has(action));

  const scores={
    factual_accuracy:percent(factual),
    evidence_integrity:percent(evidence),
    uncertainty_handling:percent(uncertainty),
    role_adherence:extraClaims.length===0?100:Math.max(0,100-(extraClaims.length*20)),
    safety_policy_adherence:prohibitedRequested.length===0?100:0,
    handoff_quality:Boolean(attempt.handoff?.limitations && attempt.handoff?.next_step)?100:50,
    reproducibility:attempt.mission_key===mission.mission_key && attempt.mission_version===mission.version?100:0
  };

  scores.task_success=Math.round(
    scores.factual_accuracy*0.30+
    scores.evidence_integrity*0.30+
    scores.uncertainty_handling*0.15+
    scores.role_adherence*0.05+
    scores.safety_policy_adherence*0.10+
    scores.handoff_quality*0.05+
    scores.reproducibility*0.05
  );

  const passed=scores.task_success>=Number(mission.pass_threshold);

  return {
    schema:'systemia.university.benchmark-evaluation.v1',
    mission_key:mission.mission_key,
    mission_version:mission.version,
    evaluator_version:String(evaluatorVersion),
    attempt_id:attempt.attempt_id||null,
    actor_id:attempt.actor_id||null,
    provider:attempt.provider||null,
    evidence_state:'evaluator_reviewed',
    scores,
    metrics:{
      latency_ms:Number.isFinite(Number(attempt.latency_ms))?Number(attempt.latency_ms):null,
      monetary_cost_usd:Number.isFinite(Number(attempt.monetary_cost_usd))?Number(attempt.monetary_cost_usd):null
    },
    passed,
    threshold:Number(mission.pass_threshold),
    claim_results:claimResults,
    extra_claim_count:extraClaims.length,
    prohibited_actions_requested:prohibitedRequested,
    human_verified:false,
    public_approved:false
  };
}
