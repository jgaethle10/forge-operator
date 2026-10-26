import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { EvercraftPassport } from '../passport/passport.mjs';
import { createRemoteDevicePassportVerifier, remoteDevicePermitBinding } from './remote-device-passport-verifier.mjs';

const OWNER = 'owner:nextgen-ci-proof';
const DEPLOY = 'evercraft-broker-proof';
const NODE = 'evercraft-node002-nextgen';
const FP = 'sha256:'+'a'.repeat(64);
const sha = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nextgen-passport-approval-'));
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  const passport = new EvercraftPassport({stateDir:path.join(root,'passport')});
  const grant = passport.issueGrant({
    idempotency_key:randomUUID(),
    subject_ref:OWNER,
    issuer_ref:'identity:owner-manually-verified-outside-ci',
    product:'evercraft.remote-device-trust',
    scopes:['remote_device.authorize','remote_device.revoke'],
    authority_state:'manual_authorized',
    authority_receipt_ref:'ci-fixture:synthetic-owner-verification',
    starts_at:new Date(Date.now()-1000).toISOString(),
    ends_at:new Date(Date.now()+30*60*1000).toISOString(),
    max_delegation_depth:0,
  }).grant;
  return {passport,grant};
}

function req({action='authorize', node_id=NODE,device_fingerprint=FP,approval_ref='permit_pending'} = {}) {
  const deployment_id=DEPLOY;
  const payload={deployment_id,action,device_fingerprint,node_id,approval_ref};
  return {...payload,payload_sha256:sha(payload)};
}

function mint(passport,grant,request, actor=OWNER,overrides={}) {
  const bound=remoteDevicePermitBinding(request);
  return passport.mintActionPermit({
    grant_id:grant.grant_id,
    actor_ref:actor,
    scope:bound.scope,
    resource_ref:bound.resource_ref,
    request_fingerprint:bound.request_fingerprint,
    ttl_seconds:90,
    idempotency_key:randomUUID(),
    permit_id:request.approval_ref,
    ...overrides,
  }).permit;
}

test('exact owner Passport permit consumes once and survives Passport re-instantiation',async t=>{
  const {passport,grant}=setup(t);
  const request=req({approval_ref:'permit_'+randomUUID()});
  mint(passport,grant,request);
  const verify=createRemoteDevicePassportVerifier({passport,ownerSubjectRef:OWNER});
  const result=await verify(request);
  assert.equal(result.approved,true);
  assert.equal(result.one_time_consumed,true);
  assert.equal(result.payload_sha256,request.payload_sha256);
  assert.equal(passport.getActionPermitState(request.approval_ref).active,false);
  await assert.rejects(verify(request),/remote_device_passport_permit_denied/);
  const restored=new EvercraftPassport({stateDir:passport.stateDir});
  assert.equal(restored.getActionPermitState(request.approval_ref).consumed,true);
  const verifyAfterRestart=createRemoteDevicePassportVerifier({passport:restored,ownerSubjectRef:OWNER});
  await assert.rejects(verifyAfterRestart(request),/remote_device_passport_permit_denied/);
});

test('wrong exact fingerprint/node/action/approvalRef never consumes original permit',async t=>{
  const {passport,grant}=setup(t);
  const request=req({approval_ref:'permit_'+randomUUID()});
  mint(passport,grant,request);
  const verify=createRemoteDevicePassportVerifier({passport,ownerSubjectRef:OWNER});
  const changes=[
    req({approval_ref:request.approval_ref,node_id:'other-device'}),
    req({approval_ref:request.approval_ref,device_fingerprint:'sha256:'+'b'.repeat(64)}),
    req({approval_ref:request.approval_ref,action:'revoke'}),
    req({approval_ref:'permit_'+randomUUID()}),
    {...request,payload_sha256:'0'.repeat(64)},
  ];
  for (const changed of changes) await assert.rejects(verify(changed));
  assert.equal(passport.getActionPermitState(request.approval_ref).active,true);
});

test('a permit issued to a different owner subject cannot authorize this node',async t=>{
  const {passport,grant}=setup(t);
  const request=req({approval_ref:'permit_'+randomUUID()});
  mint(passport,grant,request);
  const wrongOwner=createRemoteDevicePassportVerifier({
    passport,ownerSubjectRef:'owner:unauthenticated-caller',
  });
  await assert.rejects(wrongOwner(request),/remote_device_passport_permit_denied/);
  assert.equal(passport.getActionPermitState(request.approval_ref).active,true);
});

test('cancellation and grant revocation fail closed before broker mutation',async t=>{
  const {passport,grant}=setup(t);
  const request=req({approval_ref:'permit_'+randomUUID()});
  mint(passport,grant,request);
  passport.cancelActionPermit({
    permit_id:request.approval_ref,
    actor_ref:OWNER,
    idempotency_key:randomUUID(),
  });
  const verify=createRemoteDevicePassportVerifier({passport,ownerSubjectRef:OWNER});
  await assert.rejects(verify(request),/remote_device_passport_permit_denied/);
  const second=req({approval_ref:'permit_'+randomUUID()});
  mint(passport,grant,second);
  passport.revokeGrant({
    grant_id:grant.grant_id,
    actor_ref:OWNER,
    authority_state:'manual_authorized',
    authority_receipt_ref:'ci-fixture:synthetic-owner-revocation',
    idempotency_key:randomUUID(),
  });
  await assert.rejects(verify(second),/remote_device_passport_permit_denied/);
});

test('no mint/issuer access, absent Passport, invalid inputs and concurrent replay denied',async t=>{
  const {passport,grant}=setup(t);
  assert.throws(()=>createRemoteDevicePassportVerifier({ownerSubjectRef:OWNER}),/owner_authority_required/);
  assert.throws(()=>createRemoteDevicePassportVerifier({passport}),/owner_authority_required/);
  const request=req({approval_ref:'permit_'+randomUUID()});
  assert.throws(()=>remoteDevicePermitBinding({...request,device_fingerprint:'not-a-hash'}),/binding_invalid/);
  mint(passport,grant,request);
  const restrictedReader={
    getActionPermitState: (...args)=>passport.getActionPermitState(...args),
    consumeActionPermit: (...args)=>passport.consumeActionPermit(...args),
  };
  const verify=createRemoteDevicePassportVerifier({passport:restrictedReader,ownerSubjectRef:OWNER});
  const attempts=await Promise.allSettled([verify(request),verify(request)]);
  assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(attempts.filter(x=>x.status==='rejected').length,1);
  assert.equal(passport.getActionPermitState(request.approval_ref).consumed,true);
});

test('mint is not permitted by mere request data: absent permit and mismatched digest fail',async t=>{
  const {passport,grant}=setup(t);
  const request=req({approval_ref:'permit_'+randomUUID()});
  const verifier=createRemoteDevicePassportVerifier({passport,ownerSubjectRef:OWNER});
  await assert.rejects(verifier(request),/permit_not_found/);
  const stale=req({approval_ref:'permit_'+randomUUID()});
  mint(passport,grant,stale);
  await assert.rejects(verifier({...stale,payload_sha256:'f'.repeat(64)}),/permit_denied/);
  assert.equal(passport.getActionPermitState(stale.approval_ref).active,true);
});
