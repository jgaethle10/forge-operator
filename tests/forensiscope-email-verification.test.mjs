import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createForensiScopeEmailVerification} from '../systemia/forensiscope/email-verification.mjs';
import {createForensiScopeGuestOrderLedger} from '../systemia/forensiscope/guest-order-ledger.mjs';

const EMAIL='buyer@example.test';
const capacity={
 ingress_max_bytes:1024*1024,codec_preflight_verified:true,
 secure_resumable_ingress_verified:true,processing_capacity_verified:true,
 private_result_delivery_verified:true,exact_offer_payment_route_verified:true
};
function fixture(settings={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'forensi-email-proof-'));
 let time=Date.parse('2026-11-09T21:00:00.000Z');
 const delivered=[];
 let sendAvailable=true,abuseAllowed=true;
 const make=()=>createForensiScopeEmailVerification({
  storageDir:path.join(root,'challenges'),secret:Buffer.alloc(32,77),
  enabled:true,now:()=>time,ttlMs:600000,resendCooldownMs:1000,maxAttempts:5,
  checkChallengeRequest:async()=>abuseAllowed,
  sendCode:async details=>{
   if(!sendAvailable)return {accepted:false};
   delivered.push(details);return {accepted:true};
  },
  ...settings
 });
 let verify=make();
 return {
  root,delivered,get verify(){return verify},
  restart(){verify=make();return verify},
  setSendEnabled:x=>{sendAvailable=x},
  setAbuseAllowed:x=>{abuseAllowed=x},
  advance:ms=>{time+=ms},
  time:()=>time,
  cleanup:()=>fs.rmSync(root,{recursive:true,force:true})
 };
}

test('one-time verified email challenge has no plaintext code in private durable state or browser receipt',async()=>{
 const f=fixture();
 try{
  const challenge=await f.verify.sendChallenge({email:EMAIL,request:{}});
  assert.match(challenge.challenge_id,/^[a-f0-9]{32}$/);
  assert.equal(challenge.email_verified,false);
  assert.equal(challenge.guest_session_issued,false);
  assert.equal(challenge.verification_code,undefined);
  assert.equal(challenge.email,undefined);
  assert.equal(f.delivered.length,1);
  assert.equal(f.delivered[0].email,EMAIL);
  const code=f.delivered[0].verificationCode;
  assert.match(code,/^[0-9]{8}$/);
  const file=path.join(f.root,'challenges',
   fs.readdirSync(path.join(f.root,'challenges'))[0]);
  const stored=fs.readFileSync(file,'utf8');
  assert.ok(!stored.includes(code));
  assert.ok(!stored.includes(EMAIL));
  assert.equal(fs.statSync(file).mode&0o777,0o600);
  assert.equal(await f.verify.verifyAndConsume({
   email:EMAIL,challengeId:challenge.challenge_id,verificationCode:'9999'
  }),false);
  f.restart();
  assert.equal(await f.verify.verifyAndConsume({
   email:EMAIL,challengeId:challenge.challenge_id,verificationCode:code
  }),true);
  assert.equal(await f.verify.verifyAndConsume({
   email:EMAIL,challengeId:challenge.challenge_id,verificationCode:code
  }),false,'one successful use only, including after process restart');
 }finally{f.cleanup()}
});

test('wrong code exhausts five attempts, expiry and sender errors fail closed',async()=>{
 const f=fixture();
 try{
  const c=await f.verify.sendChallenge({email:EMAIL,request:{}});
  const real=f.delivered.at(-1).verificationCode;
  const wrong=real==='00000000'?'11111111':'00000000';
  for(let i=0;i<5;i++){
   assert.equal(await f.verify.verifyAndConsume({
    email:EMAIL,challengeId:c.challenge_id,verificationCode:wrong
   }),false);
  }
  assert.equal(await f.verify.verifyAndConsume({
   email:EMAIL,challengeId:c.challenge_id,verificationCode:real
  }),false,'locked after five attempts');
  await assert.rejects(f.verify.sendChallenge({email:EMAIL,request:{}}),
   /email_challenge_rate_limited/);
  f.advance(1100);
  const newer=await f.verify.sendChallenge({email:EMAIL,request:{}});
  assert.notEqual(newer.challenge_id,c.challenge_id);
  f.advance(600001);
  assert.equal(await f.verify.verifyAndConsume({
   email:EMAIL,challengeId:newer.challenge_id,
   verificationCode:f.delivered.at(-1).verificationCode
  }),false,'expired proof denied');
  f.setSendEnabled(false);
  await assert.rejects(f.verify.sendChallenge({
   email:'failed@example.test',request:{}
  }),/email_challenge_delivery_unavailable/);
  assert.equal(fs.readdirSync(path.join(f.root,'challenges')).length,1,
   'unsent challenge removed from disk');
  f.setAbuseAllowed(false);
  await assert.rejects(f.verify.sendChallenge({
   email:'new@example.test',request:{}
  }),/email_challenge_rate_limited/);
 }finally{f.cleanup()}
});

test('guest account cannot be minted from an unverified address or a replayed code, even if abuse check passes',async()=>{
 const f=fixture();
 let server;
 try{
  const ledger=createForensiScopeGuestOrderLedger({
   storageDir:path.join(f.root,'guest'),emailVerification:f.verify,
   guestEnrollmentEnabled:true,checkEnrollment:async()=>true,
   readCapacity:async()=>capacity,maxUploadBytes:1024*1024,
   now:f.time
  });
  server=http.createServer(ledger.handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const post=async(route,body)=>{
   const response=await fetch(base+route,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(body)
   });
   return {status:response.status,data:await response.json()};
  };
  const unverified=await post('/v1/forensiscope/guest',{
   email:EMAIL,privacy_accepted:true
  });
  assert.equal(unverified.status,403);
  assert.equal(unverified.data.access_token,undefined);
  assert.deepEqual(fs.readdirSync(path.join(f.root,'guest','sessions')),[]);
  const request=await post('/v1/forensiscope/guest/challenge',{
   email:EMAIL,privacy_accepted:true
  });
  assert.equal(request.status,201);
  assert.equal(request.data.verification_code,undefined);
  const code=f.delivered.at(-1).verificationCode;
  const wrong=await post('/v1/forensiscope/guest',{
   email:EMAIL,privacy_accepted:true,
   challenge_id:request.data.challenge_id,verification_code:'123'
  });
  assert.equal(wrong.status,403);
  const enrolled=await post('/v1/forensiscope/guest',{
   email:EMAIL,privacy_accepted:true,
   challenge_id:request.data.challenge_id,verification_code:code
  });
  assert.equal(enrolled.status,201);
  assert.match(enrolled.data.access_token,/^fsg_[a-f0-9]{64}$/);
  const replay=await post('/v1/forensiscope/guest',{
   email:EMAIL,privacy_accepted:true,
   challenge_id:request.data.challenge_id,verification_code:code
  });
  assert.equal(replay.status,403);
  assert.equal(fs.readdirSync(path.join(f.root,'guest','sessions')).length,1);
 }finally{
  if(server?.listening)await new Promise(resolve=>server.close(resolve));
  f.cleanup();
 }
});

test('enrollment fails to initialize without real verification provider; disabled is fail-closed',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'forensi-email-disabled-'));
 try{
  assert.throws(()=>createForensiScopeGuestOrderLedger({
   storageDir:root,readCapacity:async()=>capacity,
   guestEnrollmentEnabled:true,checkEnrollment:async()=>true
  }),/trusted_email_verification_required/);
  assert.throws(()=>createForensiScopeEmailVerification({
   storageDir:path.join(root,'challenge'),secret:'short',
   sendCode:async()=>({accepted:true}),checkChallengeRequest:async()=>true,
   enabled:true
  }),/server_email_hmac_key_too_short/);
  const disabled=fixture({enabled:false});
  try{
   assert.equal(await disabled.verify.verifyAndConsume({
    email:EMAIL,challengeId:'a'.repeat(32),verificationCode:'12345678'
   }),false);
   await assert.rejects(disabled.verify.sendChallenge({
    email:EMAIL,request:{}
   }),/email_verification_disabled/);
  }finally{disabled.cleanup()}
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
