import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const EMAIL=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const CODE=/^[0-9]{8}$/;
const CHALLENGE=/^[a-f0-9]{32}$/;
const error=(code,status=400)=>Object.assign(new Error(code),{status});
const hex=n=>crypto.randomBytes(n).toString('hex');
const normalize=email=>typeof email==='string'?email.trim().toLowerCase():'';
function approvedEmail(email){
 return email.length>3&&email.length<=200&&EMAIL.test(email)&&
  !/[\r\n<>]/.test(email);
}
function privateDir(dir){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const st=fs.lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink())
  throw error('unsafe_email_challenge_storage',503);
 fs.chmodSync(dir,0o700);
}
function atomicState(file,record){
 const temp=path.join(path.dirname(file),'.'+hex(12)+'.tmp');
 try{
  fs.writeFileSync(temp,JSON.stringify(record),{flag:'wx',mode:0o600});
  fs.renameSync(temp,file);
 }finally{try{fs.rmSync(temp,{force:true})}catch{}}
}
function readState(file){
 let st;
 try{st=fs.lstatSync(file)}catch(e){
  if(e.code==='ENOENT')return null;
  throw error('email_verification_storage_unavailable',503);
 }
 if(!st.isFile()||st.isSymbolicLink()||st.size>2048)
  throw error('unsafe_email_verification_state',503);
 try{return JSON.parse(fs.readFileSync(file,'utf8'))}
 catch{throw error('invalid_email_verification_state',503)}
}
const matches=(a,b)=>typeof a==='string'&&typeof b==='string'&&
 a.length===b.length&&
 crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));

/**
 * Owned private single-process challenge ledger.
 * A trusted owner-provided sendCode callback must deliver to the
 * requested email through an authorized outbound relay.
 *
 * No public endpoint, mail transport, live authentication or account
 * recovery is created here. The guest ledger separately owns sessions.
 */
export function createForensiScopeEmailVerification({
 storageDir,secret,sendCode,checkChallengeRequest,
 enabled=false,now=()=>Date.now(),ttlMs=10*60*1000,
 resendCooldownMs=60*1000,maxAttempts=5
}={}){
 if(typeof storageDir!=='string'||!path.isAbsolute(storageDir))
  throw error('absolute_email_challenge_storage_required');
 if(!Buffer.isBuffer(secret)&&typeof secret!=='string')
  throw error('server_email_hmac_key_required',503);
 const key=Buffer.isBuffer(secret)?Buffer.from(secret):Buffer.from(secret,'utf8');
 if(key.length<32)throw error('server_email_hmac_key_too_short',503);
 if([sendCode,checkChallengeRequest,now].some(fn=>typeof fn!=='function'))
  throw error('trusted_email_sender_and_abuse_gate_required',503);
 if(!Number.isSafeInteger(ttlMs)||ttlMs<60000||ttlMs>3600000||
    !Number.isSafeInteger(resendCooldownMs)||resendCooldownMs<1000||
    resendCooldownMs>ttlMs||!Number.isSafeInteger(maxAttempts)||
    maxAttempts<1||maxAttempts>10)
  throw error('invalid_email_challenge_limits');
 const root=path.resolve(storageDir);
 privateDir(root);
 const hmac=value=>crypto.createHmac('sha256',key).update(value).digest('hex');
 const emailKey=email=>hmac('email:'+email);
 const challengeDigest=(email,id,code)=>
  hmac('verification:'+email+':'+id+':'+code);
 const locks=new Set();
 const guarded=async(key,fn)=>{
  if(locks.has(key))throw error('email_challenge_in_progress',409);
  locks.add(key);
  try{return await fn()}finally{locks.delete(key)}
 };
 const recordFile=email=>path.join(root,emailKey(email)+'.json');
 const sendChallenge=async({email,request}={})=>{
  if(enabled!==true)throw error('email_verification_disabled',503);
  const normalized=normalize(email);
  if(!approvedEmail(normalized))
   throw error('valid_email_required',422);
  // Always run a real owner-supplied IP, device and recipient abuse gate.
  if(await checkChallengeRequest({email:normalized,request})!==true)
   throw error('email_challenge_rate_limited',429);
  const key=emailKey(normalized);
  return guarded(key,async()=>{
   const file=recordFile(normalized);
   const previous=readState(file);
   if(previous?.created_at_ms&&now()-previous.created_at_ms<resendCooldownMs)
    throw error('email_challenge_rate_limited',429);
   const code=String(crypto.randomInt(0,100000000)).padStart(8,'0');
   const id=hex(16),expires=now()+ttlMs;
   const state={
    schema:'evercraft.forensiscope.email-challenge.v1',
    challenge_id:id,email_key:key,code_digest:challengeDigest(normalized,id,code),
    created_at_ms:now(),expires_at_ms:expires,
    attempts:0,consumed:false
   };
   atomicState(file,state);
   try{
    const delivery=await sendCode({
     email:normalized,verificationCode:code,
     expiresAt:new Date(expires).toISOString(),
     purpose:'forensiscope_private_customer_access'
    });
    if(delivery?.accepted!==true)
     throw error('email_challenge_delivery_unverified',503);
   }catch{
    const stored=readState(file);
    if(stored?.challenge_id===id)fs.rmSync(file,{force:true});
    throw error('email_challenge_delivery_unavailable',503);
   }
   // Verification code and customer email are never returned to browser.
   return Object.freeze({
    schema:'evercraft.forensiscope.email-challenge-request.v1',
    challenge_id:id,code_delivery:'email',
    expires_at:new Date(expires).toISOString(),
    email_verified:false,guest_session_issued:false
   });
  });
 };
 const verifyAndConsume=async({email,challengeId,verificationCode}={})=>{
  if(enabled!==true)return false;
  const normalized=normalize(email);
  if(!approvedEmail(normalized)||!CHALLENGE.test(String(challengeId))||
     !CODE.test(String(verificationCode)))return false;
  const key=emailKey(normalized);
  return guarded(key,async()=>{
   const file=recordFile(normalized);
   const state=readState(file);
   if(state?.schema!=='evercraft.forensiscope.email-challenge.v1'||
      state.challenge_id!==challengeId||state.email_key!==key||
      state.consumed===true||!Number.isSafeInteger(state.expires_at_ms)||
      now()>=state.expires_at_ms||state.attempts>=maxAttempts)return false;
   const expected=challengeDigest(normalized,challengeId,verificationCode);
   const correct=matches(state.code_digest,expected);
   atomicState(file,{
    ...state,attempts:state.attempts+1,
    consumed:correct
   });
   return correct;
  });
 };
 return Object.freeze({
  sendChallenge,verifyAndConsume,
  readiness:Object.freeze({
   schema:'evercraft.forensiscope.email-verification-readiness.v1',
   enabled:enabled===true,
   real_delivery_required:true,
   email_verified_before_guest_access:true,
   public_enrollment_enabled:false
  })
 });
}
