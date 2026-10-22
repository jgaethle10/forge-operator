import {evaluateExternalAction,fingerprintExternalAction} from '../operator-gates/external-action.mjs';
import {preflightRelationshipIntent,readPrivateRelationships} from './relationship-policy.mjs';

const CHANNEL={send_email:'email',send_sms:'sms',send_dm:'dm',place_phone_call:'phone'};
const value=(v)=>typeof v==='string'?v.trim():'';
function denied(reasons,step='crm_context') {
  return {schema:'evercraft.crm.outreach-gate.v1',decision:'deny',reasons:[...new Set(reasons)],
    checked_stage:step,send_performed:false,permit_minted:false,mutation_authorized:false};
}
function context({relationshipLedgerFile='',now}) {
  if(!relationshipLedgerFile)throw Error('relationship_source_unconfigured');
  return readPrivateRelationships(relationshipLedgerFile,{now});
}
/**
 * A draft/read-only planning check. Untrusted client flags cannot declare CRM approval:
 * the relationship is reread from the owner's protected private file at this boundary.
 * No send/permit/transaction is performed by this function.
 */
export function evaluateGovernedOutreach({
  action={},relationshipLedgerFile='',interactionLedger=null,approvalVerifier=null,now=new Date()
}={}) {
  const channel=CHANNEL[action?.action_type];
  if(!channel)return denied(['unsupported_outreach_channel'],'request');
  if(!value(action.target_ref)||action.target_ref!==action.subject_ref)
    return denied(['subject_target_mismatch'],'request');
  if(!value(action.division_id)||!value(action.purpose)||!value(action.actor_ref))
    return denied(['relationship_context_incomplete'],'request');
  if(!value(action.exact_content))
    return denied(['exact_message_required'],'request');

  const approval=evaluateExternalAction(action);
  if(approval.decision!=='allow')return denied(['explicit_action_approval_missing_or_changed'],'human_approval');
  // The requestor cannot establish approval by setting human_approval_state.
  // Resolve an independently stored, current approval from trusted private state.
  if(typeof approvalVerifier!=='function')return denied(['trusted_approval_source_unavailable'],'human_approval');
  let trusted;
  try{
    trusted=approvalVerifier({
      approval_ref:action.human_approval_ref,
      action_type:action.action_type,
      action_fingerprint:approval.exact_action_fingerprint,
      target_ref:action.target_ref,
      now
    });
  }catch{return denied(['trusted_approval_check_failed'],'human_approval');}
  if(trusted?.then||trusted?.approved!==true||
     trusted.approval_ref!==action.human_approval_ref||
     trusted.action_fingerprint!==approval.exact_action_fingerprint||
     !Number.isFinite(Date.parse(String(trusted.expires_at||'')))||
     Date.parse(trusted.expires_at)<=now.getTime()) {
    return denied(['trusted_approval_not_current'],'human_approval');
  }

  let policy;
  try {
    policy=preflightRelationshipIntent({
      ledger:context({relationshipLedgerFile,now}),
      subjectRef:action.subject_ref,divisionId:action.division_id,
      purpose:action.purpose,at:now
    });
  } catch { return denied(['relationship_source_missing_or_invalid']); }
  if(policy.decision!=='allow_to_existing_preflight')
    return denied(policy.reasons||['relationship_not_eligible']);

  if(!interactionLedger||typeof interactionLedger.preflightContact!=='function')
    return denied(['interaction_ledger_unavailable'],'passport_and_history');

  let preflight;
  try {
    preflight=interactionLedger.preflightContact({
      subject_ref:action.subject_ref,channel,actor_ref:action.actor_ref,
      passport_product:action.passport_product,
      content_fingerprint:fingerprintExternalAction(action),
      at:now.toISOString()
    });
  } catch { return denied(['interaction_preflight_failed'],'passport_and_history'); }
  if(preflight?.decision!=='allow')return denied(
    ['passport_or_interaction_policy_denied'],'passport_and_history'
  );
  return {schema:'evercraft.crm.outreach-gate.v1',
    decision:'eligible_for_permit_only',reasons:[],checked_stage:'all',
    approved_action_fingerprint:approval.exact_action_fingerprint,
    relationship_kind:policy.relationship_kind,
    relationship_state:policy.relationship_state,
    send_performed:false,permit_minted:false,mutation_authorized:false};
}

/** Produces an existing Passport permit only after repeating all freshness checks. No mail transport. */
export function prepareGovernedContactPermit({
  action={},relationshipLedgerFile='',interactionLedger=null,approvalVerifier=null,now=new Date()
}={}) {
  const decision=evaluateGovernedOutreach({
    action,relationshipLedgerFile,interactionLedger,approvalVerifier,now
  });
  if(decision.decision!=='eligible_for_permit_only')
    return {...decision,permit:null};
  if(typeof interactionLedger?.prepareContactPermit!=='function')
    return {...denied(['interaction_permit_service_unavailable'],'permit'),permit:null};
  if(!value(action.permit_idempotency_key))
    return {...denied(['permit_idempotency_required'],'permit'),permit:null};
  // Mint from the actual existing Passport/Interaction Ledger owner. No duplicate
  // contact authority and no provider call are created by the CRM.
  let result;
  try{
    result=interactionLedger.prepareContactPermit({
      subject_ref:action.subject_ref,channel:CHANNEL[action.action_type],
      actor_ref:action.actor_ref,passport_product:action.passport_product,
      content_fingerprint:fingerprintExternalAction(action),
      permit_idempotency_key:action.permit_idempotency_key,
      at:now.toISOString()
    });
  }catch{
    return {...denied(['permit_service_failed'],'permit'),permit:null};
  }
  if(result?.state!=='permit_minted'&&result?.state!=='permit_duplicate')
    return {...denied(['permit_refused'],'permit'),permit:null};
  return {
    schema:'evercraft.crm.outreach-gate.v1',decision:'permit_ready',
    permit:result.permit,permit_receipt:result.permit_receipt,
    checked_stage:'permit',send_performed:false,
    mutation_authorized:false
  };
}
