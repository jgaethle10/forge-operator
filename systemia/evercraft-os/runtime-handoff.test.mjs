import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync, sign } from 'node:crypto';
import { EvercraftPassport } from '../passport/passport.mjs';
import { buildPackageAttestationBody, buildPublisherTrustStore, evercraftOsSha256, signPackageAttestation } from './package-trust.mjs';
import { EvercraftOsPackageTransitionLedger } from './package-transition-ledger.mjs';
import { EvercraftOsPackageStore } from './package-store.mjs';
import { EvercraftHomePackageLifecycle } from './home-package-lifecycle.mjs';
import { EvercraftHomePackageOrchestrator } from './home-package-orchestrator.mjs';
import { createTestAnchoredTrustProvider } from './publisher-trust-test-helper.mjs';
import { EvercraftOsRuntimeHandoff } from './runtime-handoff.mjs';
import { captureCurrentProcessInstance } from './process-instance.mjs';

const NOW = new Date('2026-10-11T12:00:00.000Z');
const sample = evercraftOsSha256('test-evidence-reference');
const next = evercraftOsSha256('different-evidence-reference');
function canonical(x) { return Array.isArray(x) ? x.map(canonical) : x && typeof x==='object' ? Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])) : x; }
function fixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-os-runtime-'));
  const publisher=generateKeyPairSync('ed25519');
  const nodeKey=generateKeyPairSync('ed25519');
  const provider=createTestAnchoredTrustProvider({stateDir:path.join(root,'trust'), trustStore:buildPublisherTrustStore({keys:[{
    key_id:'handoff-key',publisher_ref:'publisher:fixture',public_key_pem:publisher.publicKey.export({format:'pem',type:'spki'}),allowed_products:['proof-app']
  }]})}).provider;
  const passport=new EvercraftPassport({stateDir:path.join(root,'passport')});
  const baseline=evercraftOsSha256('initial-v1');
  const ledger=new EvercraftOsPackageTransitionLedger({stateDir:path.join(root,'ledger'),passport,installedStateProvider:{currentState:()=>({installed:true,package_fingerprint:baseline})}});
  const store=new EvercraftOsPackageStore({rootDir:path.join(root,'store'),trustProvider:provider});
  const lifecycle=new EvercraftHomePackageLifecycle({transitionLedger:ledger,trustProvider:provider});
  const home=new EvercraftHomePackageOrchestrator({lifecycle,packageStore:store,transitionLedger:ledger});
  const handoff=new EvercraftOsRuntimeHandoff({home,packageStore:store,pinnedNodePublicKeys:{'node-A':nodeKey.publicKey.export({format:'pem',type:'spki'})}});
  const subjectRef='subject:owner';
  function initialize(){
    const data=Buffer.from('signed-v2');const hash=evercraftOsSha256(data);
    const body=buildPackageAttestationBody({productKey:'proof-app',packageFingerprint:hash,contractVersion:'2.0.0',releaseRef:'release:2',publisherRef:'publisher:fixture',keyId:'handoff-key',artifactHashes:[hash],issuedAt:new Date('2026-10-10T00:00:00Z'),expiresAt:new Date('2026-11-01T00:00:00Z')});
    const attestation=signPackageAttestation({body,privateKeyPem:publisher.privateKey.export({format:'pem',type:'pkcs8'})});
    const prep=home.stageAndPrepareUpdate({productKey:'proof-app',nodeId:'node-A',subjectRef,attestation,artifacts:[{bytes:data}],now:NOW});
    assert.equal(prep.state,'prepared');
    const authNow=new Date();
    const grant=passport.issueGrant({idempotency_key:'grant-1',subject_ref:subjectRef,issuer_ref:'proof:identity',product:'evercraft-os',scopes:['app.update'],resource_refs:['os-app:proof-app:node:node-A'],starts_at:new Date(authNow.getTime()-60000).toISOString(),ends_at:new Date(authNow.getTime()+86400000).toISOString(),max_delegation_depth:0,authority_state:'system_policy_authorized',authority_receipt_ref:'proof:fixture'}).grant;
    const permit=passport.mintActionPermit({idempotency_key:'permit-1',grant_id:grant.grant_id,actor_ref:subjectRef,scope:'app.update',resource_ref:'os-app:proof-app:node:node-A',request_fingerprint:prep.preparation.plan.request_fingerprint,ttl_seconds:900,minted_at:authNow.toISOString()}).permit;
    // The recovered Passport uses wall-clock evaluation during update. Mint/consume at a current instant using an extended grant if needed.
    const result=home.applyPreparedUpdate({plan:prep.preparation.plan,permitId:permit.permit_id,actorRef:subjectRef});
    assert.equal(result.state,'activated_metadata');
    return hash;
  }
  const args={productKey:'proof-app',nodeId:'node-A',subjectRef,capabilityRef:'capsule:read-only',capsuleContractHash:sample,systemiaMissionReceiptHash:sample,executionPolicyHash:sample,deviceAttestationHash:sample,now:NOW};
  function prepare(){ const r=handoff.prepare(args);assert.equal(r.state,'prepared_for_independent_gate_review',r.reason);return r.plan; }
  function claim(plan, overrides={}) {
    const body={schema:'evercraft.os.runtime-process-observation.v1',node_id:plan.node_id,product_key:plan.product_key,package_fingerprint:plan.package_fingerprint,activation_hash:plan.activation_hash,transition_receipt_hash:plan.transition_receipt_hash,request_fingerprint:plan.request_fingerprint,nonce:plan.nonce,process_instance:captureCurrentProcessInstance(),observed_at:NOW.toISOString(),expires_at:new Date(NOW.getTime()+30000).toISOString(),...overrides};
    return {schema:'evercraft.os.runtime-process-signed-observation.v1',signature_algorithm:'ed25519',body,signature_base64:sign(null,Buffer.from(JSON.stringify(canonical(body))),nodeKey.privateKey).toString('base64')};
  }
  return {root,store,home,ledger,provider,handoff,passport,args,prepare,initialize,claim,subjectRef};
}
function run(title,body){ test(title,()=>{const f=fixture();try{body(f);}finally{fs.rmSync(f.root,{recursive:true,force:true});}}); }

run('handoff refuses preparation for an uninstalled/unactivated package',f=>{
  assert.match(f.handoff.prepare(f.args).reason,/home_runtime_not_aligned/);
});
run('aligned signed package produces only a review plan, no permit or execution authority',f=>{
  f.initialize();const p=f.prepare();
  assert.equal(p.execution_authority_granted,false);
  assert.equal(p.systemia_authority_verified,false);
  assert.equal(p.execution_gate_authority_verified,false);
  assert.equal(f.handoff.revalidate({plan:p,subjectRef:f.subjectRef,now:NOW}).state,'still_prepared_for_independent_gate_review');
  assert.equal(f.passport.permitConsumptions.size,1); // update only, no runtime permit consumed
});
run('plan uses unique challenge nonce even when package and policy inputs repeat',f=>{
  f.initialize();const a=f.prepare(),b=f.prepare();assert.notEqual(a.nonce,b.nonce);assert.notEqual(a.request_fingerprint,b.request_fingerprint);
});
run('plan cannot move between subjects or devices',f=>{
  f.initialize();const p=f.prepare();
  assert.match(f.handoff.revalidate({plan:p,subjectRef:'subject:someone-else',now:NOW}).reason,/subject_mismatch/);
  const copy={...p,node_id:'node-B'};
  assert.match(f.handoff.revalidate({plan:copy,subjectRef:f.subjectRef,now:NOW}).reason,/hash_mismatch/);
});
run('plan hash protects external reference fields and authority flags',f=>{
  f.initialize();const p=f.prepare();
  assert.match(f.handoff.revalidate({plan:{...p,execution_policy_hash:next},subjectRef:f.subjectRef,now:NOW}).reason,/hash_mismatch/);
  assert.match(f.handoff.revalidate({plan:{...p,execution_authority_granted:true},subjectRef:f.subjectRef,now:NOW}).reason,/hash_mismatch/);
});
run('re-hashing an unauthorized authority-bearing plan is still refused',f=>{
  f.initialize();const p=f.prepare();const {request_fingerprint,...body}=p;
  body.execution_authority_granted=true;
  assert.match(f.handoff.revalidate({plan:{...body,request_fingerprint:evercraftOsSha256(body)},subjectRef:f.subjectRef,now:NOW}).reason,/authority_contract_invalid/);
});
run('plan expires precisely and rejects future-issued plan replays',f=>{
  f.initialize();const p=f.prepare();
  assert.match(f.handoff.revalidate({plan:p,subjectRef:f.subjectRef,now:new Date(NOW.getTime()+300000)}).reason,/expired_or_clock_invalid/);
  assert.match(f.handoff.revalidate({plan:p,subjectRef:f.subjectRef,now:new Date(NOW.getTime()-1)}).reason,/expired_or_clock_invalid/);
});
run('transition checkpoint corruption holds prepared handoff',f=>{
  f.initialize();const p=f.prepare(),h=path.join(f.root,'ledger','package-transition-head.json');
  const old=JSON.parse(fs.readFileSync(h,'utf8'));fs.writeFileSync(h,JSON.stringify({...old,event_count:300}));
  assert.match(f.handoff.revalidate({plan:p,subjectRef:f.subjectRef,now:NOW}).reason,/not_aligned/);
});
run('activation integrity corruption holds prepared handoff',f=>{
  f.initialize();const p=f.prepare(),h=f.store.activationPath('proof-app','node-A');
  const old=JSON.parse(fs.readFileSync(h,'utf8'));fs.writeFileSync(h,JSON.stringify({...old,activation_hash:next}));
  assert.match(f.handoff.revalidate({plan:p,subjectRef:f.subjectRef,now:NOW}).reason,/not_aligned/);
});
run('process observation requires a pinned node identity key',f=>{
  f.initialize();const p=f.prepare();const other=new EvercraftOsRuntimeHandoff({home:f.home,packageStore:f.store});
  assert.match(other.inspectSignedProcessClaim({plan:p,subjectRef:f.subjectRef,observation:f.claim(p),now:NOW}).reason,/node_identity_key_not_pinned/);
});
run('pinned Ed25519 claim plus same live process identity is authenticated evidence, not health',f=>{
  f.initialize();const p=f.prepare();const state=f.handoff.inspectSignedProcessClaim({plan:p,subjectRef:f.subjectRef,observation:f.claim(p),now:NOW});
  assert.equal(state.state,'authenticated_process_identity_observed',state.reason);
  assert.equal(state.local_process_instance_verified,true);
  assert.equal(state.process_started_claimed,false);
  assert.equal(state.runtime_health_claimed,false);
  assert.equal(state.execution_authority_granted,false);
});
run('signed observation cannot be swapped onto another plan',f=>{
  f.initialize();const p=f.prepare(),claim=f.claim(p),other=f.prepare();
  assert.match(f.handoff.inspectSignedProcessClaim({plan:other,subjectRef:f.subjectRef,observation:claim,now:NOW}).reason,/binding_mismatch/);
});
run('forged signed process observation is refused',f=>{
  f.initialize();const p=f.prepare(),claim=f.claim(p);
  claim.body.process_instance.pid=1;
  assert.match(f.handoff.inspectSignedProcessClaim({plan:p,subjectRef:f.subjectRef,observation:claim,now:NOW}).reason,/signature_not_verified/);
});
run('old signed process observation is refused even with genuine key',f=>{
  f.initialize();const p=f.prepare();const claim=f.claim(p,{observed_at:new Date(NOW.getTime()-60000).toISOString(),expires_at:new Date(NOW.getTime()-30000).toISOString()});
  assert.match(f.handoff.inspectSignedProcessClaim({plan:p,subjectRef:f.subjectRef,observation:claim,now:NOW}).reason,/not_fresh/);
});
run('signed claim about a different PID instance is held, not counted as running',f=>{
  f.initialize();const p=f.prepare();const instance=captureCurrentProcessInstance();
  const claim=f.claim(p,{process_instance:{...instance,proc_start_ticks:'1'}});
  const state=f.handoff.inspectSignedProcessClaim({plan:p,subjectRef:f.subjectRef,observation:claim,now:NOW});
  assert.equal(state.state,'held');assert.equal(state.local_process_instance_verified,false);assert.equal(state.runtime_health_claimed,false);
});
run('signed claim for changed package fingerprint is refused',f=>{
  f.initialize();const p=f.prepare();const claim=f.claim(p,{package_fingerprint:next});
  assert.match(f.handoff.inspectSignedProcessClaim({plan:p,subjectRef:f.subjectRef,observation:claim,now:NOW}).reason,/binding_mismatch/);
});
run('execution policy fingerprint must be syntactically exact, not arbitrary string',f=>{
  f.initialize();assert.match(f.handoff.prepare({...f.args,executionPolicyHash:'policy:admin'}).reason,/execution_policy_hash_invalid/);
});
run('held external recovery evidence stops handoff despite aligned metadata',f=>{
  f.initialize();f.home.recoveryController={inspect(){return {state:'held',reason:'unresolved_recovery'};}};
  assert.match(f.handoff.prepare(f.args).reason,/not_aligned/);
});
run('a newly present transition writer lock blocks an otherwise valid preflight plan',f=>{
  f.initialize();const p=f.prepare();
  fs.writeFileSync(f.ledger.writerLockFile,JSON.stringify({schema:'evercraft.os.package-transition-writer-lock.v2',lock_token:'test-lock',operation:'update',pid:999999}));
  assert.match(f.handoff.revalidate({plan:p,subjectRef:f.subjectRef,now:NOW}).reason,/not_aligned/);
});
run('a replaced staged blob with matching path but corrupted content blocks handoff',f=>{
  f.initialize();const p=f.prepare();const staged=f.store.packagePath('proof-app',p.package_fingerprint);
  const dir=path.join(staged,'blobs');const file=path.join(dir,fs.readdirSync(dir)[0]);
  fs.writeFileSync(file,'tampered payload');
  assert.match(f.handoff.revalidate({plan:p,subjectRef:f.subjectRef,now:NOW}).reason,/not_aligned|staged_package_not_verified/);
});
run('signed observation cannot use wrong pinned node private key',f=>{
  f.initialize();const p=f.prepare();const claim=f.claim(p);
  const foreign=generateKeyPairSync('ed25519');
  claim.signature_base64=sign(null,Buffer.from(JSON.stringify(canonical(claim.body))),foreign.privateKey).toString('base64');
  assert.match(f.handoff.inspectSignedProcessClaim({plan:p,subjectRef:f.subjectRef,observation:claim,now:NOW}).reason,/signature_not_verified/);
});
run('signed claim cannot promote itself to execution authority',f=>{
  f.initialize();const p=f.prepare();const claim=f.claim(p,{execution_authority_granted:true,runtime_health_claimed:true});
  const state=f.handoff.inspectSignedProcessClaim({plan:p,subjectRef:f.subjectRef,observation:claim,now:NOW});
  assert.equal(state.state,'authenticated_process_identity_observed');
  assert.equal(state.execution_authority_granted,false);
  assert.equal(state.runtime_health_claimed,false);
});
run('malformed externally supplied device-attestation reference is held',f=>{
  f.initialize();const out=f.handoff.prepare({...f.args,deviceAttestationHash:'sha256:123'});
  assert.equal(out.state,'held'); assert.match(out.reason,/device_attestation_hash_invalid/);
});
run('revalidating a candidate on a different product after forged rehash cannot fake alignment',f=>{
  f.initialize();const p=f.prepare();const {request_fingerprint,...body}=p;body.product_key='other-product';
  const changed={...body,request_fingerprint:evercraftOsSha256(body)};
  assert.match(f.handoff.revalidate({plan:changed,subjectRef:f.subjectRef,now:NOW}).reason,/not_aligned/);
});
