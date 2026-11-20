/**
 * Evidence-to-acceptance binding.
 * Reads only an existing private lease journal, verifies its token erasure
 * and hash-consistent NodeSeed release receipt, then supplies that evidence
 * to the fail-closed three-phase acceptance validator.
 *
 * Never creates a lease, starts a broker, touches NodeSeed, or logs secrets.
 * This is NOT a signed receipt: independent live observations are essential.
 */
import {inspectShadowLeaseReleaseEvidence}
  from './shadow-broker-lease-journal.mjs';
import {evaluatePhysicalShadowCanaryEvidence}
  from './physical-shadow-broker-acceptance.mjs';

export function evaluatePhysicalEvidenceFromJournal({
  before,during,after,journalDir,
}={}){
  let release=null;
  let journalReadValid=false;
  try{
    if(typeof journalDir==='string'&&journalDir.length>0&&
       typeof before?.node_id==='string'){
      release=inspectShadowLeaseReleaseEvidence({
        dir:journalDir,expectedNodeId:before.node_id,
      });
      journalReadValid=true;
    }
  }catch{}
  const result=evaluatePhysicalShadowCanaryEvidence({
    before,during,after,release,
  });
  return {
    ...result,
    schema:'evercraft.yard.physical-shadow-broker-bound-evidence.v1',
    existing_private_journal_read:journalReadValid,
    journal_release_proof_verified:release?.ok===true,
    receipt_integrity_only_not_signed:true,
    actual_live_observation_proven_by_this_adapter:false,
    broker_activation_authorized:false,
    automatic_retry_allowed:false,
  };
}
