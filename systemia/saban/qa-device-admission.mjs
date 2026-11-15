// Read-only hardware admission. A capacity advertisement is NOT proof of device identity.
// No network access, leases, tokens, or deployment side effects.
import {createHash} from 'node:crypto';
const sha=value=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ID=/^[a-z0-9][a-z0-9._-]{1,95}$/i;
const FINGERPRINT=/^(?:sha256:)?[0-9a-f]{64}$/i;
const REQUIRED=['saban.multiplier-assignment.v1','systemia.content-hash.v1'];
export function assessPortfolioQaDeviceCapacity({
 capacity,expectedNodeId,expectedFingerprint,operatorApproved=false,now=new Date()
}={}){
 const reasons=[];
 const node=String(expectedNodeId||'').trim();
 const pinned=String(expectedFingerprint||'').trim().toLowerCase().replace(/^sha256:/,'');
 const observed=String(capacity?.device_fingerprint||'').toLowerCase().replace(/^sha256:/,'');
 if(!ID.test(node))reasons.push('trusted_node_id_required');
 if(!FINGERPRINT.test(pinned))reasons.push('trusted_device_fingerprint_pin_required');
 if(!operatorApproved)reasons.push('operator_approval_required');
 if(capacity?.protocol!=='evercraft.capacity.v1')reasons.push('invalid_capacity_protocol');
 if(capacity?.node_id!==node)reasons.push('node_id_mismatch');
 if(!FINGERPRINT.test(observed)||observed!==pinned)reasons.push('fingerprint_mismatch');
 if(capacity?.zero_cost!==true)reasons.push('zero_cost_not_verified');
 if(capacity?.allocation_auth!=='bearer')reasons.push('lease_authorization_not_confirmed');
 if(capacity?.attestation_supported!==true)reasons.push('attestation_not_supported');
 if(!Array.isArray(capacity?.supported_workloads)||REQUIRED.some(w=>!capacity.supported_workloads.includes(w)))
  reasons.push('registered_qa_workloads_missing');
 if(!Array.isArray(capacity?.placement_labels)||!capacity.placement_labels.includes('operator-authorized'))
  reasons.push('operator_authorized_placement_missing');
 const nowMs=new Date(now).getTime(),expiry=Date.parse(String(capacity?.expires_at||''));
 if(!Number.isFinite(nowMs)||!Number.isFinite(expiry)||expiry<=nowMs||expiry>nowMs+90_000)
  reasons.push('capacity_advertisement_stale_or_invalid');
 const base={
  schema:'evercraft.saban.qa-device-admission.v1',
  state:reasons.length?'held':'candidate_for_private_pairing',
  operational_execution_authorized:false,
  physical_qa_execution_verified:false,
  requires_authenticated_transport:true,
  requires_current_release_attestation:true,
  requires_lease_and_signed_worker_result:true,
  expected_node_id_valid:ID.test(node),
  pinned_fingerprint_present:FINGERPRINT.test(pinned),
  fingerprint_match:observed===pinned&&FINGERPRINT.test(pinned),
  advertised_workloads_valid:Array.isArray(capacity?.supported_workloads)&&REQUIRED.every(w=>capacity.supported_workloads.includes(w)),
  reasons,
 };
 return {...base,receipt_hash:sha(base)};
}
