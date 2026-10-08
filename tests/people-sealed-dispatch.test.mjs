import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { startPeopleLayerRuntime } from '../systemia/people/service-runtime.mjs';
import { emailDestinationHash, signMailDeliveryEvidence } from '../systemia/people/mail-delivery.mjs';

test('mailbox redemption secret is never returned to an operator',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'people-sealed-dispatch-'));
  const authority=randomBytes(32).toString('hex');
  const authorityFile=path.join(root,'authority');
  fs.writeFileSync(authorityFile,authority,{mode:0o600});
  const keys=generateKeyPairSync('ed25519');
  const keysFile=path.join(root,'mail-keys.json');
  fs.writeFileSync(keysFile,JSON.stringify({resend_agent:keys.publicKey.export({format:'pem',type:'spki'})}),{mode:0o600});
  let recipientLink='';
  const service=await startPeopleLayerRuntime({
    stateDir:path.join(root,'state'),adminTokenFile:authorityFile,
    mailDeliveryPublicKeysFile:keysFile,publicOrigin:'https://people.example.test',
    mailDispatcher:async({recipient,challenge})=>{
      if(recipient==='rejected@example.test'){
        const rejectedEvidence={
          challenge_key:challenge.challenge_key,
          destination_hash:emailDestinationHash(recipient),
          provider:'resend_agent',status:'sent',message_ref:'resend:synthetic-rejected',
          evidence_signature:'not-valid',
        };
        return rejectedEvidence;
      }
      assert.equal(recipient,'pilot@example.test');
      recipientLink=challenge.raw_token;
      const evidence={
        challenge_key:challenge.challenge_key,
        destination_hash:emailDestinationHash(recipient),
        provider:'resend_agent',status:'sent',message_ref:'resend:synthetic-id',
      };
      return {...evidence,evidence_signature:signMailDeliveryEvidence(evidence,keys.privateKey)};
    },
  });
  const api=async(route,payload,admin=true)=>{
    const response=await fetch(service.service_url+route,{
      method:'POST',
      headers:{'content-type':'application/json',...(admin?{authorization:'Bearer '+authority}:{})},
      body:JSON.stringify(payload),
    });
    return {status:response.status,json:await response.json()};
  };
  try{
    const created=await api('/api/people/brains',{display_name:'Synthetic Test Owner'});
    assert.equal(created.status,201);
    const key=created.json.brain.brain_key;
    const invited=await api('/api/people/brains/'+encodeURIComponent(key)+'/invite',{});
    const accepted=await api('/api/people/consent/accept',{
      token:invited.json.invite.raw_token,
      accept_ownership:true,accept_scopes:true,confirmation_text:'I ACCEPT',
    },false);
    assert.equal(accepted.status,200);
    const dispatched=await api('/api/people/brains/'+encodeURIComponent(key)+'/email-challenge',{email:'pilot@example.test'});
    assert.equal(dispatched.status,201);
    assert.equal(dispatched.json.challenge.delivery_state,'sent');
    assert.equal(dispatched.json.delivery.provider,'resend_agent');
    assert.equal('raw_token' in dispatched.json.challenge,false);
    assert.equal('verification_path' in dispatched.json.challenge,false);
    assert.equal(JSON.stringify(dispatched.json).includes(recipientLink),false);
    const verified=await api('/api/people/verify-email/verify',{
      token:recipientLink,confirmation_text:'VERIFY MY EMAIL',
    },false);
    assert.equal(verified.status,200);
    assert.equal(verified.json.brain.identity_assurance,'verified_email');
    const failed=await api('/api/people/brains/'+encodeURIComponent(key)+'/email-challenge',{email:'rejected@example.test'});
    assert.equal(failed.status,502);
    assert.equal(failed.json.error,'trusted_email_dispatch_failed');
    assert.equal('challenge' in failed.json,false);
    const state=fs.readFileSync(path.join(root,'state','state.json'),'utf8');
    assert.equal(state.includes(recipientLink),false);
    const rejectedRecord=JSON.parse(state).identity_challenges.find(x=>x.email_hash===emailDestinationHash('rejected@example.test'));
    assert.ok(rejectedRecord);
    assert.equal(rejectedRecord.status,'revoked');
  }finally{
    await service.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('both operator interfaces refuse copyable mailbox redemption links',()=>{
  const react=fs.readFileSync('src/PeopleLayer.tsx','utf8');
  const standalone=fs.readFileSync('systemia/people/web/app.js','utf8');
  const legacy=fs.readFileSync('systemia/people/http.mjs','utf8');
  const owned=fs.readFileSync('systemia/people/service-runtime.mjs','utf8');
  assert.equal(react.includes('body.challenge.verification_path'),false);
  assert.equal(standalone.includes('body.challenge.verification_path'),false);
  assert.equal(react.includes('verifyUrl'),false);
  assert.equal(legacy.includes('challenge: runtime.createEmailChallenge(req.params.brainKey'),false);
  assert.match(legacy,/trusted_email_dispatch_unavailable/);
  assert.match(owned,/trusted_email_dispatch_unavailable/);
});
