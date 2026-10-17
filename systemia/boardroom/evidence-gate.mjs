// Evercraft Boardroom evidence gate.
// This is read-only verification of received records, not a board runner.
// Do not confuse a queued transport event with real advisor reasoning.
const validActions=new Set(['ask_all','critique_round','vote','final_synthesis','decision_mode']);
const completeStatus='completed';

function text(value,max=200){
  return typeof value==='string'?value.trim().slice(0,max):'';
}
function isError(content){
  return !text(content,12000)||/^\[Error:/i.test(text(content,12000));
}
function result(request,state,reason,details={}){
  return Object.freeze({
    schema:'evercraft.boardroom.evidence.v1',
    request_id:text(request?.id),
    session_id:text(request?.session_id),
    state,
    reason,
    record_evidence_consistent:false,
    provider_execution_verified:false,
    external_action_authorized:false,
    founder_approval_required:true,
    ...details,
  });
}
function matchingAdvisors({request,messages,messageType}){
  const roles=new Map();
  for(const m of messages){
    if(m?.session_id!==request.session_id||
       m?.round_id!==request.round_id||
       m?.role!=='ai'||
       m?.message_type!==messageType||
       m?.seat_role_key==='synthesis_chair'||
       !text(m.model_used)||
       isError(m.content)) continue;
    const key=text(m.seat_id)||text(m.seat_role_key);
    if(key&&!roles.has(key)) roles.set(key,m);
  }
  return [...roles.values()];
}
function gateVerified(request,details){
  return result(request,'records_correlated','record_consistency_passed',{
    ...details,
    record_evidence_consistent:true,
    // A model label and seat message are NOT a signed provider execution receipt.
    provider_execution_verified:false,
    // Boardroom recommendations must NEVER imply authority to execute.
    external_action_authorized:false,
    founder_approval_required:true,
  });
}
export function evaluateBoardroomEvidence({request,messages=[],decisions=[],minAdvisors=3,requireContrarian=true}={}){
  if(!request||!text(request.id)||!text(request.session_id))
    return result(request,'unverified','missing_request_identity');
  if(!validActions.has(request.action))
    return result(request,'unverified','unsupported_action');
  if(['queued','running'].includes(request.status))
    return result(request,'pending',request.status);
  if(['held','failed'].includes(request.status))
    return result(request,'blocked',request.status);
  if(request.status==='partial')
    return result(request,'incomplete','partial_provider_response');
  if(request.status!==completeStatus)
    return result(request,'unverified','unrecognized_status');
  if(!text(request.round_id))
    return result(request,'unverified','missing_round_id');
  if(!Array.isArray(messages)||!Array.isArray(decisions))
    return result(request,'unverified','invalid_evidence_collection');

  // A quorum of model-backed, distinct advisor seats must exist in the
  // SAME session and round. A list of generated errors is not evidence.
  const required=Math.max(3,Math.min(20,Number.isFinite(minAdvisors)?Math.trunc(minAdvisors):3));
  const messageType=request.action==='decision_mode'?'decision'
    :request.action==='vote'?'vote'
    :request.action==='ask_all'?'ask_all'
    :request.action==='critique_round'?'critique'
    :null;
  if(!messageType){
    // Final synthesis alone cannot prove the lineage of earlier rounds.
    return result(request,'unverified','synthesis_lineage_not_proven');
  }
  const advisors=matchingAdvisors({request,messages,messageType});
  const distinctModels=new Set(advisors.map(m=>m.model_used)).size;
  const evidence={advisors_verified:advisors.length,models_observed:distinctModels,required_advisors:required};
  if(advisors.length<required)
    return result(request,'unverified','advisor_quorum_not_met',evidence);
  if(request.action==='decision_mode'&&requireContrarian&&!advisors.some(m=>m.seat_role_key==='contrarian'))
    return result(request,'unverified','missing_contrarian_evidence',evidence);
  if(request.action!=='decision_mode')
    return gateVerified(request,evidence);

  const chair=messages.find(m=>
    m?.session_id===request.session_id&&
    m?.round_id===request.round_id&&
    m?.message_type==='synthesis'&&
    m?.role==='ai'&&m?.seat_role_key==='synthesis_chair'&&
    text(m.model_used)&&!isError(m.content)
  );
  if(!chair) return result(request,'unverified','synthesis_message_missing',evidence);
  const decision=decisions.find(d=>
    d?.id===request.decision_id&&
    d?.session_id===request.session_id&&
    d?.status==='pending_approval'&&
    text(d.full_synthesis)&&
    text(d.required_approval)
  );
  if(!decision)
    return result(request,'unverified','pending_approval_decision_missing',evidence);
  return gateVerified(request,{
    ...evidence,
    synthesis_observed:true,
    decision_id:text(decision.id),
    decision_status:'pending_approval',
  });
}
