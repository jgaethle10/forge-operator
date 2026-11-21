import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldsInvitationProof} from '../systemia/worlds/living-lobby-invitation-proof.mjs';

function fixture(){
 const people={
  a:{kind:'human',subject_ref:'human:a',verified:true,active:true,lobby_id:'business',age_evidence:'verified_adult'},
  b:{kind:'human',subject_ref:'human:b',verified:true,active:true,lobby_id:'business',age_evidence:'verified_adult'},
  c:{kind:'agent',subject_ref:'agent:c',verified:true,active:true,lobby_id:'business'},
  stranger:{kind:'human',subject_ref:'human:unknown',verified:true,active:true,lobby_id:'business',age_evidence:'verified_adult'},
 };
 const tokens={alice:'human:a',bob:'human:b',concierge:'agent:c',other:'human:unknown'};
 const scopes=new Set(),blocks=new Set();
 let t=Date.parse('2026-11-15T12:00:00.000Z');
 const give=(who,scope)=>scopes.add(people[who].subject_ref+'|'+scope);
 const revoke=(who,scope)=>scopes.delete(people[who].subject_ref+'|'+scope);
 const passport={authorize:({subject_ref,product,scope,resource_ref})=>{
  assert.equal(product,'evercraft-worlds');assert.equal(resource_ref,'worlds:lobby:business');
  return {decision:scopes.has(subject_ref+'|'+scope)?'allow':'deny'};
 }};
 const opts={
  passport,
  resolvePresence:id=>people[id],
  isBlocked:(a,b)=>blocks.has(a+'|'+b),
  verifySession:token=>tokens[token]?{verified:true,subject_ref:tokens[token]}:null,
  now:()=>new Date(t).toISOString(),
 };
 const proof=createWorldsInvitationProof(opts);
 const approach=()=>proof.proposeApproach({sessionToken:'alice',fromPresenceId:'a',toPresenceId:'b'});
 const intro=()=>proof.proposeIntroduction({sessionToken:'concierge',agentPresenceId:'c',firstPresenceId:'a',secondPresenceId:'b'});
 return {people,give,revoke,blocks,opts,proof,approach,intro,advance:ms=>t+=ms};
}
test('unverified client identity and absence of consent both deny proposal',()=>{
 const h=fixture();
 assert.equal(h.proof.proposeApproach({sessionToken:'not-a-session',fromPresenceId:'a',toPresenceId:'b'}).decision,'deny');
 assert.equal(h.approach().reason,'fresh_policy_denied');
 h.give('a','worlds.contact.initiate');
 assert.equal(h.approach().decision,'deny');
 h.give('b','worlds.contact.receive.human');
 assert.equal(h.approach().decision,'pending_acceptance');
});
test('recipient must authenticate separately; proposer cannot accept on their behalf',()=>{
 const h=fixture();h.give('a','worlds.contact.initiate');h.give('b','worlds.contact.receive.human');
 const proposed=h.approach();
 assert.match(proposed.invitation_id,/^worlds_inv_/);
 assert.equal(h.proof.accept({sessionToken:'alice',invitationId:proposed.invitation_id}).reason,'not_an_invited_subject');
 assert.equal(h.proof.accept({sessionToken:'other',invitationId:proposed.invitation_id}).decision,'deny');
 const accepted=h.proof.accept({sessionToken:'bob',invitationId:proposed.invitation_id});
 assert.equal(accepted.decision,'consent_complete');
 assert.equal(accepted.delivery_authorized,false);
 assert.equal(h.proof.accept({sessionToken:'bob',invitationId:proposed.invitation_id}).reason,'invitation_not_pending');
});
test('two humans must each accept an agent introduction; no message is sent',()=>{
 const h=fixture();h.give('c','worlds.introduction.propose');h.give('a','worlds.introduction.suggest');h.give('b','worlds.introduction.suggest');
 const pending=h.intro();assert.equal(pending.required_acceptances,2);
 let a=h.proof.accept({sessionToken:'alice',invitationId:pending.invitation_id});
 assert.equal(a.decision,'awaiting_other_acceptance');assert.equal(a.delivery_authorized,false);
 assert.equal(h.proof.accept({sessionToken:'alice',invitationId:pending.invitation_id}).reason,'acceptance_already_recorded');
 let b=h.proof.accept({sessionToken:'bob',invitationId:pending.invitation_id});
 assert.equal(b.decision,'consent_complete');assert.equal(b.accepted_count,2);assert.equal(b.delivery_authorized,false);
});
test('policy is re-evaluated at acceptance, revocation invalidates pending request',()=>{
 const h=fixture();h.give('a','worlds.contact.initiate');h.give('b','worlds.contact.receive.human');
 const pending=h.approach();
 h.revoke('b','worlds.contact.receive.human');
 assert.equal(h.proof.accept({sessionToken:'bob',invitationId:pending.invitation_id}).reason,'fresh_policy_denied');
});
test('blocked identities and moved or offline presence cannot bypass acceptance',()=>{
 const h=fixture();h.give('a','worlds.contact.initiate');h.give('b','worlds.contact.receive.human');
 const pending=h.approach();h.blocks.add('human:b|human:a');
 assert.equal(h.proof.accept({sessionToken:'bob',invitationId:pending.invitation_id}).decision,'deny');
 const again=h.approach();assert.equal(again.decision,'deny');
 h.blocks.clear();const newPending=h.approach();h.people.b.lobby_id='play';
 assert.equal(h.proof.accept({sessionToken:'bob',invitationId:newPending.invitation_id}).reason,'fresh_policy_denied');
});
test('hard expiry, cancellation and capacity bounds never authorize delivery',()=>{
 const h=fixture();h.give('a','worlds.contact.initiate');h.give('b','worlds.contact.receive.human');
 const pending=h.approach();h.advance(300001);
 assert.equal(h.proof.accept({sessionToken:'bob',invitationId:pending.invitation_id}).reason,'invitation_expired');
 const later=h.approach();assert.equal(h.proof.cancel({sessionToken:'other',invitationId:later.invitation_id}).decision,'deny');
 assert.equal(h.proof.cancel({sessionToken:'alice',invitationId:later.invitation_id}).delivery_authorized,false);
 assert.equal(h.proof.accept({sessionToken:'bob',invitationId:later.invitation_id}).reason,'invitation_not_pending');
 const limited=createWorldsInvitationProof({...h.opts,maxInvitations:1});
 const one=limited.proposeApproach({sessionToken:'alice',fromPresenceId:'a',toPresenceId:'b'});
 assert.equal(one.decision,'pending_acceptance');
 assert.equal(limited.proposeApproach({sessionToken:'alice',fromPresenceId:'a',toPresenceId:'b'}).reason,'invitation_capacity_reached');
});
test('incomplete trusted-host dependencies are rejected',()=>{
 const h=fixture();
 assert.throws(()=>createWorldsInvitationProof({passport:h.opts.passport}),/trusted_host_required/);
 assert.throws(()=>createWorldsInvitationProof({...h.opts,ttlMs:0}),/trusted_host_required/);
});
