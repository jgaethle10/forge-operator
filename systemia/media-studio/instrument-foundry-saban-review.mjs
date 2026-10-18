/**
 * Invoke the EXISTING Saban media-studio reviewer on Foundry capture briefs.
 * Saban's connected adapter is a deterministic planning/requirement reviewer:
 * these checks DO NOT prove live distributed agent execution, recording ownership,
 * authentic instrument sound, or a right to release music.
 */
import {runAssignment,reconcile} from './saban-adapter.mjs';

const ROLES=['continuity_guard','rights_guard','provenance_guard','timing_guard'];
const HEX64=/^[0-9a-f]{64}$/;

export async function runFoundrySabanCaptureReview({
  capture_id,source_sha256,rights_evidence_ref,provenance_receipt_id,
  performance_timing_receipt_id,human_listening_review
}={}){
  const digest=typeof source_sha256==='string'&&HEX64.test(source_sha256)?source_sha256:null;
  const required=[];
  if(rights_evidence_ref)required.push('commercial_rights');
  if(provenance_receipt_id)required.push('provenance_receipt');
  if(performance_timing_receipt_id)required.push('timing_control');
  const need={
    id:typeof capture_id==='string'&&capture_id.trim()?capture_id:null,
    kind:'music',continuityDigest:digest,requires:required,
  };
  const rows=await Promise.all(ROLES.map(async(role,index)=>{
    const out=await runAssignment({
      assignment:{agent_id:'saban-media-studio-'+index,role,item:{raw:{need}}},
    });
    return out;
  }));
  const validation=await reconcile({results:rows,plan:{roles:ROLES}});
  const findings=validation.needs.flatMap(n=>n.findings);
  const listeningAccepted=human_listening_review?.state==='accepted'&&
    typeof human_listening_review?.receipt_id==='string'&&human_listening_review.receipt_id.length>0;
  return {
    schema:'evercraft.fallen.saban-capture-preflight.v1',
    capture_id:need.id,
    roles_checked:ROLES,
    review_status:validation.status==='reconciled'&&digest&&listeningAccepted
      ? 'review_ready_for_independent_rights_and_audio_QA'
      : 'blocked',
    findings: [
      ...findings,
      ...(!listeningAccepted?['human_listening_acceptance_missing']:[]),
      ...(!digest?['source_sha256_invalid']:[]),
    ],
    planning_receipts:rows,
    release_ready:false,
    sample_rights_independently_verified:false,
    live_distributed_worker_execution:false,
    adapter_mode:'existing_saban_planning_checks_only',
    next_gate:'independent_rights_authenticity_and_real_browser_audio_QA',
  };
}
