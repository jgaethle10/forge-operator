import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAmbientTrustRecord,
  markAmbientCandidate,
  authorizeAmbientDevice,
  heartbeatAmbientDevice,
  evaluateAmbientTrust,
  revokeAmbientDevice,
} from '../systemia/saban/ambient-device-trust.mjs';

const manifest='sha256:'+'a'.repeat(64);

test('ambient device must climb observation -> candidate -> authorized -> active',()=>{
  let r=createAmbientTrustRecord({device_id:'fridge-01',observed_at:'2026-10-01T03:00:00.000Z'});
  assert.equal(r.state,'observed');
  r=markAmbientCandidate(r,{capability_manifest_hash:manifest,observed_at:'2026-10-01T03:01:00.000Z'});
  assert.equal(r.state,'candidate');
  r=authorizeAmbientDevice(r,{
    approval_ref:'owner-approved-fridge',
    expires_at:'2026-10-02T03:00:00.000Z',
    heartbeat_target_seconds:60,
    attestation_mode:'gateway_bound',
    attestation_identity:'home-hub-key',
    authorized_at:'2026-10-01T03:02:00.000Z',
  });
  assert.equal(r.state,'authorized');
  let evaluated=evaluateAmbientTrust(r,{now:new Date('2026-10-01T03:02:10.000Z')});
  assert.equal(evaluated.eligible,false);
  assert.equal(evaluated.reason,'first_heartbeat_required');

  r=heartbeatAmbientDevice(r,{
    capability_manifest_hash:manifest,
    attestation_identity:'home-hub-key',
    observed_at:'2026-10-01T03:02:20.000Z',
  });
  evaluated=evaluateAmbientTrust(r,{now:new Date('2026-10-01T03:03:00.000Z')});
  assert.equal(evaluated.eligible,true);
  assert.equal(evaluated.state,'active');
});

test('stale heartbeat degrades capacity and authorization expiry kills it',()=>{
  let r=createAmbientTrustRecord({device_id:'router-01'});
  r=markAmbientCandidate(r,{capability_manifest_hash:manifest});
  r=authorizeAmbientDevice(r,{
    approval_ref:'owner-router',
    expires_at:'2026-10-01T05:00:00.000Z',
    heartbeat_target_seconds:30,
    authorized_at:'2026-10-01T03:00:00.000Z',
  });
  r=heartbeatAmbientDevice(r,{
    capability_manifest_hash:manifest,
    observed_at:'2026-10-01T03:00:10.000Z',
  });
  const stale=evaluateAmbientTrust(r,{now:new Date('2026-10-01T03:02:00.000Z')});
  assert.equal(stale.eligible,false);
  assert.equal(stale.reason,'heartbeat_stale');

  const expired=evaluateAmbientTrust(r,{now:new Date('2026-10-01T06:00:00.000Z')});
  assert.equal(expired.eligible,false);
  assert.equal(expired.reason,'authorization_expired');
});

test('manifest drift and identity drift fail closed',()=>{
  let r=createAmbientTrustRecord({device_id:'tv-01'});
  r=markAmbientCandidate(r,{capability_manifest_hash:manifest});
  r=authorizeAmbientDevice(r,{
    approval_ref:'owner-tv',
    expires_at:'2026-10-02T03:00:00.000Z',
    attestation_identity:'hub-a',
    authorized_at:'2026-10-01T03:00:00.000Z',
  });
  assert.throws(()=>heartbeatAmbientDevice(r,{
    capability_manifest_hash:'sha256:'+'b'.repeat(64),
    attestation_identity:'hub-a',
    observed_at:'2026-10-01T03:01:00.000Z',
  }),/manifest_drift/);
  assert.throws(()=>heartbeatAmbientDevice(r,{
    capability_manifest_hash:manifest,
    attestation_identity:'hub-b',
    observed_at:'2026-10-01T03:01:00.000Z',
  }),/identity_mismatch/);
});

test('revocation is terminal for scheduling',()=>{
  let r=createAmbientTrustRecord({device_id:'phone-01'});
  r=markAmbientCandidate(r,{capability_manifest_hash:manifest});
  r=authorizeAmbientDevice(r,{
    approval_ref:'owner-phone',
    expires_at:'2026-10-02T03:00:00.000Z',
    authorized_at:'2026-10-01T03:00:00.000Z',
  });
  r=revokeAmbientDevice(r,{approval_ref:'owner-revoke',revoked_at:'2026-10-01T03:10:00.000Z'});
  const decision=evaluateAmbientTrust(r,{now:new Date('2026-10-01T03:11:00.000Z')});
  assert.equal(decision.eligible,false);
  assert.equal(decision.state,'revoked');
  assert.throws(()=>heartbeatAmbientDevice(r,{capability_manifest_hash:manifest}),/revoked/);
});
