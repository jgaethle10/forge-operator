import crypto from 'node:crypto';
import net from 'node:net';

// Evidence grader only. Never network access, equipment control, RF transmission,
// or automatic acceptance of safety-critical field readiness.
const sha = x => typeof x === 'string' && /^sha256:[a-f0-9]{64}$/.test(x);
const ref = x => typeof x === 'string' && x.trim().length >= 8 && x.length <= 300;
const dated = x => typeof x === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(x) && Number.isFinite(Date.parse(x));
const isPrivate = ip => {
  if (net.isIP(ip) !== 4) return false;
  const a=ip.split('.').map(Number);
  return a[0]===10 || a[0]===172 && a[1]>=16 && a[1]<=31 || a[0]===192 && a[1]===168;
};
function check(x, ok, reason, requirements){requirements.push({criterion:x,satisfied:!!ok,blocker:!!ok?null:reason});}
export function assessCommunityRadioFieldTrial(packet = {}) {
  const requirements=[];
  check('operator_consent', packet.operator?.owns_lab_equipment===true && packet.operator?.local_network_approved===true && ref(packet.operator?.consent_receipt), 'operator_and_network_permission_unverified',requirements);
  check('no_radio_station_connection', packet.boundary?.simulated_audio_only===true && packet.boundary?.fm_or_eas_equipment_touched===false && packet.boundary?.real_station_content_present===false,'broadcast_isolation_unverified',requirements);
  check('separate_physical_devices', ref(packet.host?.device_reference)&&ref(packet.listener?.device_reference)&&packet.host?.device_reference!==packet.listener?.device_reference&&ref(packet.listener?.photo_or_video_ref),'distinct_physical_devices_unproven',requirements);
  check('private_local_network', isPrivate(packet.host?.private_ip)&&packet.host?.private_ip!==packet.listener?.private_ip&&isPrivate(packet.listener?.private_ip)&&ref(packet.lan?.network_receipt),'authorized_private_lan_unproven',requirements);
  check('internet_unavailable_during_audio',packet.outage?.host_upstream_internet_unavailable===true&&packet.outage?.listener_upstream_internet_unavailable===true&&ref(packet.outage?.measurement_ref)&&dated(packet.outage?.observed_at_utc),'actual_upstream_outage_unproven',requirements);
  check('signed_audio_retrieval',sha(packet.audio?.sha256)&&sha(packet.audio?.signed_bulletin_sha256)&&packet.audio?.byte_range_http_pass===true&&ref(packet.audio?.server_receipt),'signed_audio_bytes_not_verified',requirements);
  check('audible_playback_on_second_device',packet.listener?.audio_played_audibly===true&&ref(packet.listener?.playback_witness_ref),'second_device_playback_unverified',requirements);
  check('source_tamper_fails_closed',packet.negative?.tampered_audio_denied===true&&ref(packet.negative?.tamper_receipt),'tamper_resistance_not_field_observed',requirements);
  check('expiry_fails_closed',packet.negative?.expired_bulletin_denied===true&&ref(packet.negative?.expiry_receipt),'expiry_not_field_observed',requirements);
  check('operator_revocation',packet.negative?.operator_stopped_server===true&&packet.negative?.further_access_denied===true&&ref(packet.negative?.stop_receipt),'revoke_or_shutdown_unproven',requirements);
  check('measured_power_resilience',Number.isFinite(packet.power?.measured_runtime_seconds)&&packet.power?.measured_runtime_seconds>0&&packet.power?.battery_only_test===true&&ref(packet.power?.measurement_ref),'battery_runtime_not_measured',requirements);
  check('timestamps_and_code',dated(packet.observed_at_utc)&&typeof packet.source_revision==='string'&&/^[a-f0-9]{40}$/.test(packet.source_revision),'dated_immutable_code_basis_missing',requirements);
  const satisfied=requirements.filter(x=>x.satisfied).length;
  const result={schema:'evercraft.radio.field-attestation-review.v1',
    reported_stage:satisfied===requirements.length?'operator_attested_pending_independent_witness_review':'held_missing_field_evidence',
    evidence_state:'unverified_operator_supplied_packet',
    criteria_satisfied:satisfied,criteria_total:requirements.length,requirements,
    independent_physical_field_verification:false,
    real_station_authorization:false,
    disaster_reliability_certified:false,
    fm_eas_transmission_authorized:false,
    next_action:satisfied===requirements.length?'independent_evidence_review_and_authorized_retest':'collect_actual_second_device_and_power_outage_receipts'};
  return {...result,report_sha256:'sha256:'+crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex')};
}
