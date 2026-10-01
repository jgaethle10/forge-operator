import test from 'node:test';
import assert from 'node:assert/strict';
import {
  profileAmbientObservation,
  profileAmbientCensus,
} from '../systemia/saban/ambient-candidate-profiler.mjs';

test('Matter sighting becomes an appliance capability candidate, never implicit compute',()=>{
  const p=profileAmbientObservation({
    source:'avahi',
    observation_kind:'mdns-service',
    device_hint_hash:'sha256:'+'a'.repeat(64),
    service_type:'_matter._tcp',
  });
  assert.equal(p.device_family,'matter_device');
  assert.ok(p.suggested_bridge_modes.includes('matter'));
  assert.ok(p.candidate_capability_kinds.includes('observation'));
  assert.equal(p.compute_implied,false);
  assert.equal(p.active_probe_allowed,false);
  assert.equal(p.owner_authorization_required,true);
});

test('SSH sighting suggests possible compute but still does not imply or authorize it',()=>{
  const p=profileAmbientObservation({
    source:'avahi',
    observation_kind:'mdns-service',
    device_hint_hash:'sha256:'+'b'.repeat(64),
    service_type:'_ssh._tcp',
  });
  assert.equal(p.device_family,'general_compute_candidate');
  assert.ok(p.candidate_capability_kinds.includes('compute'));
  assert.equal(p.compute_implied,false);
  assert.ok(p.next_steps.includes('install_or_verify_native_agent'));
  assert.ok(p.next_steps.includes('run_safe_workload_conformance'));
});

test('network-storage sightings become storage candidates without control',()=>{
  const census={
    schema:'evercraft.saban.passive-ambient-census.v1',
    observations:[
      {source:'avahi',observation_kind:'mdns-service',device_hint_hash:'sha256:'+'1'.repeat(64),service_type:'_smb._tcp'},
      {source:'avahi',observation_kind:'mdns-service',device_hint_hash:'sha256:'+'2'.repeat(64),service_type:'_nfs._tcp'},
    ],
    observed_at:'2026-10-01T03:00:00.000Z',
  };
  const inventory=profileAmbientCensus(census);
  assert.equal(inventory.candidate_count,2);
  assert.equal(inventory.family_counts.network_storage,2);
  assert.equal(inventory.authorization_granted,false);
  assert.equal(inventory.active_probe_performed,false);
  assert.ok(inventory.profiles.every(x=>x.candidate_capability_kinds.includes('storage')));
});
