// First-party Evercraft Identity -> private Worlds presence bridge.
// This is server-side only; no HTTP endpoint, no customer directory, no password
// or signed session token persistence. Agent attestation is a separate trust lane.
import {verifyEvercraftSession} from '../evercraft-home/identity.mjs';
import {createHash} from 'node:crypto';

export function createWorldsHumanIdentityBridge({
  identity,getKeyring,now=()=>new Date().toISOString(),maxTracked=200,
}={}){
  if(!identity||typeof identity.assertSessionActive!=='function'||
    typeof getKeyring!=='function'||typeof now!=='function'||
    !Number.isInteger(maxTracked)||maxTracked<1||maxTracked>2000)
    throw Error('worlds_identity_bridge_trusted_host_required');
  const sessions=new Map();
  function clock(){
    const raw=now(),ms=typeof raw==='string'?Date.parse(raw):NaN;
    if(!Number.isFinite(ms))throw Error('worlds_identity_bridge_clock_invalid');
    return ms;
  }
  function signingKeyFingerprint(id){
    try{
      const keys=getKeyring(),secret=keys&&typeof keys==='object'&&!Array.isArray(keys)?keys[id]:null;
      if(typeof secret!=='string'||Buffer.byteLength(secret,'utf8')<32)return null;
      return createHash('sha256').update(secret).digest('hex');
    }catch{return null;}
  }
  function isHumanActive({kind,subject_ref,auth_ref}={}){
    if(kind!=='human'||typeof auth_ref!=='string')return false;
    const record=sessions.get(auth_ref);
    if(!record||record.subject_ref!==subject_ref)return false;
    try{
      const ms=clock();
      if(Date.parse(record.expires_at)<=ms){sessions.delete(auth_ref);return false;}
      if(!record.signing_key_fingerprint||
        signingKeyFingerprint(record.signing_key_id)!==record.signing_key_fingerprint)return false;
      identity.assertSessionActive(record);
      return true;
    }catch{return false;}
  }
  function verifySession(token){
    const ms=clock(),keyring=getKeyring();
    const claims=verifyEvercraftSession(token,keyring,{now:new Date(ms)});
    identity.assertSessionActive(claims);
    const fingerprint=signingKeyFingerprint(claims.signing_key_id);
    if(!fingerprint)throw Error('worlds_identity_signing_key_unavailable');
    for(const [id,session] of sessions)if(Date.parse(session.expires_at)<=ms)sessions.delete(id);
    if(!sessions.has(claims.session_id)&&sessions.size>=maxTracked)
      throw Error('worlds_identity_session_capacity_reached');
    // Exclude display names, email addresses and bearer tokens.
    const record={
      session_id:claims.session_id,subject_ref:claims.subject_ref,
      issued_at:claims.issued_at,expires_at:claims.expires_at,
      signing_key_id:claims.signing_key_id,signing_key_fingerprint:fingerprint,
    };
    const old=sessions.get(record.session_id);
    if(old&&(old.subject_ref!==record.subject_ref||old.issued_at!==record.issued_at))
      throw Error('worlds_identity_session_collision');
    sessions.set(record.session_id,record);
    return Object.freeze({
      subject_ref:record.subject_ref,session_id:record.session_id,
      expires_at:record.expires_at,
    });
  }
  return Object.freeze({verifySession,isHumanActive});
}
