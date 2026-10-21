import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { EvercraftPassport } from '../passport/passport.mjs';
import { buildPackageAttestationBody, buildPublisherTrustStore, evercraftOsSha256, signPackageAttestation } from './package-trust.mjs';
import { EvercraftOsPackageTransitionLedger } from './package-transition-ledger.mjs';
import { EvercraftOsPackageStore } from './package-store.mjs';
import { EvercraftHomePackageLifecycle } from './home-package-lifecycle.mjs';
import { EvercraftHomePackageOrchestrator } from './home-package-orchestrator.mjs';
import { createTestAnchoredTrustProvider } from './publisher-trust-test-helper.mjs';

function rig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-os-status-integrity-'));
  const publisher = generateKeyPairSync('ed25519');
  const publicKey = publisher.publicKey.export({type:'spki',format:'pem'});
  const privateKey = publisher.privateKey.export({type:'pkcs8',format:'pem'});
  const trust = buildPublisherTrustStore({keys:[{key_id:'status-key',publisher_ref:'publisher:test',public_key_pem:publicKey,allowed_products:['proof-app']}]});
  const {provider} = createTestAnchoredTrustProvider({stateDir:path.join(root,'trust'),trustStore:trust});
  const baseline=evercraftOsSha256(Buffer.from('initial-v1'));
  const passport = new EvercraftPassport({stateDir:path.join(root,'passport')});
  const ledger = new EvercraftOsPackageTransitionLedger({stateDir:path.join(root,'ledger'),passport,
    installedStateProvider:{currentState:()=>({installed:true,package_fingerprint:baseline})}});
  const store=new EvercraftOsPackageStore({rootDir:path.join(root,'store'),trustProvider:provider});
  const lifecycle=new EvercraftHomePackageLifecycle({transitionLedger:ledger,trustProvider:provider});
  const home=new EvercraftHomePackageOrchestrator({lifecycle,packageStore:store,transitionLedger:ledger});
  const subject='subject:owner', productKey='proof-app', nodeId='node-test';
  let serial=0;
  function permit(scope,requestFingerprint) {
    serial++;
    const start=new Date();
    const grant=passport.issueGrant({idempotency_key:`grant:${serial}`,subject_ref:subject,issuer_ref:'proof:identity',product:'evercraft-os',scopes:[scope],resource_refs:[`os-app:${productKey}:node:${nodeId}`],starts_at:start.toISOString(),ends_at:new Date(start.getTime()+3600000).toISOString(),max_delegation_depth:0,authority_state:'system_policy_authorized',authority_receipt_ref:`proof:${serial}`}).grant;
    return passport.mintActionPermit({idempotency_key:`permit:${serial}`,grant_id:grant.grant_id,actor_ref:subject,scope,resource_ref:`os-app:${productKey}:node:${nodeId}`,request_fingerprint:requestFingerprint,ttl_seconds:300}).permit.permit_id;
  }
  function stage(value, ref) {
    const bytes=Buffer.from(value), hash=evercraftOsSha256(bytes);
    const body=buildPackageAttestationBody({productKey,packageFingerprint:hash,contractVersion:'2.0.0',releaseRef:ref,publisherRef:'publisher:test',keyId:'status-key',artifactHashes:[hash],issuedAt:new Date('2026-10-09T00:00:00Z'),expiresAt:new Date('2026-11-01T00:00:00Z')});
    const attestation=signPackageAttestation({body,privateKeyPem:privateKey});
    return {bytes,hash,attestation};
  }
  function update(release,{reconcile=true}={}){
    const prep=home.stageAndPrepareUpdate({productKey,nodeId,subjectRef:subject,attestation:release.attestation,artifacts:[{bytes:release.bytes}],now:new Date('2026-10-10T00:00:00Z')});
    assert.equal(prep.state,'prepared');
    const plan=prep.preparation.plan,permitId=permit('app.update',plan.request_fingerprint);
    return reconcile ? home.applyPreparedUpdate({plan,permitId,actorRef:subject}) : lifecycle.applyUpdate({plan,permitId,actorRef:subject});
  }
  return {root,ledger,store,home,passport,productKey,nodeId,subject,permit,stage,update,lifecycle};
}

test('Home status fails closed with explicit hold on a tampered transition checkpoint',()=>{
  const r=rig();
  try {
    const release=r.stage('signed-v2','release:2');
    assert.equal(r.update(release).state,'activated_metadata');
    const head=path.join(r.root,'ledger','package-transition-head.json');
    const old=JSON.parse(fs.readFileSync(head,'utf8'));
    fs.writeFileSync(head,JSON.stringify({...old,event_count:999})+'\n');
    const status=r.home.status({productKey:r.productKey,nodeId:r.nodeId});
    assert.equal(status.state,'held_transition_integrity');
    assert.equal(status.desired_active_aligned,false);
    assert.equal(status.transition_integrity.state,'held');
    assert.equal(status.runtime_health_claimed,false);
  } finally {fs.rmSync(r.root,{recursive:true,force:true});}
});

test('Home status rejects stale activation receipt even when package fingerprint matches',()=>{
  const r=rig();
  try {
    const v2=r.stage('signed-v2','release:2');
    assert.equal(r.update(v2).state,'activated_metadata');
    const first=r.home.status({productKey:r.productKey,nodeId:r.nodeId});
    const firstReceipt=first.activation.transition_receipt_hash;
    const rollback=r.lifecycle.prepareRollback({productKey:r.productKey,nodeId:r.nodeId,subjectRef:r.subject});
    assert.equal(rollback.state,'prepared');
    r.lifecycle.applyRollback({plan:rollback.plan,permitId:r.permit('app.rollback',rollback.plan.request_fingerprint),actorRef:r.subject});
    r.update(v2,{reconcile:false});
    const status=r.home.status({productKey:r.productKey,nodeId:r.nodeId});
    assert.equal(status.desired_package_fingerprint,v2.hash);
    assert.equal(status.active_package_fingerprint,v2.hash);
    assert.equal(status.activation.transition_receipt_hash,firstReceipt);
    assert.notEqual(status.expected_transition_receipt_hash,firstReceipt);
    assert.equal(status.desired_active_aligned,false);
    assert.equal(status.state,'held_activation_lineage');
    assert.equal(status.runtime_health_claimed,false);
  } finally {fs.rmSync(r.root,{recursive:true,force:true});}
});

test('package store rejects a verified-hash staged blob symlink outside its staging root',()=>{
  const r=rig();
  try {
    const v2=r.stage('signed-v2','release:2');
    assert.equal(r.update(v2).state,'activated_metadata');
    const stage=r.store.packagePath(r.productKey,v2.hash);
    const blobPath=path.join(stage,'blobs',fs.readdirSync(path.join(stage,'blobs'))[0]);
    const outside=path.join(r.root,'outside-blob');
    fs.copyFileSync(blobPath,outside); fs.unlinkSync(blobPath); fs.symlinkSync(outside,blobPath);
    assert.equal(r.store.inspect(r.productKey,v2.hash).integrity,'held');
    const status=r.home.status({productKey:r.productKey,nodeId:r.nodeId});
    assert.equal(status.state,'held_activation_integrity');
  } finally {fs.rmSync(r.root,{recursive:true,force:true});}
});

test('package store refuses a symlinked activation pointer even with identical JSON content',()=>{
  const r=rig();
  try {
    const v2=r.stage('signed-v2','release:2');
    assert.equal(r.update(v2).state,'activated_metadata');
    const pointer=r.store.activationPath(r.productKey,r.nodeId);
    const outside=path.join(r.root,'outside-activation.json');
    fs.copyFileSync(pointer,outside); fs.unlinkSync(pointer); fs.symlinkSync(outside,pointer);
    const status=r.home.status({productKey:r.productKey,nodeId:r.nodeId});
    assert.equal(status.state,'held_activation_integrity');
    assert.equal(status.desired_active_aligned,false);
  } finally {fs.rmSync(r.root,{recursive:true,force:true});}
});

test('Home cannot advertise alignment when read-only recovery inspection itself fails',()=>{
  const r=rig();
  try {
    const v2=r.stage('signed-v2','release:2');
    assert.equal(r.update(v2).state,'activated_metadata');
    r.home.recoveryController={inspect(){throw new Error('recovery_read_failure');}};
    const status=r.home.status({productKey:r.productKey,nodeId:r.nodeId});
    assert.equal(status.state,'held_recovery_evidence');
    assert.equal(status.desired_active_aligned,false);
    assert.match(status.transition_recovery.reason,/recovery_read_failure/);
    assert.equal(status.runtime_health_claimed,false);
  } finally {fs.rmSync(r.root,{recursive:true,force:true});}
});

test('Home holds alignment for an outstanding recovery condition without auto-repair',()=>{
  const r=rig();
  try {
    const v2=r.stage('signed-v2','release:2');
    assert.equal(r.update(v2).state,'activated_metadata');
    r.home.recoveryController={inspect(){return {state:'held',reason:'unreconciled_recovery_intent',mutation_performed:false};}};
    const status=r.home.status({productKey:r.productKey,nodeId:r.nodeId});
    assert.equal(status.state,'held_recovery_evidence');
    assert.equal(status.desired_active_aligned,false);
    assert.equal(status.transition_recovery.mutation_performed,false);
  } finally {fs.rmSync(r.root,{recursive:true,force:true});}
});
