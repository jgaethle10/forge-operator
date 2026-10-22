import crypto from 'node:crypto';

const EXTERNAL_ACTIONS=new Set([
  'send_email',
  'send_sms',
  'send_dm',
  'place_phone_call',
  'submit_contact_form',
  'schedule_physical_meeting',
  'schedule_virtual_meeting',
  'accept_invitation',
  'publish_external_post',
]);

const PHYSICAL_ACTIONS=new Set(['schedule_physical_meeting']);

function required(value,name){
  const text=String(value??'').trim();
  if(!text) throw new Error(name+'_required');
  return text;
}

function sha256(value){
  return 'sha256:'+crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function fingerprintExternalAction(input={}){
  const action_type=required(input.action_type,'action_type');
  const payload={
    action_type,
    target_ref:String(input.target_ref||'').trim()||null,
    exact_content:String(input.exact_content||'').trim()||null,
    starts_at:String(input.starts_at||'').trim()||null,
    location_ref:String(input.location_ref||'').trim()||null,
  };
  // Bind CRM-specific authority to the exact approved request without
  // changing legacy fingerprints for requests that carry none of these fields.
  for(const key of ['subject_ref','division_id','purpose','actor_ref','passport_product']){
    if(Object.hasOwn(input,key))payload[key]=String(input[key]??'').trim()||null;
  }
  return sha256(JSON.stringify(payload));
}

export function evaluateExternalAction(input={}){
  const actionType=required(input.action_type,'action_type');
  const external=EXTERNAL_ACTIONS.has(actionType);
  if(!external){
    return {
      schema:'evercraft.external-action-gate.v1',
      action_type:actionType,
      decision:'allow',
      reason:'non_external_action',
      human_gate_required:false,
      mutation_performed:false,
    };
  }

  const exactFingerprint=fingerprintExternalAction(input);
  const approvalState=String(input.human_approval_state||'').trim();
  const approvalRef=String(input.human_approval_ref||'').trim();
  const approvedFingerprint=String(input.approved_action_fingerprint||'').trim();

  const reasons=[];
  if(approvalState!=='explicit') reasons.push('explicit_human_approval_required');
  if(!approvalRef) reasons.push('human_approval_ref_required');
  if(!approvedFingerprint) reasons.push('approved_action_fingerprint_required');
  if(approvedFingerprint && approvedFingerprint!==exactFingerprint){
    reasons.push('approved_action_changed');
  }

  if(PHYSICAL_ACTIONS.has(actionType)){
    if(!String(input.starts_at||'').trim()) reasons.push('exact_start_time_required');
    if(!String(input.location_ref||'').trim()) reasons.push('exact_location_required');
  }

  return {
    schema:'evercraft.external-action-gate.v1',
    action_type:actionType,
    decision:reasons.length?'deny':'allow',
    reasons,
    human_gate_required:true,
    human_approval_ref:approvalRef||null,
    exact_action_fingerprint:exactFingerprint,
    approved_action_fingerprint:approvedFingerprint||null,
    approval_bound_to_exact_action:true,
    mutation_performed:false,
  };
}
