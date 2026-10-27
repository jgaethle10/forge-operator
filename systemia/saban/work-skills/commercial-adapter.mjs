import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const txt = (v, n=300) => typeof v === 'string' ? v.trim().slice(0,n) : '';
const arr = v => Array.isArray(v) ? v.slice(0,40) : [];
const roles = ['research','creative','production','review'];
const receipt = (role, output, findings=[]) => ({
  schema:'evercraft.work-saban.commercial-role-result.v1', role,
  status:findings.length?'completed_with_holds':'completed', output, findings,
  local_draft_created:true, agent_model_invoked:false, video_or_audio_rendered:false,
  publication_performed:false, external_effects_performed:false, content_hash:hash(output)
});
const assetsOf = b => arr(b.approved_assets).map((a,i) => {
  const rights=txt(a?.rights_status,40), license=txt(a?.license_ref,200);
  const reused=a?.used_in_prior_commercial===true;
  return {id:txt(a?.id,100)||'asset-'+(i+1),rights_status:rights||'unverified',
    license_ref:license||null,used_in_prior_commercial:reused,
    eligible_for_use:rights==='cleared'&&Boolean(license)&&!reused,
    rights_independently_verified:false};
});
export async function runAssignment({assignment,contract}) {
  const role=String(assignment?.role||'');
  if(!roles.includes(role)||!contract?.roles?.includes(role)||
     contract?.software_id!=='work-saban-commercial-brief'||
     contract?.side_effects?.default!=='deny') throw Error('work_saban_unregistered_or_unsafe_role');
  const data=assignment?.item?.raw, b=data?.brief;
  if(!b||typeof b!=='object'||Array.isArray(b)) throw Error('work_saban_invalid_brief_payload');
  const business=txt(b.business_name,160),audience=txt(b.audience,200),cta=txt(b.call_to_action,200);
  const duration=Number(b.duration_seconds??30);
  if(!Number.isFinite(duration)||duration<5||duration>180) throw Error('work_saban_duration_out_of_range');
  const assets=assetsOf(b), claims=arr(b.claims).map((c,i)=>({
    id:'claim-'+(i+1),text:txt(c?.text,350),evidence_ref:txt(c?.evidence_ref,200)||null,
    provenance:'user_supplied_unverified',independently_verified:false
  })).filter(c=>c.text);
  if(role==='research'){
    const findings=[...(!business?['business_name_missing']:[]),...(!audience?['audience_missing']:[]),
      ...(!cta?['call_to_action_missing']:[]),
      ...(claims.some(c=>!c.evidence_ref)?['claim_evidence_missing']:[]),
      ...(assets.some(a=>!a.eligible_for_use)?['asset_rights_not_cleared']:[]),
      ...(!assets.length?['original_asset_plan_required']:[])];
    return receipt(role,{business_name:business||null,audience:audience||null,call_to_action:cta||null,
      claims,assets,source_policy:'user_supplied_is_not_independently_verified'},findings);
  }
  if(role==='creative') return receipt(role,{
    title:(business?business+': ':'')+'Commercial Draft',duration_seconds:duration,
    narrative_style:'human_voice_led',script_status:'outline_only_unapproved',
    generated_voice:false,final_script_claimed:false,
    storyboard:[
      {beat:'opening',time_fraction:'0-0.2',narration:'A fresh start begins with the spaces around us.',visual:'Propose newly produced original footage.'},
      {beat:'service',time_fraction:'0.2-0.65',narration:'Introduce only services confirmed in the approved business brief.',visual:'Original service footage or graphics after rights approval.'},
      {beat:'trust',time_fraction:'0.65-0.85',narration:'Add substantiated proof only after evidence review.',visual:'No fabricated testimonials.'},
      {beat:'close',time_fraction:'0.85-1',narration:cta?'Call to action: '+cta:'Insert an approved call to action.',visual:'Mobile-safe brand lockup and captions.'}
    ]},!cta?['call_to_action_missing']:[]);
  if(role==='production') return receipt(role,{
    shoot_plan:['Original opening environment','Original service process footage','Brand-authenticated close and call to action'],
    formats:['9:16 mobile vertical','16:9 landscape'],
    audio:{voice:'Expressive human-paced narration pending clearance',music:'Original or licensed track required',generated:false},
    asset_usage:'Do not reuse prior footage without express authorization',
    delivery_state:'shot_list_only_no_media_created'
  },['source_footage_and_audio_production_pending']);
  const prior=arr(data.prior_receipts),missing=roles.slice(0,3).filter(r=>!prior.some(p=>p?.role===r&&p?.result?.local_draft_created===true));
  const findings=[...(!business?['business_name_missing']:[]),...(!cta?['call_to_action_missing']:[]),
    ...(!audience?['audience_missing']:[]),
    ...(claims.some(c=>!c.evidence_ref)?['claim_evidence_missing']:[]),
    ...(assets.some(a=>!a.eligible_for_use)?['asset_rights_not_cleared']:[]),
    ...(!assets.length?['original_asset_plan_required']:[]),
    ...missing.map(r=>'required_role_receipt_missing:'+r),
    'real_footage_voice_music_and_final_qa_pending','owner_approval_and_systemia_admission_pending'];
  return receipt(role,{evaluated_role_count:prior.length,reviewed_claim_count:claims.length,
    asset_count:assets.length,eligible_asset_count:assets.filter(a=>a.eligible_for_use).length,
    approval_state:'held',final_advertisement_ready:false,customer_delivery_ready:false,
    conditions_to_clear:[...new Set(findings)]},findings);
}
export async function reconcile({results=[],plan={}}){
  const missing=(plan.roles||roles).filter(r=>!results.some(v=>v?.role===r));
  const bad=results.some(r=>r?.result?.local_draft_created!==true||r?.result?.external_effects_performed!==false);
  return {schema:'evercraft.work-saban.commercial-reconciliation.v1',
    status:missing.length||bad?'blocked':'reconciled_with_holds',
    role_receipt_count:results.length,actual_local_role_invocations:results.length,
    findings:[...new Set([...missing.map(r=>'missing_role:'+r),...(bad?['noncompliant_worker_receipt']:[]),
      ...results.flatMap(r=>r?.result?.findings||[])])],
    draft_artifacts_created:results.length,video_rendered:false,external_side_effects:false,final_delivery_ready:false};
}
