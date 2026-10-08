import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  dispatchPeopleEmailVerification,
  emailDestinationHash,
  verifyMailDeliveryEvidence,
} from '../systemia/people/mail-delivery.mjs';

const challenge = {
  challenge_key: 'challenge:synthetic',
  verification_path: '/people/verify-email?token=synthetic-test-token',
};

test('trusted adapter only attests provider-confirmed sends to exact recipient', async () => {
  const keys = generateKeyPairSync('ed25519');
  let sentTo='';
  let deliveryKey='';
  const evidence = await dispatchPeopleEmailVerification({
    provider:'gmail_agent',
    recipient:'  Example.Person@Example.test  ',
    challenge,
    publicOrigin:'https://people.example.test',
    privateKey:keys.privateKey,
    send:async ({to,text,idempotency_key})=>{
      sentTo=to;
      deliveryKey=idempotency_key;
      assert.match(text,/https:\/\/people\.example\.test\/people\/verify-email\?token=/);
      return {sent:true,message_ref:'gmail:synthetic-send-response'};
    },
  });
  assert.equal(sentTo,'Example.Person@Example.test');
  assert.match(deliveryKey,/^people-email-[0-9a-f]{64}$/);
  assert.equal(evidence.destination_hash,emailDestinationHash('example.person@example.test'));
  assert.equal('to' in evidence,false);
  assert.equal('verification_path' in evidence,false);
  assert.equal(verifyMailDeliveryEvidence(evidence,evidence.evidence_signature,keys.publicKey),true);
  assert.equal(verifyMailDeliveryEvidence({...evidence,message_ref:'gmail:forged'},evidence.evidence_signature,keys.publicKey),false);
  assert.equal(verifyMailDeliveryEvidence({...evidence,destination_hash:emailDestinationHash('other@example.test')},evidence.evidence_signature,keys.publicKey),false);
});

test('no attestation when provider fails, declines or yields no message id', async () => {
  const keys = generateKeyPairSync('ed25519');
  const options={provider:'resend_agent',recipient:'owner@example.test',challenge,publicOrigin:'https://people.example.test',privateKey:keys.privateKey};
  await assert.rejects(dispatchPeopleEmailVerification({...options,send:async()=>({sent:false,message_ref:'resend:not-sent'})}),/mail_provider_send_not_confirmed/);
  await assert.rejects(dispatchPeopleEmailVerification({...options,send:async()=>({sent:true})}),/mail_provider_send_not_confirmed/);
  await assert.rejects(dispatchPeopleEmailVerification({...options,send:async()=>{throw new Error('provider_down');}}),/provider_down/);
  await assert.rejects(dispatchPeopleEmailVerification({...options,publicOrigin:'http://localhost:3000',send:async()=>({sent:true,message_ref:'fake'})}),/owned_https_origin_required/);
});
