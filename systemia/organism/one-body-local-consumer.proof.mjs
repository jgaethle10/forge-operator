import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, writeFile, chmod, mkdir, rmdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runOneBodyCli } from './one-body-operator.mjs';
import { readOneBodyStore } from './one-body-store.mjs';
import { runLocalConsumerCli } from './one-body-consumer-cli.mjs';
import { acceptLocalOneBodyHandoff } from './one-body-local-consumer.mjs';

const temp=await mkdtemp(path.join(os.tmpdir(),'one-body-local-consumer-'));
const file=path.join(temp,'private','body.json');
const inbox=path.join(temp,'private','context-inbox.json');
const event=path.join(temp,'event.json');
const receipt=path.join(temp,'private','consumer-receipt.json');
const replayReceipt=path.join(temp,'private','consumer-replay.json');
const keys=path.join(temp,'private','operator-keys.json');
const secret=path.join(temp,'private','consumer-signing-private.pem');
const signer='context-fabric-local-001';
try {
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  await mkdir(path.dirname(file),{recursive:true,mode:0o700});
  await writeFile(secret,privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
  await writeFile(keys,JSON.stringify({
    [signer]:{lane:'context_fabric',public_key_pem:publicKey.export({type:'spki',format:'pem'})}
  }),{mode:0o600});
  await runOneBodyCli(['init',file]);
  const raw={
    id:'local-consumer-e2e-1',product:'Evercraft Clip',source:'proof-only',
    kind:'health_check',created_at:new Date(Date.now()-120000).toISOString(),
    title:'Synthetic local acceptance proof',work_required:true,
  };
  await writeFile(event,JSON.stringify(raw),{mode:0o600});
  await runOneBodyCli(['ingest',file,event]);
  const body=await readOneBodyStore(file);
  const eventId=Object.keys(body.state.events)[0];
  assert.ok(eventId);
  assert.ok(body.state.events[eventId].lanes.includes('context_fabric'));

  await assert.rejects(()=>runLocalConsumerCli([
    file,inbox,eventId,'payment_authority_reconciliation',signer,secret,receipt
  ]),/lane_not_routed/);
  await assert.rejects(()=>runLocalConsumerCli([
    file,inbox,'unknown-id','context_fabric',signer,secret,receipt
  ]),/unknown_body_event/);

  await mkdir(inbox+'.lock');
  await assert.rejects(()=>runLocalConsumerCli([
    file,inbox,eventId,'context_fabric',signer,secret,receipt
  ]),/consumer_inbox_locked_requires_review/);
  await rmdir(inbox+'.lock');

  const cli=fileURLToPath(new URL('./one-body-consumer-cli.mjs',import.meta.url));
  const outcome=JSON.parse(execFileSync(process.execPath,
    [cli,file,inbox,eventId,'context_fabric',signer,secret,receipt],
    {encoding:'utf8'}));
  assert.equal(outcome.accepted_to_local_inbox,true);
  assert.equal(outcome.work_completed,false);
  assert.equal(outcome.execution_authority_granted,false);
  assert.equal(outcome.remote_delivery_verified,false);
  const filemode=(await stat(receipt)).mode & 0o777;
  assert.equal(filemode,0o600);
  const proof=JSON.parse(await readFile(receipt,'utf8'));
  assert.equal(proof.event_id,eventId);
  assert.equal(proof.lane,'context_fabric');
  assert.equal(proof.signer_key_id,signer);

  await assert.rejects(()=>runLocalConsumerCli([
    file,inbox,eventId,'context_fabric',signer,secret,receipt
  ]),/receipt_output_already_exists/);
  const replay=await runLocalConsumerCli([
    file,inbox,eventId,'context_fabric',signer,secret,replayReceipt
  ]);
  assert.equal(replay.replayed,true);
  assert.deepEqual(JSON.parse(await readFile(replayReceipt,'utf8')),proof);
  const accepted=await runOneBodyCli(['ack',file,receipt,keys]);
  assert.equal(accepted.consumer_acknowledgement_recorded,true);
  assert.equal(accepted.delivery_verified,false);
  const visual=await runOneBodyCli(['export',file,keys]);
  assert.equal(visual.summary.counts.consumer_receipt_verified,1);
  assert.equal(visual.summary.execution_authority_granted,false);
  assert.ok(!JSON.stringify(visual).includes(eventId));
  assert.ok(!JSON.stringify(visual).includes(proof.receipt_ref));

  await chmod(secret,0o644);
  await assert.rejects(()=>acceptLocalOneBodyHandoff({
    bodyStateFile:file,inboxFile:inbox,eventId,lane:'context_fabric',
    signerKeyId:signer,signerPrivateKeyFile:secret
  }),/consumer_private_file_permissions_too_broad/);
  await chmod(secret,0o600);
  await writeFile(keys,JSON.stringify({}));
  const revoked=await runOneBodyCli(['export',file,keys]);
  assert.equal(revoked.summary.counts.consumer_receipt_verified,0);
  assert.equal(revoked.summary.private_acknowledgement_refs_seen,1);
  assert.equal((await readOneBodyStore(file)).revision,3);
  console.log(JSON.stringify({
    ok:true,schema:'evercraft.one-body.local-consumer-proof.v1',
    checks:[
      'only routes admitted in canonical One-Body state are accepted',
      'consumer inbox lock fails closed',
      'durable local inbox acceptance before receipt signature',
      'receipt exported create-only into private file',
      'idempotent replay generates same acknowledgement',
      'signed receipt flows through canonical operator admission',
      'read-only graph reports verified consumer inbox acknowledgement',
      'private signing key mode enforced',
      'revoking consumer key removes verification without history rewrite',
      'no work completion, remote delivery or execution authority claimed',
    ]
  },null,2));
} finally {
  await rm(temp,{recursive:true,force:true});
}
