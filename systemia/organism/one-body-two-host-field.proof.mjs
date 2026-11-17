import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalOneBodyEnrollment, readLocalOneBodyEnrollmentCandidate,
  verifyLocalOneBodyEnrollment } from './one-body-enrollment.mjs';
import { runOneBodyCli } from './one-body-operator.mjs';
import { readOneBodyStore } from './one-body-store.mjs';
import { verifySignedBodyLaneReceipt } from './one-body-lane-signature.mjs';

const workspace=await mkdtemp(path.join(os.tmpdir(),'one-body-two-host-field-'));
const operator=path.join(workspace,'operator');
const state=path.join(operator,'state.json');
const trustFile=path.join(operator,'trusted-consumers.json');
const consumerCli=fileURLToPath(new URL('./one-body-consumer-cli.mjs',import.meta.url));
const enrollmentCli=fileURLToPath(new URL('./one-body-enrollment-preflight-cli.mjs',import.meta.url));
const hosts=[
  {id:'node001',signer:'node001:context:v1'},
  {id:'node002',signer:'node002:context:v1'},
];
try {
  await mkdir(operator,{recursive:true,mode:0o700});
  await runOneBodyCli(['init',state]);
  const fixtures=[];
  const keys={};
  for(const host of hosts) {
    // Each simulated host has a separate private storage directory and keypair.
    const dir=path.join(workspace,host.id);
    await mkdir(dir,{mode:0o700});
    const enrollment=await createLocalOneBodyEnrollment({
      consumerId:host.id,lane:'context_fabric',
      signerKeyId:host.signer,outputDir:dir,
    });
    const candidate=await readLocalOneBodyEnrollmentCandidate(enrollment.public_enrollment_file);
    const preflight=JSON.parse(execFileSync(process.execPath,[
      enrollmentCli,enrollment.public_enrollment_file,enrollment.private_signing_file,
      host.id,'context_fabric',host.signer,candidate.public_key_fingerprint_sha256,
    ],{encoding:'utf8'}));
    assert.equal(preflight.ok,true);
    assert.equal(preflight.operator_trust_registry_updated,false);
    assert.equal(preflight.remote_runtime_connected,false);
    assert.equal((await verifyLocalOneBodyEnrollment({
      publicCandidateFile:enrollment.public_enrollment_file,
      privateSigningFile:enrollment.private_signing_file,
      expectedConsumerId:host.id,expectedLane:'context_fabric',
      expectedSignerKeyId:host.signer,
      expectedFingerprint:candidate.public_key_fingerprint_sha256,
    })).local_keypair_matched,true);

    // This trust record models a distinct, deliberate operator approval.
    // The enrollment candidate itself is never sufficient for trust.
    keys[host.signer]={lane:'context_fabric',public_key_pem:candidate.public_key_pem};
    const raw={
      id:'two-host-proof-'+host.id,product:'Evercraft Clip',source:'synthetic-field-proof',
      title:'Non-executing synthetic '+host.id+' handoff',kind:'health_check',
      created_at:new Date(Date.now()-120000).toISOString(),work_required:true,
    };
    const eventFile=path.join(operator,host.id+'-event.json');
    await writeFile(eventFile,JSON.stringify(raw),{mode:0o600});
    await runOneBodyCli(['ingest',state,eventFile]);
    const events=(await readOneBodyStore(state)).state.events;
    const eventId=Object.keys(events).find(k=>events[k].source_ref &&
      JSON.stringify(events[k]).includes(raw.id));
    // Source representations may be hashed. Prefer the canonical delta.
    fixtures.push({...host,dir,enrollment,eventId,raw});
  }
  const canonical=(await readOneBodyStore(state)).state.events;
  assert.equal(Object.keys(canonical).length,2);
  const ids=Object.keys(canonical);
  assert.ok(ids.every(id=>canonical[id].lanes.includes('context_fabric')));
  for(let i=0;i<hosts.length;i++)fixtures[i].eventId=ids[i];

  // No enrolled trust, no verified acknowledgment, even though local keys exist.
  const before=await runOneBodyCli(['export',state]);
  assert.equal(before.summary.counts.consumer_receipt_verified,0);
  await writeFile(trustFile,JSON.stringify(keys),{mode:0o600});
  const receipts=[];
  for(const host of fixtures) {
    const inbox=path.join(host.dir,'inbox.json');
    const receiptPath=path.join(host.dir,'accepted.json');
    const output=JSON.parse(execFileSync(process.execPath,[
      consumerCli,state,inbox,host.eventId,'context_fabric',
      host.signer,host.enrollment.private_signing_file,receiptPath,
    ],{encoding:'utf8'}));
    assert.equal(output.accepted_to_local_inbox,true);
    assert.equal(output.work_completed,false);
    assert.equal(output.remote_delivery_verified,false);
    const receipt=JSON.parse(await readFile(receiptPath,'utf8'));
    assert.equal(receipt.signer_key_id,host.signer);
    assert.equal(verifySignedBodyLaneReceipt(receipt,{trustedConsumers:keys}),true);
    assert.equal(verifySignedBodyLaneReceipt(receipt,{trustedConsumers:{}}),false);
    receipts.push({host,receipt,receiptPath});
    const admitted=await runOneBodyCli(['ack',state,receiptPath,trustFile]);
    assert.equal(admitted.consumer_acknowledgement_recorded,true);
    assert.equal(admitted.delivery_verified,false);
    const replay=await runOneBodyCli(['ack',state,receiptPath,trustFile]);
    assert.equal(replay.persisted,false);
  }

  const all=await runOneBodyCli(['export',state,trustFile]);
  assert.equal(all.summary.counts.consumer_receipt_verified,2);
  assert.equal(all.summary.execution_authority_granted,false);
  for(const {host,receipt} of receipts) {
    assert.ok(!JSON.stringify(all).includes(host.eventId));
    assert.ok(!JSON.stringify(all).includes(receipt.receipt_ref));
  }
  // Wrong identity cannot reuse a valid signature or impersonate the other host.
  const forged={...receipts[1].receipt,signer_key_id:hosts[0].signer};
  const forgedFile=path.join(operator,'cross-host-forgery.json');
  await writeFile(forgedFile,JSON.stringify(forged),{mode:0o600});
  await assert.rejects(()=>runOneBodyCli(['ack',state,forgedFile,trustFile]),
    /lane_receipt_unverified/);
  const revBefore=(await readOneBodyStore(state)).revision;
  delete keys[hosts[1].signer];
  await writeFile(trustFile,JSON.stringify(keys),{mode:0o600});
  const after=await runOneBodyCli(['export',state,trustFile]);
  assert.equal(after.summary.counts.consumer_receipt_verified,1);
  assert.equal(after.summary.private_acknowledgement_refs_seen,2);
  assert.equal((await readOneBodyStore(state)).revision,revBefore);
  assert.equal(after.summary.execution_authority_granted,false);
  console.log(JSON.stringify({
    ok:true,schema:'evercraft.one-body.two-host-field-proof.v1',
    synthetic_hosts:2,operator_trust_revocation_observed:true,
    signed_inbox_acceptances:2,real_host_enrollment_performed:false,
    real_remote_transport_verified:false,work_completed:false,
    execution_authority_granted:false,
  },null,2));
} finally {
  await rm(workspace,{recursive:true,force:true});
}
