import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePqRecipient,pqRuntime} from '../systemia/crypto/pq-envelope.mjs';
import {
  generatePqSigner,signAndEncryptPqMessage,openSignedPqMessage,
  createLabMemoryReplayGuard
} from '../systemia/crypto/pq-signed-envelope.mjs';

test('lab replay guard is bounded and never silently admits duplicates', () => {
  const guard=createLabMemoryReplayGuard({maxEntries:1});
  const sample={senderId:'alice',senderKeyId:'key',context:'lab.route',nonce:'a',expiresAtMs:5000,nowMs:1000};
  assert.equal(guard.consume(sample),true);
  assert.equal(guard.consume(sample),false);
  assert.equal(guard.consume({...sample,nonce:'b'}),false);
  assert.equal(guard.consume({...sample,nonce:'b',nowMs:5000,expiresAtMs:8000}),true);
  assert.throws(()=>createLabMemoryReplayGuard({maxEntries:0}),/capacity/);
});

test('ML-DSA-65 sender authenticity, PQ confidentiality, TTL and replay checks', {skip:!pqRuntime().available}, () => {
  const now=Date.now();
  const recipient=generatePqRecipient();
  const alice=generatePqSigner();
  const mallory=generatePqSigner();
  const signed=signAndEncryptPqMessage({
    senderPrivateKey:alice.privateKey,sender:'alice',recipientPublicKey:recipient.publicKey,
    plaintext:'Authenticated Evercraft lab message',context:'systemia.lab.chat',nowMs:now,ttlSeconds:60
  });
  const guard=createLabMemoryReplayGuard();
  const open=(message=signed,changes={})=>openSignedPqMessage({
    signedMessage:message,senderPublicKey:alice.publicKey,expectedSender:'alice',
    recipientPrivateKey:recipient.privateKey,expectedContext:'systemia.lab.chat',
    replayGuard:guard,nowMs:now,...changes
  });
  const result=open();
  assert.equal(result.plaintext.toString(),'Authenticated Evercraft lab message');
  assert.equal(result.senderKeyId,alice.senderKeyId);
  assert.equal(guard.size(),1);
  assert.throws(()=>open(),/rejected/);
  assert.throws(()=>open(signed,{expectedSender:'mallory'}),/rejected/);
  assert.throws(()=>open(signed,{senderPublicKey:mallory.publicKey}),/rejected/);
  assert.throws(()=>open(signed,{replayGuard:null}),/rejected/);
  assert.throws(()=>open(signed,{expectedContext:'systemia.lab.other'}),/rejected/);

  const tampered=structuredClone(signed);
  tampered.payload.envelope.ciphertext='AA';
  assert.throws(()=>open(tampered,{replayGuard:createLabMemoryReplayGuard()}),/rejected/);
  const tamperedSignature=structuredClone(signed);
  tamperedSignature.signature='AA';
  assert.throws(()=>open(tamperedSignature,{replayGuard:createLabMemoryReplayGuard()}),/rejected/);

  const expired=signAndEncryptPqMessage({
    senderPrivateKey:alice.privateKey,sender:'alice',recipientPublicKey:recipient.publicKey,
    plaintext:'expired',context:'systemia.lab.chat',nowMs:now-10_000,ttlSeconds:1
  });
  assert.throws(()=>open(expired,{replayGuard:createLabMemoryReplayGuard()}),/rejected/);
  const future=signAndEncryptPqMessage({
    senderPrivateKey:alice.privateKey,sender:'alice',recipientPublicKey:recipient.publicKey,
    plaintext:'future',context:'systemia.lab.chat',nowMs:now+60_000,ttlSeconds:60
  });
  assert.throws(()=>open(future,{replayGuard:createLabMemoryReplayGuard()}),/rejected/);
  assert.throws(()=>signAndEncryptPqMessage({
    senderPrivateKey:alice.privateKey,sender:'alice',recipientPublicKey:recipient.publicKey,
    plaintext:'invalid ttl',context:'systemia.lab.chat',ttlSeconds:3601
  }),/TTL/);
});
