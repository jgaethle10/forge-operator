// Private in-process proof kernel for Worlds invitation acceptance.
// Not an endpoint, message dispatcher, persistent queue, or production presence service.
// The trusted host MUST verify Identity sessions and re-check Passport at every step.
import {randomUUID} from 'node:crypto';
import {decideWorldsApproach,decideWorldsIntroduction} from './living-lobby-policy.mjs';

export const INVITATION_SCHEMA='evercraft.worlds.invitation-proof.v1';
const deny=reason=>({schema:INVITATION_SCHEMA,decision:'deny',reason});
const eligible=decision=>decision?.decision==='proposal_only';
const ref=x=>typeof x==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(x);

export function createWorldsInvitationProof({passport,resolvePresence,isBlocked,verifySession,now=()=>new Date().toISOString(),ttlMs=300000,maxInvitations=200}={}){
 if(!passport||typeof passport.authorize!=='function'||typeof resolvePresence!=='function'||
   typeof isBlocked!=='function'||typeof verifySession!=='function'||typeof now!=='function'||
   !Number.isInteger(ttlMs)||ttlMs<1000||ttlMs>900000||
   !Number.isInteger(maxInvitations)||maxInvitations<1||maxInvitations>5000)throw Error('worlds_invitation_trusted_host_required');
 const invitations=new Map();
 function clock(){
   const date=now(),ms=Date.parse(date);
   if(typeof date!=='string'||!Number.isFinite(ms))throw Error('worlds_invitation_clock_invalid');
   return {at:new Date(ms).toISOString(),ms};
 }
 function authenticatedSubject(token){
   try{
     const session=verifySession(token);
     return session?.verified===true&&ref(session.subject_ref)?session.subject_ref:null;
   }catch{return null;}
 }
 function presenceSubject(id){
   try{
     const p=resolvePresence(id);
     return p?.verified===true&&p.active===true&&ref(p.subject_ref)?p.subject_ref:null;
   }catch{return null;}
 }
 function decision(entry,at){
   const shared={passport,resolvePresence,isBlocked,lobby_id:'business',at};
   return entry.kind==='approach'
     ? decideWorldsApproach({...shared,from_presence_id:entry.issuer,to_presence_id:entry.targets[0]})
     : decideWorldsIntroduction({...shared,agent_presence_id:entry.issuer,
         first_presence_id:entry.targets[0],second_presence_id:entry.targets[1]});
 }
 function propose(kind,{sessionToken,fromPresenceId,agentPresenceId,toPresenceId,firstPresenceId,secondPresenceId}={}){
   const issuer=kind==='approach'?fromPresenceId:agentPresenceId;
   const targets=kind==='approach'?[toPresenceId]:[firstPresenceId,secondPresenceId];
   if(!ref(issuer)||targets.some(t=>!ref(t)))return deny('presence_reference_invalid');
   const actor=authenticatedSubject(sessionToken);
   if(!actor||actor!==presenceSubject(issuer))return deny('issuer_not_authenticated');
   const stamp=clock(),entry={kind,issuer,targets};
   const allowed=decision(entry,stamp.at);
   if(!eligible(allowed))return deny('fresh_policy_denied');
   // Bounded, no client-supplied timestamps or actor/acceptance flags.
   for(const [id,p] of invitations){
     if(p.expiresAtMs<=stamp.ms||p.state!=='pending')invitations.delete(id);
   }
   if(invitations.size>=maxInvitations)return deny('invitation_capacity_reached');
   const id='worlds_inv_'+randomUUID();
   invitations.set(id,{...entry,expiresAtMs:stamp.ms+ttlMs,state:'pending',accepted:new Set()});
   return {schema:INVITATION_SCHEMA,decision:'pending_acceptance',invitation_id:id,
     required_acceptances:targets.length,expires_at:new Date(stamp.ms+ttlMs).toISOString()};
 }
 function accept({sessionToken,invitationId}={}){
   const actor=authenticatedSubject(sessionToken);
   if(!actor)return deny('actor_not_authenticated');
   const entry=invitations.get(invitationId);
   if(!entry)return deny('invitation_unknown');
   const stamp=clock();
   if(entry.expiresAtMs<=stamp.ms){entry.state='expired';return deny('invitation_expired');}
   if(entry.state!=='pending')return deny('invitation_not_pending');
   const candidates=entry.targets.map(presenceSubject);
   if(!candidates.includes(actor))return deny('not_an_invited_subject');
   if(!candidates.every(Boolean)||new Set(candidates).size!==candidates.length)return deny('targets_no_longer_valid');
   if(entry.accepted.has(actor))return deny('acceptance_already_recorded');
   if(!eligible(decision(entry,stamp.at))){entry.state='invalidated';return deny('fresh_policy_denied');}
   entry.accepted.add(actor);
   if(entry.accepted.size===entry.targets.length){
     entry.state='accepted';
     // No messages or disclosure; caller still needs a separate authorized delivery action.
     return {schema:INVITATION_SCHEMA,decision:'consent_complete',accepted_count:entry.accepted.size,
       delivery_authorized:false};
   }
   return {schema:INVITATION_SCHEMA,decision:'awaiting_other_acceptance',accepted_count:entry.accepted.size,
     delivery_authorized:false};
 }
 function cancel({sessionToken,invitationId}={}){
   const actor=authenticatedSubject(sessionToken),entry=invitations.get(invitationId);
   if(!actor||!entry)return deny('cancellation_not_authorized');
   const relevant=[entry.issuer,...entry.targets].some(p=>presenceSubject(p)===actor);
   if(!relevant)return deny('cancellation_not_authorized');
   if(entry.state!=='pending')return deny('invitation_not_pending');
   entry.state='cancelled';
   return {schema:INVITATION_SCHEMA,decision:'cancelled',delivery_authorized:false};
 }
 return Object.freeze({
   proposeApproach:options=>propose('approach',options),
   proposeIntroduction:options=>propose('introduction',options),
   accept,cancel,
 });
}
