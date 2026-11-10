import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import {mkdtemp, readFile, writeFile, chmod, mkdir, rmdir, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readOneBodyStore,mutateOneBodyStateFile} from './one-body-store.mjs';
import {runOneBodyCli} from './one-body-operator.mjs';
import {bodyLaneReceiptSigningMessage} from './one-body-lane-signature.mjs';

const temp=await mkdtemp(path.join(os.tmpdir(),'evercraft-onebody-proof-'));
const file=path.join(temp,'private','state.json');
const eventFile=path.join(temp,'event.json');
const receiptFile=path.join(temp,'receipt.json');
const trustFile=path.join(temp,'trusted-consumers.json');
const now=Date.now();
const time=delta=>new Date(now+delta).toISOString();
try {
  const initialized=await runOneBodyCli(['init',file]);
  assert.equal(initialized.revision,1);
  assert.equal((await readOneBodyStore(file)).state.schema,'evercraft.one-body.state.v1');
  await assert.rejects(()=>runOneBodyCli(['init',file]),/one_body_state_exists/);
  const event={
    id:'source-event-001',product:'Evercraft Clip',source:'owned-test-runtime',
    title:'A synthetic routing event',kind:'health_check',created_at:time(-120000),
    evidence_state:'generated',work_required:true
  };
  await writeFile(eventFile,JSON.stringify(event),{mode:0o600});
  // Lock is an actual cross-process single-writer fence, not just a revision field.
  await mkdir(file+'.lock');
  await assert.rejects(()=>runOneBodyCli(['ingest',file,eventFile]),/one_body_state_locked_requires_review/);
  await rmdir(file+'.lock');
  const ingest=await runOneBodyCli(['ingest',file,eventFile]);
  assert.equal(ingest.revision,2);
  assert.equal(ingest.execution_authority_granted,false);
  const store2=await readOneBodyStore(file);
  assert.equal(Object.keys(store2.state.events).length,1);
  const item=Object.values(store2.state.events)[0];
  assert.ok(item.lanes.includes('context_fabric'));
  assert.equal(item.repeat_count,1);
  const again=await runOneBodyCli(['ingest',file,eventFile]);
  assert.equal(again.revision,3);
  const store3=await readOneBodyStore(file);
  assert.equal(Object.keys(store3.state.events).length,1);
  assert.equal(Object.values(store3.state.events)[0].repeat_count,2);
  await assert.rejects(()=>mutateOneBodyStateFile(file,state=>{
    state.events={};
    return state;
  }),/one_body_event_rewrite_or_deletion_forbidden/);
  assert.equal((await readOneBodyStore(file)).revision,3);

  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const claims={
    schema:'evercraft.one-body.lane-consumer-receipt.v1',event_id:item.event_id,
    lane:'context_fabric',receipt_ref:'private-consumer-receipt-001',
    observed_at:time(-30000),signer_key_id:'owned-context-fabric',
  };
  const receipt={...claims,signature_base64:sign(null,
    bodyLaneReceiptSigningMessage(claims),privateKey).toString('base64')};
  await writeFile(receiptFile,JSON.stringify(receipt),{mode:0o600});
  const keys={'owned-context-fabric':{
    lane:'context_fabric',public_key_pem:publicKey.export({type:'spki',format:'pem'})
  }};
  await writeFile(trustFile,JSON.stringify(keys),{mode:0o600});
  const untrusted=await runOneBodyCli(['export',file]);
  assert.equal(untrusted.summary.counts.consumer_receipt_verified,0);
  const admitted=await runOneBodyCli(['ack',file,receiptFile,trustFile]);
  assert.equal(admitted.revision,4);
  assert.equal(admitted.consumer_acknowledgement_recorded,true);
  assert.equal(admitted.delivery_verified,false);
  const repeat=await runOneBodyCli(['ack',file,receiptFile,trustFile]);
  assert.equal(repeat.persisted,false);
  assert.equal(repeat.revision,4);
  const verified=await runOneBodyCli(['export',file,trustFile]);
  assert.equal(verified.summary.counts.consumer_receipt_verified,1);
  assert.equal(verified.summary.private_acknowledgement_refs_seen,1);
  assert.equal(verified.summary.execution_authority_granted,false);
  assert.ok(!JSON.stringify(verified).includes(claims.receipt_ref));
  assert.ok(!JSON.stringify(verified).includes(item.event_id));
  const cli=fileURLToPath(new URL('./one-body-operator.mjs',import.meta.url));
  const newProcess=JSON.parse(execFileSync(process.execPath,
    [cli,'export',file,trustFile],{encoding:'utf8'}));
  assert.equal(newProcess.summary.counts.consumer_receipt_verified,1);
  assert.equal((await readOneBodyStore(file)).revision,4);

  const forged={...receipt,receipt_ref:'tampered-ref'};
  await writeFile(receiptFile,JSON.stringify(forged));
  await assert.rejects(()=>runOneBodyCli(['ack',file,receiptFile,trustFile]),
    /lane_receipt_unverified/);
  assert.equal((await readOneBodyStore(file)).revision,4);
  await chmod(trustFile,0o644);
  await assert.rejects(()=>runOneBodyCli(['export',file,trustFile]),
    /trusted_registry_permissions_too_broad/);
  await chmod(trustFile,0o600);
  await writeFile(trustFile,JSON.stringify({}));
  const revoked=await runOneBodyCli(['export',file,trustFile]);
  assert.equal(revoked.summary.counts.consumer_receipt_verified,0);
  assert.equal(revoked.summary.private_acknowledgement_refs_seen,1);
  assert.equal((await readOneBodyStore(file)).revision,4);
  console.log(JSON.stringify({
    ok:true,schema:'evercraft.one-body.durable-store-proof.v1',
    checks:['atomic private state create','single-writer lock','event replay suppression',
      'forward-only event identity','signed exact-lane consumer receipt',
      'durable acknowledgement persists across process restart',
      'duplicate acknowledgement idempotency','tamper rejection with unchanged revision',
      'operator-owned private trust registry','read-side key revocation fails closed',
      'no billing, dispatch or delivery authority'],
  },null,2));
} finally {
  await rm(temp,{recursive:true,force:true});
}
