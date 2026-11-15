// Saban registered read-only admission for Evercraft Network's community radio
// synthetic field experiment. This adapter never creates a LAN listener,
// issues a remote device grant, executes shell, changes networking, or touches RF.
import fs from 'node:fs';
import path from 'node:path';
import { assessCommunityRadioFieldTrial } from '../network/community-radio-field-evidence.mjs';

const ROLES = new Set([
  'station_boundary_guard',
  'device_authorization_guard',
  'source_integrity_guard',
  'field_receipt_guard'
]);
const requiredSourceFiles = [
  'systemia/network/community-radio-offline-portal.mjs',
  'systemia/network/community-radio-lan-lab.mjs',
  'systemia/network/community-radio-second-device-probe.mjs',
  'systemia/network/community-radio-clock-guard.mjs'
];

export async function runAssignment({assignment, rootDir=process.cwd()}={}) {
  if(!ROLES.has(assignment?.role)) throw Error('unregistered_radio_preflight_role');
  if(assignment?.work?.kind!=='community_radio_preflight' ||
     assignment?.item?.raw?.scenario!=='synthetic_only') {
    throw Error('synthetic_only_radio_preflight_required');
  }
  const field=assessCommunityRadioFieldTrial({});
  const sourcesPresent=requiredSourceFiles.every(f=>fs.existsSync(path.join(rootDir,f)));
  const conditions={
    station_boundary_guard:{
      code_boundary:'no_FM_or_EAS_actions_in_adapter',
      licensed_station_authorized:false,
      radio_station_connection_permitted:false
    },
    device_authorization_guard:{
      hardware_enrollment_executed:false,
      device_operator_grant_verified:false,
      operator_approval_required:true,
      remote_control_available_from_this_receipt:false
    },
    source_integrity_guard:{
      local_components_present:sourcesPresent,
      synthetic_audio_provenance_only:true,
      live_station_audio_verified:false,
      real_broadcast_stream_not_admitted:true
    },
    field_receipt_guard:{
      missing_field_evidence_count:field.criteria_total-field.criteria_satisfied,
      independently_field_verified:field.independent_physical_field_verification,
      actual_second_device_reached:false,
      host_and_listener_outage_verified:false
    }
  };
  return {
    schema:'evercraft.saban.community-radio-preflight-finding.v1',
    status:'completed',
    review_role:assignment.role,
    review_state:'held_pending_authorized_physical_test',
    result:conditions[assignment.role],
    allowable_next_action:'operator_approved_synthetic_lab_only',
    no_lan_listener_started:true,
    no_customer_hardware_touched:true,
    no_external_network_calls:true,
    no_fm_eas_or_station_operations:true,
    no_sensitive_topology_in_receipt:true
  };
}

export async function reconcile({results=[]}={}) {
  const rows=results.filter(x=>x?.schema==='evercraft.saban.community-radio-preflight-finding.v1');
  const found=new Set(rows.map(x=>x.review_role));
  const missing=[...ROLES].filter(x=>!found.has(x));
  return {
    schema:'evercraft.saban.community-radio-preflight-reconciliation.v1',
    status:'reconciled',
    mission_state:missing.length?'held_incomplete_review':'held_pending_authorized_physical_test',
    completed_roles:[...found].sort(),
    missing_roles:missing,
    actual_node_access_confirmed:false,
    physical_two_device_test_completed:false,
    service_deployed:false,
    independent_field_evidence_verified:false,
    authorized_next_step:'verify live Saban/NodeSeed route and explicit operator approval before hardware activity',
    side_effects_executed:0
  };
}
