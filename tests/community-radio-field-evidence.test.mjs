import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCommunityRadioFieldTrial as assess} from '../systemia/network/community-radio-field-evidence.mjs';
const evidence='receipt:operator-approved-check';
const complete=()=>({
  operator:{owns_lab_equipment:true,local_network_approved:true,consent_receipt:evidence},
  boundary:{simulated_audio_only:true,fm_or_eas_equipment_touched:false,real_station_content_present:false},
  host:{device_reference:'operator-host-machine',private_ip:'192.168.1.8'},
  listener:{device_reference:'operator-phone-two',private_ip:'192.168.1.9',photo_or_video_ref:evidence,audio_played_audibly:true,playback_witness_ref:evidence},
  lan:{network_receipt:evidence},outage:{host_upstream_internet_unavailable:true,listener_upstream_internet_unavailable:true,measurement_ref:evidence,observed_at_utc:'2026-10-16T23:00:00Z'},
  audio:{sha256:'sha256:'+'f'.repeat(64),signed_bulletin_sha256:'sha256:'+'a'.repeat(64),byte_range_http_pass:true,server_receipt:evidence},
  negative:{tampered_audio_denied:true,tamper_receipt:evidence,expired_bulletin_denied:true,expiry_receipt:evidence,operator_stopped_server:true,further_access_denied:true,stop_receipt:evidence},
  power:{measured_runtime_seconds:42,battery_only_test:true,measurement_ref:evidence},
  observed_at_utc:'2026-10-16T23:00:00Z',source_revision:'a'.repeat(40)
});
test('no field evidence always held, no physical claim',()=>{const r=assess();assert.equal(r.reported_stage,'held_missing_field_evidence');assert.equal(r.independent_physical_field_verification,false);assert.equal(r.criteria_satisfied,0);});
test('full self-reported fixture remains only operator attestation, never independently proven',()=>{const r=assess(complete());assert.equal(r.criteria_satisfied,12);assert.equal(r.reported_stage,'operator_attested_pending_independent_witness_review');assert.equal(r.real_station_authorization,false);assert.equal(r.independent_physical_field_verification,false);});
test('same device cannot masquerade as a second listener',()=>{const f=complete();f.listener.device_reference=f.host.device_reference;assert.equal(assess(f).reported_stage,'held_missing_field_evidence');});
test('internet simply connected, without outage measurements, cannot pass',()=>{const f=complete();f.outage.listener_upstream_internet_unavailable=false;assert.equal(assess(f).reported_stage,'held_missing_field_evidence');});
test('cannot claim battery endurance without measurement',()=>{const f=complete();f.power.measured_runtime_seconds=null;assert.equal(assess(f).reported_stage,'held_missing_field_evidence');});
test('public or loopback addresses fail physical LAN check',()=>{const f=complete();f.host.private_ip='8.8.8.8';assert.equal(assess(f).reported_stage,'held_missing_field_evidence');f.host.private_ip='127.0.0.1';assert.equal(assess(f).reported_stage,'held_missing_field_evidence');});
test('real broadcast equipment or unlicensed content cannot be mixed with trial',()=>{const f=complete();f.boundary.fm_or_eas_equipment_touched=true;assert.equal(assess(f).reported_stage,'held_missing_field_evidence');f.boundary.fm_or_eas_equipment_touched=false;f.boundary.real_station_content_present=true;assert.equal(assess(f).reported_stage,'held_missing_field_evidence');});
test('must show post-stop denial, not just a stopped process flag',()=>{const f=complete();f.negative.further_access_denied=false;assert.equal(assess(f).reported_stage,'held_missing_field_evidence');});
test('report hash deterministic for equal evidence',()=>{const a=assess(complete()),b=assess(complete());assert.equal(a.report_sha256,b.report_sha256);assert.match(a.report_sha256,/^sha256:[a-f0-9]{64}$/);});
