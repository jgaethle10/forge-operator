import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, mkdir, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvercraftPassport } from '../../passport/passport.mjs';
import { createGoalState, admitGoalPlan, startGoalWork, recordGoalOutcome } from '../../organism/goal-runtime.mjs';
import { createGoalStateFile } from '../../organism/goal-store.mjs';
import { signMicroSeedExecutionReceipt } from '../../saban/microseed-receipt-signature.mjs';
import { readPassportScopedGoalWithDeviceEvidence, readPassportScopedGoalFromSignedStore, readPassportScopedGoalFromActiveAmbientRegistry } from './passport-goal-read.mjs';
import { AmbientDeviceRegistry } from '../../saban/ambient-device-registry.mjs';
import { normalizeMicroDeviceManifest } from '../../saban/microseed-device-bridge.mjs';
import { persistSignedMicroSeedReceipt } from '../../saban/microseed-signed-receipt-store.mjs';

const startAt = new Date('2026-11-05T22:51:00.000Z');
const finishAt = new Date('2026-11-05T22:53:00.000Z');
const now = new Date('2026-11-05T22:54:00.000Z');
async function setup({grant=true}={}) {
  const dir=await mkdtemp(join(tmpdir(),'systemia-signed-passport-'));
  const passportStateDir=join(dir,'passport'), goalStateDir=join(dir,'goals');
  await mkdir(goalStateDir);
  const passport=new EvercraftPassport({stateDir:passportStateDir});
  if(grant)passport.issueGrant({
    grant_id:'test-goal-read',idempotency_key:'test-allow-1',
    subject_ref:'test-operator',issuer_ref:'test-identity-authority',
    product:'systemia',scopes:['mission.visual.read'],resource_refs:['goal:private-goal'],
    starts_at:'2026-11-01T00:00:00.000Z',ends_at:'2026-11-07T00:00:00.000Z',
    authority_state:'verified_identity_authority',
    authority_receipt_ref:'synthetic-identity-auth',
  });
  const initial=createGoalState({goalKey:'private-goal',objective:'PRIVATE customer alpha@example.com',now:startAt});
  const planned=admitGoalPlan({state:initial,plan:[{work_key:'private-task',work_type:'research'}],now:startAt});
  const started=startGoalWork({state:planned,workKey:'private-task',now:startAt});
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const receipt=signMicroSeedExecutionReceipt({
    schema:'evercraft.microseed.execution-receipt.v1',
    device_id:'private-device',workload_class:'systemia.content-hash.v1',
    idempotency_key:started.tasks[0].attempt_key,
    request_hash:'sha256:'+'a'.repeat(64),
    manifest_hash:'sha256:'+'b'.repeat(64),
    safety_receipt_ref:'sha256:'+'c'.repeat(64),
    result:{ok:true},execution_location:'device',deduplicated:false,
    arbitrary_code_execution:false,primary_function_priority:true,
    external_cash_spend_usd:0,incremental_energy_cost_state:'not_measured',
    completed_at:'2026-11-05T22:52:00.000Z',
    receipt_hash:'sha256:'+'d'.repeat(64),
  },{privateKey,key_id:'test-signer'});
  const completed=recordGoalOutcome({
    state:started,workKey:'private-task',expectedAttempt:1,
    result:'complete',receiptRef:receipt.receipt_hash,now:finishAt,
  });
  await createGoalStateFile(join(goalStateDir,'private-goal.json'),completed);
  const keys={'test-signer':{
    device_id:'private-device',
    public_key_pem:publicKey.export({type:'spki',format:'pem'}).toString(),
    allowed_workload_classes:['systemia.content-hash.v1'],
  }};
  const read=(overrides={})=>readPassportScopedGoalWithDeviceEvidence({
    passportStateDir,goalStateDir,verifiedSubjectRef:'test-operator',
    goalKey:'private-goal',now,signedReceipts:[receipt],trustedDeviceKeys:keys,
    ...overrides,
  });
  return {dir,passport,goalStateDir,passportStateDir,receipt,keys,read};
}
async function withCase(opts,fn){const fixture=await setup(opts);try{await fn(fixture)}finally{await rm(fixture.dir,{recursive:true,force:true})}}

test('signed device receipt appears only after authorized mission access',()=>withCase({},async({read,goalStateDir,passportStateDir})=>{
  const goalBefore=await readFile(join(goalStateDir,'private-goal.json'),'utf8');
  const passportBefore=await readFile(join(passportStateDir,'grants.jsonl'),'utf8');
  const result=await read();
  assert.equal(result.provenance.passport_authorization_verified,true);
  assert.equal(result.summary.signed_device_receipts_matched,1);
  assert.equal(result.provenance.signature_verified,false);
  assert.equal(result.provenance.independent_effect_verified,false);
  assert.equal(result.summary.verified_receipts,0);
  assert.equal(result.nodes[1].status,'reported_complete_unverified');
  for(const secret of ['private-goal','private-task','private-device','test-signer','alpha@example.com']){
    assert.ok(!JSON.stringify(result).includes(secret),'private identifier leaked: '+secret);
  }
  assert.equal(await readFile(join(goalStateDir,'private-goal.json'),'utf8'),goalBefore);
  assert.equal(await readFile(join(passportStateDir,'grants.jsonl'),'utf8'),passportBefore);
}));
test('denied subject never gets signed evidence or goal data',()=>withCase({grant:false},async({read})=>{
  await assert.rejects(read(),/visual_access_denied/);
}));
test('wrong mission grant or tampered signature cannot be shown',()=>withCase({},async({read,receipt})=>{
  await assert.rejects(read({verifiedSubjectRef:'untrusted-user'}),/visual_access_denied/);
  const tampered=structuredClone(receipt);tampered.result={ok:false};
  await assert.rejects(read({signedReceipts:[tampered]}),/device_signature_rejected/);
}));
test('revocation blocks even a previously accepted evidence read',()=>withCase({},async({read,passport})=>{
  await read();
  passport.revokeGrant({
    idempotency_key:'revoke-read',grant_id:'test-goal-read',actor_ref:'test-operator',
    authority_state:'subject_self_revocation',authority_receipt_ref:'revoke-test',
    reason:'test',revoked_at:now.toISOString(),
  });
  await assert.rejects(read(),/visual_access_denied/);
}));

test('real signed receipt journal is read only after exact Passport authorization',()=>withCase({},async({dir,read,receipt,keys,passportStateDir,goalStateDir})=>{
  const stateDir=join(dir,'device-state');
  await persistSignedMicroSeedReceipt({stateDir,signedReceipt:receipt});
  const snapshot=await readPassportScopedGoalFromSignedStore({
    passportStateDir,goalStateDir,verifiedSubjectRef:'test-operator',
    goalKey:'private-goal',now,
    receiptStateDirsByDevice:{'private-device':stateDir},
    attemptDeviceMap:{[receipt.idempotency_key]:'private-device'},
    trustedDeviceKeys:keys,
  });
  assert.equal(snapshot.provenance.passport_authorization_verified,true);
  assert.equal(snapshot.summary.signed_device_receipts_matched,1);
  assert.equal(snapshot.summary.signed_receipt_sources_missing,0);
  assert.equal(snapshot.summary.verified_receipts,0);
  assert.equal(snapshot.provenance.independent_effect_verified,false);
  assert.equal(snapshot.nodes[1].device_signature_state,'verified_against_pinned_device_key');
  for(const secret of ['private-device','private-goal','private-task','test-signer']){
    assert.equal(JSON.stringify(snapshot).includes(secret),false);
  }
}));
test('missing signed journal remains an explicit evidence gap, not verified work',()=>withCase({},async({dir,receipt,keys,goalStateDir,passportStateDir})=>{
  const snapshot=await readPassportScopedGoalFromSignedStore({
    passportStateDir,goalStateDir,verifiedSubjectRef:'test-operator',
    goalKey:'private-goal',now,
    receiptStateDirsByDevice:{'private-device':join(dir,'nonexistent-journal')},
    attemptDeviceMap:{[receipt.idempotency_key]:'private-device'},
    trustedDeviceKeys:keys,
  });
  assert.equal(snapshot.summary.signed_receipt_sources_missing,1);
  assert.equal(snapshot.summary.signed_device_receipts_matched,0);
  assert.equal(snapshot.summary.verified_receipts,0);
  assert.equal(snapshot.nodes[1].status,'reported_complete_unverified');
}));
test('no Passport grant denies the signed journal read before file access',()=>withCase({grant:false},async({dir,receipt,keys,goalStateDir,passportStateDir})=>{
  await assert.rejects(readPassportScopedGoalFromSignedStore({
    passportStateDir,goalStateDir,verifiedSubjectRef:'test-operator',
    goalKey:'private-goal',now,
    receiptStateDirsByDevice:{'private-device':join(dir,'does-not-exist')},
    attemptDeviceMap:{[receipt.idempotency_key]:'private-device'},
    trustedDeviceKeys:keys,
  }),/visual_access_denied/);
}));
test('tampering an existing locally signed journal fails the whole read',()=>withCase({},async({dir,receipt,keys,goalStateDir,passportStateDir})=>{
  const stateDir=join(dir,'device-state');
  await persistSignedMicroSeedReceipt({stateDir,signedReceipt:receipt});
  const [devFolder]=await readdir(join(stateDir,'signed-receipts','v1'));
  const folder=join(stateDir,'signed-receipts','v1',devFolder);
  const [entry]=await readdir(folder);
  const tampered=structuredClone(receipt);tampered.result={ok:false};
  await writeFile(join(folder,entry),JSON.stringify(tampered));
  await assert.rejects(readPassportScopedGoalFromSignedStore({
    passportStateDir,goalStateDir,verifiedSubjectRef:'test-operator',
    goalKey:'private-goal',now,
    receiptStateDirsByDevice:{'private-device':stateDir},
    attemptDeviceMap:{[receipt.idempotency_key]:'private-device'},
    trustedDeviceKeys:keys,
  }),/device_signature_rejected/);
}));

async function enrollDevice({dir, keys, authorized = true, heartbeat = true} = {}) {
  const registryRoot=join(dir,'ambient-registry');
  const registry=new AmbientDeviceRegistry({root:registryRoot});
  const manifest=normalizeMicroDeviceManifest({
    device_id:'private-device',device_class:'phone',bridge_mode:'native_agent',
    authorization_ref:'test-owner-approval',endpoint:'http://127.0.0.1:1',
    supported_workloads:['systemia.content-hash.v1'],
    resources:{cpu_units:1,memory_mb:512,storage_gb:1},
    attestation:{
      mode:'device',device_identity:'test-identity',
      receipt_signing_required:true,receipt_key_id:'test-signer',
      receipt_public_key_pem:keys['test-signer'].public_key_pem,
    },
    observed_at:'2026-11-05T22:50:00.000Z',
  });
  registry.observe({device_id:'private-device',observed_at:'2026-11-05T22:50:00.000Z'});
  registry.candidate({device_id:'private-device',manifest});
  if(authorized){
    registry.authorize({
      device_id:'private-device',approval_ref:'test-approved-owner',
      expires_at:'2026-11-06T02:00:00.000Z',
      heartbeat_target_seconds:300,
      attestation_mode:'device',attestation_identity:'test-identity',
      authorized_at:'2026-11-05T22:51:00.000Z',
    });
    if(heartbeat){
      registry.heartbeat({
        device_id:'private-device',
        capability_manifest_hash:manifest.manifest_hash,
        attestation_identity:'test-identity',
        observed_at:'2026-11-05T22:53:00.000Z',
      });
    }
  }
  return {registryRoot,registry,manifest};
}
test('active approved Ambient Registry supplies actual pinned public key behind Passport',()=>withCase({},async({dir,receipt,keys,passportStateDir,goalStateDir})=>{
  const {registryRoot}=await enrollDevice({dir,keys});
  const stateDir=join(dir,'signed');
  await persistSignedMicroSeedReceipt({stateDir,signedReceipt:receipt});
  const snapshot=await readPassportScopedGoalFromActiveAmbientRegistry({
    passportStateDir,goalStateDir,verifiedSubjectRef:'test-operator',
    goalKey:'private-goal',now,ambientRegistryRoot:registryRoot,
    receiptStateDirsByDevice:{'private-device':stateDir},
    attemptDeviceMap:{[receipt.idempotency_key]:'private-device'},
  });
  assert.equal(snapshot.summary.signed_device_receipts_matched,1);
  assert.equal(snapshot.summary.verified_receipts,0);
  assert.equal(snapshot.provenance.ambient_registry_active_trust_checked,true);
  assert.equal(snapshot.provenance.independent_effect_verified,false);
  for(const secret of ['private-goal','private-device','test-signer','test-owner-approval']){
    assert.ok(!JSON.stringify(snapshot).includes(secret), 'identifier escaped: '+secret);
  }
}));
test('revocation in Ambient Registry invalidates previously signed evidence read',()=>withCase({},async({dir,receipt,keys,passportStateDir,goalStateDir})=>{
  const {registryRoot,registry}=await enrollDevice({dir,keys});
  const stateDir=join(dir,'signed');
  await persistSignedMicroSeedReceipt({stateDir,signedReceipt:receipt});
  const opts={
    passportStateDir,goalStateDir,verifiedSubjectRef:'test-operator',
    goalKey:'private-goal',now,ambientRegistryRoot:registryRoot,
    receiptStateDirsByDevice:{'private-device':stateDir},
    attemptDeviceMap:{[receipt.idempotency_key]:'private-device'},
  };
  await readPassportScopedGoalFromActiveAmbientRegistry(opts);
  registry.revoke({device_id:'private-device',
    approval_ref:'test-revoke-owner',reason:'test',
    revoked_at:'2026-11-05T22:53:30.000Z',
  });
  await assert.rejects(readPassportScopedGoalFromActiveAmbientRegistry(opts),/device_not_active/);
}));
test('expired or stale Ambient heartbeat cannot authorize signed evidence',()=>withCase({},async({dir,receipt,keys,passportStateDir,goalStateDir})=>{
  const {registryRoot}=await enrollDevice({dir,keys});
  const stateDir=join(dir,'signed');
  await persistSignedMicroSeedReceipt({stateDir,signedReceipt:receipt});
  const opts={
    passportStateDir,goalStateDir,verifiedSubjectRef:'test-operator',
    goalKey:'private-goal',ambientRegistryRoot:registryRoot,
    receiptStateDirsByDevice:{'private-device':stateDir},
    attemptDeviceMap:{[receipt.idempotency_key]:'private-device'},
  };
  await assert.rejects(readPassportScopedGoalFromActiveAmbientRegistry({
    ...opts,now:new Date('2026-11-05T23:10:00.000Z')
  }),/device_not_active/);
  await assert.rejects(readPassportScopedGoalFromActiveAmbientRegistry({
    ...opts,now:new Date('2026-11-06T02:01:00.000Z')
  }),/device_not_active/);
}));
test('unapproved Ambient candidate is not an authorized signer',()=>withCase({},async({dir,receipt,keys,passportStateDir,goalStateDir})=>{
  const {registryRoot}=await enrollDevice({dir,keys,authorized:false});
  const stateDir=join(dir,'signed');
  await persistSignedMicroSeedReceipt({stateDir,signedReceipt:receipt});
  await assert.rejects(readPassportScopedGoalFromActiveAmbientRegistry({
    passportStateDir,goalStateDir,verifiedSubjectRef:'test-operator',
    goalKey:'private-goal',now,ambientRegistryRoot:registryRoot,
    receiptStateDirsByDevice:{'private-device':stateDir},
    attemptDeviceMap:{[receipt.idempotency_key]:'private-device'},
  }),/device_not_active/);
}));
test('edited manifest cannot substitute signer key under existing trust approval',()=>withCase({},async({dir,receipt,keys,passportStateDir,goalStateDir})=>{
  const {registryRoot}=await enrollDevice({dir,keys});
  const stateDir=join(dir,'signed');
  await persistSignedMicroSeedReceipt({stateDir,signedReceipt:receipt});
  const manifestFile=join(registryRoot,'manifests','private-device.json');
  const manifest=JSON.parse(await readFile(manifestFile,'utf8'));
  manifest.attestation.receipt_key_id='tampered-key';
  await writeFile(manifestFile,JSON.stringify(manifest),{mode:0o600});
  await assert.rejects(readPassportScopedGoalFromActiveAmbientRegistry({
    passportStateDir,goalStateDir,verifiedSubjectRef:'test-operator',
    goalKey:'private-goal',now,ambientRegistryRoot:registryRoot,
    receiptStateDirsByDevice:{'private-device':stateDir},
    attemptDeviceMap:{[receipt.idempotency_key]:'private-device'},
  }),/manifest_hash_invalid/);
}));
test('unauthorized Passport cannot cause Ambient registry disclosure',()=>withCase({grant:false},async({dir,receipt,goalStateDir,passportStateDir})=>{
  await assert.rejects(readPassportScopedGoalFromActiveAmbientRegistry({
    passportStateDir,goalStateDir,verifiedSubjectRef:'test-operator',
    goalKey:'private-goal',now,ambientRegistryRoot:join(dir,'does-not-exist'),
    receiptStateDirsByDevice:{'private-device':join(dir,'missing')},
    attemptDeviceMap:{[receipt.idempotency_key]:'private-device'},
  }),/visual_access_denied/);
}));
