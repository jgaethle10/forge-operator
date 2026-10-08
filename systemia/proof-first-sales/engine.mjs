import crypto from 'node:crypto';

const MAX_UNANSWERED_DEFAULT=2;
const COOLDOWN_HOURS_DEFAULT=72;

function required(value,name){
  const s=String(value??'').trim();
  if(!s) throw new Error(name+'_required');
  return s;
}

function boundedNumber(value,fallback,{min=0,max=Number.MAX_SAFE_INTEGER}={}){
  const n=Number(value);
  if(!Number.isFinite(n)) return fallback;
  return Math.max(min,Math.min(max,n));
}

export function buildProofUrl({
  base_url,
  business,
  calls=8,
  ticket=450,
}={}){
  const base=new URL(required(base_url,'base_url'));
  if(base.protocol!=='https:') throw new Error('proof_url_https_required');
  base.searchParams.set('business',required(business,'business'));
  base.searchParams.set('calls',String(Math.round(boundedNumber(calls,8,{min:0,max:100000}))));
  base.searchParams.set('ticket',String(Math.round(boundedNumber(ticket,450,{min:0,max:10000000}))));
  return base.toString();
}

export function proofFirstState(input={},now=new Date()){
  const prospectKey=required(input.prospect_key,'prospect_key');
  const business=required(input.business,'business');
  const evidenceState=String(input.pain_evidence_state||'unknown');
  const proofState=String(input.proof_state||'missing');
  const optedOut=input.opted_out===true;
  const unanswered=Math.max(0,Math.floor(boundedNumber(input.unanswered_outbound,0,{min:0,max:1000})));
  const maxUnanswered=Math.max(1,Math.floor(boundedNumber(input.max_unanswered_outbound,MAX_UNANSWERED_DEFAULT,{min:1,max:10})));
  const cooldownHours=boundedNumber(input.cooldown_hours,COOLDOWN_HOURS_DEFAULT,{min:0,max:24*30});
  const lastOutbound=input.last_outbound_at?new Date(input.last_outbound_at):null;
  const nowMs=now instanceof Date?now.getTime():new Date(now).getTime();
  const cooldownUntil=lastOutbound&&Number.isFinite(lastOutbound.getTime())
    ? new Date(lastOutbound.getTime()+cooldownHours*60*60*1000)
    : null;
  const cooldownActive=Boolean(cooldownUntil&&Number.isFinite(nowMs)&&nowMs<cooldownUntil.getTime());

  let state='outreach_ready';
  let reason='proof_verified_relationship_clear';

  if(optedOut){
    state='blocked';
    reason='channel_opted_out';
  }else if(!['observed','source_grounded','owner_confirmed'].includes(evidenceState)){
    state='research_required';
    reason='pain_not_grounded';
  }else if(proofState!=='public_https_verified'){
    state='proof_required';
    reason='proof_not_publicly_verified';
  }else if(unanswered>=maxUnanswered){
    state='waiting_reply';
    reason='unanswered_outbound_limit_reached';
  }else if(cooldownActive){
    state='cooldown';
    reason='outbound_cooldown_active';
  }else if(input.human_approval_state!=='explicit' || !String(input.human_approval_ref||'').trim()){
    state='awaiting_human_approval';
    reason='explicit_human_approval_required';
  }

  return {
    schema:'evercraft.proof-first-sales.state.v1',
    prospect_key:prospectKey,
    business,
    state,
    reason,
    pain_evidence_state:evidenceState,
    proof_state:proofState,
    unanswered_outbound:unanswered,
    max_unanswered_outbound:maxUnanswered,
    cooldown_hours:cooldownHours,
    cooldown_until:cooldownUntil?.toISOString()||null,
    requires_interaction_ledger_preflight:true,
    requires_explicit_human_approval:true,
    human_approval_ref:input.human_approval_state==='explicit' ? String(input.human_approval_ref||'').trim()||null : null,
    auto_send_authority:false,
  };
}

export function draftProofFirstMessage({
  business,
  proof_url,
  observed_problem,
  sender='Jesse\nEvercraft',
}={}){
  const name=required(business,'business');
  const url=new URL(required(proof_url,'proof_url'));
  if(url.protocol!=='https:') throw new Error('proof_url_https_required');
  const problem=required(observed_problem,'observed_problem');
  const body=[
    name+' team,',
    '',
    problem,
    '',
    'Rather than ask you to imagine what I mean, I built the proof first:',
    url.toString(),
    '',
    'Run it once and replace the example numbers with your own. The revenue figure is arithmetic from the assumptions entered, not a forecast.',
    '',
    'If this is not a real leak for '+name+', ignore me. If it is close, reply with how the inquiry reaches your team today and I’ll map the next version to the workflow you already use.',
    '',
    sender,
  ].join('\n');
  return {
    schema:'evercraft.proof-first-sales.message-draft.v1',
    business:name,
    proof_url:url.toString(),
    body,
    body_sha256:'sha256:'+crypto.createHash('sha256').update(body).digest('hex'),
    send_authority:false,
    interaction_ledger_preflight_required:true,
  };
}

export function admitProofFirstOutreach(input={},now=new Date()){
  const state=proofFirstState(input,now);
  return {
    ...state,
    admitted:state.state==='outreach_ready',
    next_action:state.state==='outreach_ready'
      ? 'prepare_exact_message_permit'
      : state.state==='awaiting_human_approval'
        ? 'present_exact_message_for_human_approval_do_not_send'
      : state.state==='waiting_reply'
        ? 'wait_for_inbound_or_material_new_signal'
        : state.state==='cooldown'
          ? 'hold_until_cooldown_expires_or_inbound_arrives'
          : state.state==='proof_required'
            ? 'build_and_external-canary-proof_before_contact'
            : state.state==='research_required'
              ? 'ground_pain_hypothesis_before_building_or_contacting'
              : 'do_not_contact',
  };
}
