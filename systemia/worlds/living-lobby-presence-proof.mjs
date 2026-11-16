// Evercraft Worlds private presence kernel, not a public endpoint or a live roster.
// This registry is ephemeral by design. No messages, coordinates, names or raw
// credentials are retained. Only a trusted server may supply these callbacks.
import {randomUUID} from 'node:crypto';

export const WORLDS_PRESENCE_SCHEMA='evercraft.worlds.presence-proof.v1';
const PRODUCT='evercraft-worlds', LOBBY='business', RESOURCE='worlds:lobby:business';
const goodRef=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
const deny=reason=>({schema:WORLDS_PRESENCE_SCHEMA,decision:'deny',reason});

export function createWorldsPresenceProof({
  verifySession,verifyAgent,isPrincipalActive,verifyAdult,passport,
  now=()=>new Date().toISOString(),leaseMs=60_000,maxEntries=100,
}={}){
  if([verifySession,verifyAgent,isPrincipalActive,verifyAdult,now].some(fn=>typeof fn!=='function')||
      !passport||typeof passport.authorize!=='function'||
      !Number.isInteger(leaseMs)||leaseMs<1000||leaseMs>120_000||
      !Number.isInteger(maxEntries)||maxEntries<1||maxEntries>500)
    throw Error('worlds_presence_trusted_host_required');
  const entries=new Map();

  function clock(){
    const raw=now(),ms=typeof raw==='string'?Date.parse(raw):NaN;
    if(!Number.isFinite(ms))throw Error('worlds_presence_clock_invalid');
    return {at:new Date(ms).toISOString(),ms};
  }
  function authenticate(kind,credential,stamp){
    let identity;
    try{identity=kind==='human'?verifySession(credential):verifyAgent(credential);}
    catch{return null;}
    const authId=kind==='human'?identity?.session_id:identity?.attestation_id;
    const expire=typeof identity?.expires_at==='string'?Date.parse(identity.expires_at):NaN;
    if(!goodRef(identity?.subject_ref)||!goodRef(authId)||
       !Number.isFinite(expire)||expire<=stamp.ms)return null;
    try{
      if(isPrincipalActive({kind,subject_ref:identity.subject_ref,auth_ref:authId})!==true)return null;
      if(kind==='human'&&verifyAdult(identity.subject_ref)!==true)return null;
    }catch{return null;}
    return {subject:identity.subject_ref,authId,authExpire:expire,kind};
  }
  function authorized(entry,stamp){
    try{
      return passport.authorize({
        subject_ref:entry.subject,product:PRODUCT,
        scope:entry.kind==='human'?'worlds.presence.enter.human':'worlds.presence.enter.agent',
        resource_ref:RESOURCE,at:stamp.at,
      }).decision==='allow';
    }catch{return false;}
  }
  function current(entry,stamp){
    if(entry.expires<=stamp.ms||entry.authExpire<=stamp.ms)return false;
    try{
      if(isPrincipalActive({kind:entry.kind,subject_ref:entry.subject,auth_ref:entry.authId})!==true)return false;
      if(entry.kind==='human'&&verifyAdult(entry.subject)!==true)return false;
    }catch{return false;}
    return authorized(entry,stamp);
  }
  function prune(stamp){
    for(const [id,entry] of entries)if(!current(entry,stamp))entries.delete(id);
  }
  function admit(kind,credential){
    const stamp=clock(),identity=authenticate(kind,credential,stamp);
    if(!identity)return deny('identity_or_eligibility_not_verified');
    if(!authorized(identity,stamp))return deny('passport_not_authorized');
    prune(stamp);
    const prior=[...entries].find(([,entry])=>entry.subject===identity.subject);
    if(prior){
      // One private presence per verified principal in the adult pilot. A second
      // device cannot silently take over an existing session.
      if(prior[1].authId!==identity.authId||prior[1].kind!==kind)return deny('principal_already_present');
      return {schema:WORLDS_PRESENCE_SCHEMA,decision:'already_present',
        presence_id:prior[0],lobby_id:LOBBY,expires_at:new Date(prior[1].expires).toISOString()};
    }
    if(entries.size>=maxEntries)return deny('lobby_capacity_reached');
    const presenceId='worlds_pres_'+randomUUID();
    const expires=Math.min(stamp.ms+leaseMs,identity.authExpire);
    entries.set(presenceId,{...identity,expires});
    return {schema:WORLDS_PRESENCE_SCHEMA,decision:'entered',
      presence_id:presenceId,lobby_id:LOBBY,expires_at:new Date(expires).toISOString()};
  }
  function renew({presence_id,kind,credential}={}){
    const stamp=clock(),entry=entries.get(presence_id);
    if(!entry||!['human','agent'].includes(kind)||entry.kind!==kind)return deny('presence_unavailable');
    const actor=authenticate(kind,credential,stamp);
    if(!actor||actor.subject!==entry.subject||actor.authId!==entry.authId)
      return deny('presence_not_owned_by_session');
    if(!current(entry,stamp)){
      entries.delete(presence_id);return deny('presence_inactive');
    }
    if(!authorized(actor,stamp))return deny('passport_not_authorized');
    entry.expires=Math.min(stamp.ms+leaseMs,actor.authExpire);
    entry.authExpire=actor.authExpire;
    return {schema:WORLDS_PRESENCE_SCHEMA,decision:'renewed',
      presence_id,lobby_id:LOBBY,expires_at:new Date(entry.expires).toISOString()};
  }
  function leave({presence_id,kind,credential}={}){
    const stamp=clock(),entry=entries.get(presence_id);
    if(!entry||!['human','agent'].includes(kind)||entry.kind!==kind)return deny('presence_unavailable');
    const actor=authenticate(kind,credential,stamp);
    if(!actor||actor.subject!==entry.subject||actor.authId!==entry.authId)
      return deny('presence_not_owned_by_session');
    entries.delete(presence_id);
    return {schema:WORLDS_PRESENCE_SCHEMA,decision:'left'};
  }
  function resolvePresence(presenceId){
    if(!goodRef(presenceId))return null;
    const stamp=clock(),entry=entries.get(presenceId);
    if(!entry)return null;
    if(!current(entry,stamp)){entries.delete(presenceId);return null;}
    // Only for server-side policy calls. Never serialize this internal view
    // into a browser roster, log, analytics pipeline or scene save.
    return Object.freeze({
      subject_ref:entry.subject,kind:entry.kind,verified:true,active:true,
      lobby_id:LOBBY,...(entry.kind==='human'?{age_evidence:'verified_adult'}:{}),
    });
  }
  return Object.freeze({
    joinHuman:({sessionToken}={})=>admit('human',sessionToken),
    joinAgent:({agentCredential}={})=>admit('agent',agentCredential),
    renewHuman:({presence_id,sessionToken}={})=>renew({presence_id,kind:'human',credential:sessionToken}),
    renewAgent:({presence_id,agentCredential}={})=>renew({presence_id,kind:'agent',credential:agentCredential}),
    leaveHuman:({presence_id,sessionToken}={})=>leave({presence_id,kind:'human',credential:sessionToken}),
    leaveAgent:({presence_id,agentCredential}={})=>leave({presence_id,kind:'agent',credential:agentCredential}),
    resolvePresence,
  });
}
