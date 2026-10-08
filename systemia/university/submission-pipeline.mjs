import crypto from 'node:crypto';

const ALLOWED_STATES=Object.freeze([
  'submitted',
  'schema_validated',
  'evaluator_reviewed',
  'human_verified',
  'public_approved',
  'rejected',
  'superseded'
]);

function sha256(value){
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value==='object'){
    return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
  }
  return value;
}

export function fingerprintAttempt(attempt={}){
  return sha256(JSON.stringify(stable(attempt)));
}

export function ingestBenchmarkSubmission({
  attempt,
  mission,
  evaluation=null,
  receivedAt=null
}={}){
  if(!attempt?.attempt_id) throw new Error('attempt_id required');
  if(!mission?.mission_key) throw new Error('mission required');
  if(attempt.mission_key!==mission.mission_key) throw new Error('mission_key mismatch');
  if(attempt.mission_version!==mission.version) throw new Error('mission_version mismatch');

  return {
    schema:'systemia.university.submission-receipt.v1',
    submission_id:'sub_'+fingerprintAttempt(attempt).slice(0,24),
    attempt_id:String(attempt.attempt_id),
    mission_key:String(mission.mission_key),
    mission_version:String(mission.version),
    actor_id:String(attempt.actor_id||'unknown'),
    provider_claim:attempt.provider?String(attempt.provider):null,
    provider_identity_state:'self_declared_unverified',
    attempt_fingerprint:fingerprintAttempt(attempt),
    received_at:receivedAt,
    evidence_state:evaluation?'evaluator_reviewed':'submitted',
    evaluation:evaluation||null,
    human_verified:false,
    public_approved:false,
    public_rank_eligible:false,
    state_history:[
      {state:'submitted',at:receivedAt},
      ...(evaluation?[{state:'evaluator_reviewed',at:receivedAt}]:[])
    ]
  };
}

export function advanceSubmissionState(receipt={},nextState,{humanReviewer=null,publicApproval=null,at=null}={}){
  if(!ALLOWED_STATES.includes(nextState)) throw new Error('invalid submission state');
  const current=receipt.evidence_state||'submitted';
  const transitions={
    submitted:['schema_validated','evaluator_reviewed','rejected'],
    schema_validated:['evaluator_reviewed','rejected'],
    evaluator_reviewed:['human_verified','rejected'],
    human_verified:['public_approved','rejected'],
    public_approved:['superseded'],
    rejected:['superseded'],
    superseded:[]
  };
  if(!(transitions[current]||[]).includes(nextState)) throw new Error(`invalid transition ${current} -> ${nextState}`);

  if(nextState==='human_verified' && !humanReviewer) throw new Error('human reviewer required');
  if(nextState==='public_approved' && !publicApproval) throw new Error('public approval receipt required');

  const next={
    ...receipt,
    evidence_state:nextState,
    state_history:[...(receipt.state_history||[]),{state:nextState,at}]
  };

  if(nextState==='human_verified'){
    next.human_verified=true;
    next.human_reviewer=String(humanReviewer);
  }
  if(nextState==='public_approved'){
    if(receipt.human_verified!==true) throw new Error('human verification required before public approval');
    next.public_approved=true;
    next.public_approval_receipt=String(publicApproval);
    next.public_rank_eligible=Boolean(receipt.evaluation?.passed);
  }
  if(nextState==='rejected'){
    next.public_rank_eligible=false;
  }
  return next;
}

export function buildPublicLeaderboard(submissions=[]){
  const eligible=submissions.filter(x=>
    x?.evidence_state==='public_approved' &&
    x?.human_verified===true &&
    x?.public_approved===true &&
    x?.public_rank_eligible===true &&
    x?.evaluation?.scores
  );

  return eligible.map(x=>({
    submission_id:x.submission_id,
    mission_key:x.mission_key,
    mission_version:x.mission_version,
    provider:x.provider_claim,
    provider_identity_state:x.provider_identity_state,
    scores:{...x.evaluation.scores},
    latency_ms:x.evaluation.metrics?.latency_ms??null,
    monetary_cost_usd:x.evaluation.metrics?.monetary_cost_usd??null,
    evaluator_version:x.evaluation.evaluator_version,
    public_approval_receipt:x.public_approval_receipt
  })).sort((a,b)=>
    b.scores.task_success-a.scores.task_success ||
    (a.monetary_cost_usd??Number.POSITIVE_INFINITY)-(b.monetary_cost_usd??Number.POSITIVE_INFINITY) ||
    (a.latency_ms??Number.POSITIVE_INFINITY)-(b.latency_ms??Number.POSITIVE_INFINITY)
  );
}
