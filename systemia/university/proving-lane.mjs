export const UNIVERSITY_EVIDENCE_STATES = Object.freeze([
  'proposed',
  'attempted',
  'evaluator_reviewed',
  'human_verified',
  'public_approved',
  'superseded'
]);

export const UNIVERSITY_BENCHMARK_DIMENSIONS = Object.freeze([
  'task_success',
  'factual_accuracy',
  'evidence_integrity',
  'uncertainty_handling',
  'role_adherence',
  'safety_policy_adherence',
  'handoff_quality',
  'latency',
  'monetary_cost',
  'reproducibility'
]);

export function buildProvingMission({
  missionKey,
  version,
  title,
  actorClass,
  inputs=[],
  constraints=[],
  prohibitedActions=[],
  scoringDimensions=UNIVERSITY_BENCHMARK_DIMENSIONS
}={}) {
  if (!missionKey) throw new Error('missionKey required');
  if (!version) throw new Error('version required');
  if (!title) throw new Error('title required');
  if (!actorClass) throw new Error('actorClass required');

  return {
    schema:'systemia.university.proving-mission.v1',
    mission_key:String(missionKey),
    version:String(version),
    title:String(title),
    actor_class:String(actorClass),
    inputs:[...inputs],
    constraints:[...constraints],
    prohibited_actions:[...prohibitedActions],
    scoring_dimensions:[...scoringDimensions],
    consequential_actions_authorized:false,
    initial_evidence_state:'proposed'
  };
}

export function buildAttemptReceipt({
  mission,
  actorId,
  provider=null,
  evidenceRefs=[],
  claimedOutcome=null,
  latencyMs=null,
  monetaryCostUsd=null
}={}) {
  if (!mission?.mission_key) throw new Error('valid mission required');
  if (!actorId) throw new Error('actorId required');

  return {
    schema:'systemia.university.attempt-receipt.v1',
    mission_key:mission.mission_key,
    mission_version:mission.version,
    actor_id:String(actorId),
    provider:provider ? String(provider) : null,
    evidence_refs:[...evidenceRefs],
    claimed_outcome:claimedOutcome,
    latency_ms:latencyMs,
    monetary_cost_usd:monetaryCostUsd,
    evidence_state:'attempted',
    verified_competency:false,
    public_approved:false
  };
}

export function assertPublicProofReady(record={}) {
  const errors=[];
  if (record.evidence_state!=='public_approved') errors.push('public proof requires public_approved evidence state');
  if (record.human_verified!==true) errors.push('public proof requires human verification');
  if (!record.mission_key) errors.push('mission_key required');
  if (!record.mission_version) errors.push('mission_version required');
  if (!record.evaluator_version) errors.push('evaluator_version required');
  if (!Array.isArray(record.evidence_refs) || record.evidence_refs.length===0) errors.push('evidence refs required');
  return {ok:errors.length===0,errors};
}
