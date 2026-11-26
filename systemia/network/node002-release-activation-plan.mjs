// Pure planning only: no service control, execution, network or filesystem access.
// Inputs must be independently verified by the trusted resident controller.
const phases=new Set(['hash-only','cemetery-restore','cemetery-ingest']);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
export function planReleaseActivation({staged,validation,current,authorization,nowMs=Date.now()}={}){
 if(staged?.schema!=='evercraft.node002.release-stage-receipt.v1'||staged.state!=='staged_not_validated'||staged.activation_authorized!==false||!sha(staged.commit)||!phases.has(staged.phase))throw Error('stage_receipt_invalid');
 if(validation?.commit!==staged.commit||validation?.phase!==staged.phase||validation?.sequence!==staged.sequence||validation?.passed!==true||validation?.source_integrity_verified!==true)throw Error('release_validation_required');
 if(current?.healthy!==true||current?.node_id!=='evercraft-node002-nextgen'||!sha(current.commit)||current.commit===staged.commit||!phases.has(current.phase))throw Error('healthy_rollback_baseline_required');
 // Activation grants are a distinct authority; stage-only grants never qualify.
 // This contract does not implement signature verification of activation grants.
 if(authorization?.operation!=='activate'||authorization?.node_id!==current.node_id||authorization?.commit!==staged.commit||authorization?.phase!==staged.phase||authorization?.sequence!==staged.sequence||authorization?.rollback_commit!==current.commit||!Number.isFinite(nowMs)||!(Date.parse(authorization.expires_at)>nowMs))throw Error('activation_grant_required');
 return Object.freeze({schema:'evercraft.node002.activation-plan.v1',state:'proposed_not_executable',node_id:current.node_id,commit:staged.commit,phase:staged.phase,rollback_commit:current.commit,rollback_phase:current.phase,sequence:staged.sequence,required_gates:Object.freeze(['verify_activation_signature','verify_staged_bytes','verify_no_active_jobs','verify_previous_release_available','activate_scoped_service','verify_local_health','verify_broker_attestation','rollback_on_failure']),execution_authorized:false});
}
