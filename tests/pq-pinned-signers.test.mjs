import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePqRecipient,pqRuntime} from '../systemia/crypto/pq-envelope.mjs';
import {
  generatePqSigner,signAndEncryptPqMessage,createLabMemoryReplayGuard
} from '../systemia/crypto/pq-signed-envelope.mjs';
import {
  createPinnedPqSignerRegistry,openPinnedPqMessageAsync
} from '../systemia/crypto/pq-pinned-signers.mjs';

test('pinned signer snapshots require explicit finite trust and key validity', {skip:!pqRuntime().available},()=>{
  const now=Date.now();
  const alice=generatePqSigner();
  const entry={
    sender:'alice',publicKey:alice.publicKey,keyId:alice.senderKeyId,
    status:'active',notBeforeMs:now-60000,notAfterMs:now+600000
  };
  const params={entries:[entry],snapshotValidFromMs:now-10000,snapshotValidUntilMs:now+600000};
  const registry=createPinnedPqSignerRegistry(params);
  assert.equal(registry.resolve({sender:'alice',keyId:alice.senderKeyId,nowMs:now}),alice.publicKey);
  assert.equal(registry.resolve({sender:'mallory',keyId:alice.senderKeyId,nowMs:now}),null);
  assert.equal(registry.resolve({sender:'alice',keyId:alice.senderKeyId,nowMs:now+600000}),null);
  assert.throws(()=>createPinnedPqSignerRegistry({...params,entries:[entry,entry]}),/Duplicate/);
  assert.throws(()=>createPinnedPqSignerRegistry({...params,entries:[{...entry,keyId:'a'.repeat(64)}]}),/fingerprint/);
  assert.throws(()=>createPinnedPqSignerRegistry({...params,snapshotValidUntilMs:now+16*60*1000}),/15-minute/);
  assert.equal(createPinnedPqSignerRegistry({...params,entries:[{...entry,status:'revoked'}]})
    .resolve({sender:'alice',keyId:alice.senderKeyId,nowMs:now}),null);
});

test('pinned ML-DSA rotation and revocation gate actual signed encrypted messages',{skip:!pqRuntime().available},async()=>{
  const now=Date.now();
  const recipient=generatePqRecipient();
  const oldSigner=generatePqSigner();
  const newSigner=generatePqSigner();
  const oldMessage=signAndEncryptPqMessage({
    senderPrivateKey:oldSigner.privateKey,sender:'node001',
    recipientPublicKey:recipient.publicKey,plaintext:'old signed payload',
    context:'systemia.lab.pinned',nowMs:now,ttlSeconds:60
  });
  const newMessage=signAndEncryptPqMessage({
    senderPrivateKey:newSigner.privateKey,sender:'node001',
    recipientPublicKey:recipient.publicKey,plaintext:'new signed payload',
    context:'systemia.lab.pinned',nowMs:now,ttlSeconds:60
  });
  const oldPin={
    sender:'node001',keyId:oldSigner.senderKeyId,publicKey:oldSigner.publicKey,
    status:'active',notBeforeMs:now-10000,notAfterMs:now+120000
  };
  const newPin={
    sender:'node001',keyId:newSigner.senderKeyId,publicKey:newSigner.publicKey,
    status:'active',notBeforeMs:now-10000,notAfterMs:now+120000
  };
  const base={snapshotValidFromMs:now-10000,snapshotValidUntilMs:now+120000};
  const firstRegistry=createPinnedPqSignerRegistry({...base,entries:[oldPin]});
  const replayGuard=createLabMemoryReplayGuard();
  const open=(registry,signedMessage,changes={})=>openPinnedPqMessageAsync({
    registry,signedMessage,expectedSender:'node001',
    recipientPrivateKey:recipient.privateKey,expectedContext:'systemia.lab.pinned',
    replayGuard,nowMs:now,...changes
  });
  assert.equal((await open(firstRegistry,oldMessage)).plaintext.toString(),'old signed payload');
  await assert.rejects(open(firstRegistry,newMessage),/rejected/);
  await assert.rejects(open(firstRegistry,oldMessage),/rejected/);

  // An external approval process would replace the snapshot during rotation.
  const rotated=createPinnedPqSignerRegistry({
    ...base,entries:[{...oldPin,status:'revoked'},newPin]
  });
  await assert.rejects(open(rotated,oldMessage,{replayGuard:createLabMemoryReplayGuard()}),/rejected/);
  assert.equal((await open(rotated,newMessage)).plaintext.toString(),'new signed payload');
  await assert.rejects(open(rotated,newMessage,{nowMs:now+121000}),/rejected/);
  await assert.rejects(open(rotated,newMessage,{expectedSender:'another-node'}),/rejected/);
  await assert.rejects(open(null,newMessage),/rejected/);
});
