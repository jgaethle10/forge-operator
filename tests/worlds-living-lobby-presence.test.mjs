import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldsPresenceProof} from '../systemia/worlds/living-lobby-presence-proof.mjs';
import {decideWorldsApproach,decideWorldsIntroduction} from '../systemia/worlds/living-lobby-policy.mjs';
import {createWorldsInvitationProof} from '../systemia/worlds/living-lobby-invitation-proof.mjs';

function fixture(config={}){
  let ms=Date.parse('2026-11-16T12:00:00Z');
  const adults=new Set(['human:a','human:b']);
  const active=new Set(['h1','h2','h3','ag1']);
  const grants=new Set();
  const credentials={
    alice:{verified:true,subject_ref:'human:a',session_id:'h1',expires_at:'2026-11-16T13:00:00Z'},
    aliceNew:{verified:true,subject_ref:'human:a',session_id:'h3',expires_at:'2026-11-16T13:00:00Z'},
    bob:{verified:true,subject_ref:'human:b',session_id:'h2',expires_at:'2026-11-16T13:00:00Z'},
  };
  const agentCredentials={concierge:{subject_ref:'agent:c',attestation_id:'ag1',expires_at:'2026-11-16T13:00:00Z'}};
  const services={
    verifySession:token=>credentials[token]||null,
    verifyAgent:credential=>agentCredentials[credential]||null,
    isPrincipalActive:({auth_ref})=>active.has(auth_ref),
    verifyAdult:subject=>adults.has(subject),
    passport:{authorize:({subject_ref,product,scope,resource_ref})=>{
      assert.equal(product,'evercraft-worlds');
      assert.equal(resource_ref,'worlds:lobby:business');
      return {decision:grants.has(subject_ref+'|'+scope)?'allow':'deny'};
    }},
    now:()=>new Date(ms).toISOString(),
    leaseMs:10_000,
    ...config,
  };
  const registry=createWorldsPresenceProof(services);
  const give=(subject,scope)=>grants.add(subject+'|'+scope);
  const revoke=(subject,scope)=>grants.delete(subject+'|'+scope);
  const allowHuman=subject=>give(subject,'worlds.presence.enter.human');
  const allowAgent=subject=>give(subject,'worlds.presence.enter.agent');
  return {registry,services,give,revoke,allowHuman,allowAgent,adults,active,
    advance:n=>ms+=n,clock:()=>new Date(ms).toISOString()};
}
test('default deny: Identity and Passport must both authorize a human',()=>{
  const h=fixture();
  assert.equal(h.registry.joinHuman({sessionToken:'unknown'}).reason,'identity_or_eligibility_not_verified');
  assert.equal(h.registry.joinHuman({sessionToken:'alice'}).reason,'passport_not_authorized');
  h.allowHuman('human:a');
  assert.equal(h.registry.joinHuman({sessionToken:'alice'}).decision,'entered');
  assert.equal(h.registry.joinHuman({sessionToken:{subject_ref:'human:a'}}).decision,'deny');
});
test('live presence has an opaque random ID; internal view has no name, location or credentials',()=>{
  const h=fixture();h.allowHuman('human:a');
  const joined=h.registry.joinHuman({sessionToken:'alice'});
  assert.match(joined.presence_id,/^worlds_pres_[0-9a-f-]{36}$/);
  assert.equal(JSON.stringify(joined).includes('human:a'),false);
  const internal=h.registry.resolvePresence(joined.presence_id);
  assert.deepEqual(internal,{subject_ref:'human:a',kind:'human',verified:true,active:true,lobby_id:'business',age_evidence:'verified_adult'});
  assert.equal(Object.keys(h.registry).some(k=>/list|dump|broadcast|send/i.test(k)),false);
});
test('sessions cannot hijack another session on the same subject',()=>{
  const h=fixture();h.allowHuman('human:a');
  const first=h.registry.joinHuman({sessionToken:'alice'});
  const same=h.registry.joinHuman({sessionToken:'alice'});
  assert.equal(same.decision,'already_present');
  assert.equal(same.presence_id,first.presence_id);
  assert.equal(h.registry.joinHuman({sessionToken:'aliceNew'}).reason,'principal_already_present');
  assert.equal(h.registry.renewHuman({presence_id:first.presence_id,sessionToken:'aliceNew'}).reason,'presence_not_owned_by_session');
  assert.equal(h.registry.leaveHuman({presence_id:first.presence_id,sessionToken:'aliceNew'}).decision,'deny');
  assert.equal(h.registry.leaveHuman({presence_id:first.presence_id,sessionToken:'alice'}).decision,'left');
  assert.equal(h.registry.resolvePresence(first.presence_id),null);
});
test('renew requires a valid current session and cannot extend past session expiry',()=>{
  const h=fixture();h.allowHuman('human:a');
  const joined=h.registry.joinHuman({sessionToken:'alice'});
  h.advance(9000);
  assert.equal(h.registry.renewHuman({presence_id:joined.presence_id,sessionToken:'alice'}).decision,'renewed');
  h.advance(9000);
  assert.ok(h.registry.resolvePresence(joined.presence_id));
  h.advance(10001);
  assert.equal(h.registry.resolvePresence(joined.presence_id),null);
  assert.equal(h.registry.renewHuman({presence_id:joined.presence_id,sessionToken:'alice'}).decision,'deny');
});
test('identity revoke and Passport revoke each fail closed on the very next lookup',()=>{
  const h=fixture();h.allowHuman('human:a');
  const a=h.registry.joinHuman({sessionToken:'alice'});
  h.revoke('human:a','worlds.presence.enter.human');
  assert.equal(h.registry.resolvePresence(a.presence_id),null);
  h.allowHuman('human:a');
  const b=h.registry.joinHuman({sessionToken:'alice'});
  h.active.delete('h1');
  assert.equal(h.registry.resolvePresence(b.presence_id),null);
});
test('adult evidence is required and checked again after entry',()=>{
  const h=fixture();h.allowHuman('human:a');
  h.adults.delete('human:a');
  assert.equal(h.registry.joinHuman({sessionToken:'alice'}).reason,'identity_or_eligibility_not_verified');
  h.adults.add('human:a');
  const joined=h.registry.joinHuman({sessionToken:'alice'});
  h.adults.delete('human:a');
  assert.equal(h.registry.resolvePresence(joined.presence_id),null);
});
test('agent attestation and a separate Passport scope are required',()=>{
  const h=fixture();
  assert.equal(h.registry.joinAgent({agentCredential:'unknown'}).decision,'deny');
  assert.equal(h.registry.joinAgent({agentCredential:'concierge'}).reason,'passport_not_authorized');
  h.allowAgent('agent:c');
  const joined=h.registry.joinAgent({agentCredential:'concierge'});
  assert.equal(joined.decision,'entered');
  assert.deepEqual(h.registry.resolvePresence(joined.presence_id),{
    subject_ref:'agent:c',kind:'agent',verified:true,active:true,lobby_id:'business',
  });
  assert.equal(h.registry.renewHuman({presence_id:joined.presence_id,sessionToken:'alice'}).decision,'deny');
  h.active.delete('ag1');
  assert.equal(h.registry.resolvePresence(joined.presence_id),null);
});
test('registry is bounded; expired entries free space, and restart restores no sessions',()=>{
  const h=fixture({maxEntries:1});h.allowHuman('human:a');h.allowHuman('human:b');
  const a=h.registry.joinHuman({sessionToken:'alice'});
  assert.equal(h.registry.joinHuman({sessionToken:'bob'}).reason,'lobby_capacity_reached');
  h.advance(10001);
  assert.equal(h.registry.resolvePresence(a.presence_id),null);
  assert.equal(h.registry.joinHuman({sessionToken:'bob'}).decision,'entered');
  const second=createWorldsPresenceProof(h.services);
  assert.equal(second.resolvePresence(a.presence_id),null);
});
test('policy uses registry-owned membership, never caller supplied adult/contact flags',()=>{
  const h=fixture();h.allowHuman('human:a');h.allowHuman('human:b');
  h.give('human:a','worlds.contact.initiate');h.give('human:b','worlds.contact.receive.human');
  const a=h.registry.joinHuman({sessionToken:'alice'});
  const b=h.registry.joinHuman({sessionToken:'bob'});
  const opts={passport:h.services.passport,resolvePresence:h.registry.resolvePresence,
    isBlocked:()=>false,lobby_id:'business',at:h.clock()};
  const allowed=decideWorldsApproach({...opts,from_presence_id:a.presence_id,to_presence_id:b.presence_id,
    age_evidence:'verified_adult',receive:true});
  assert.equal(allowed.decision,'proposal_only');
  h.registry.leaveHuman({presence_id:b.presence_id,sessionToken:'bob'});
  assert.equal(decideWorldsApproach({...opts,from_presence_id:a.presence_id,to_presence_id:b.presence_id}).reason,'presence_not_verified');
});
test('full synthetic journey: two humans and a verified concierge must separately accept',()=>{
  const h=fixture();h.allowHuman('human:a');h.allowHuman('human:b');h.allowAgent('agent:c');
  h.give('agent:c','worlds.introduction.propose');
  h.give('human:a','worlds.introduction.suggest');h.give('human:b','worlds.introduction.suggest');
  const alice=h.registry.joinHuman({sessionToken:'alice'});
  const bob=h.registry.joinHuman({sessionToken:'bob'});
  const agent=h.registry.joinAgent({agentCredential:'concierge'});
  const invitations=createWorldsInvitationProof({
    passport:h.services.passport,resolvePresence:h.registry.resolvePresence,isBlocked:()=>false,
    verifySession:token=>h.services.verifySession(token)||{
      ...h.services.verifyAgent(token),verified:token==='concierge',
    },
    now:h.services.now,
  });
  const created=invitations.proposeIntroduction({
    sessionToken:'concierge',agentPresenceId:agent.presence_id,
    firstPresenceId:alice.presence_id,secondPresenceId:bob.presence_id,
  });
  assert.equal(created.decision,'pending_acceptance');
  assert.equal(invitations.accept({sessionToken:'alice',invitationId:created.invitation_id}).decision,'awaiting_other_acceptance');
  assert.deepEqual(invitations.accept({sessionToken:'bob',invitationId:created.invitation_id}),{
    schema:'evercraft.worlds.invitation-proof.v1',decision:'consent_complete',
    accepted_count:2,delivery_authorized:false,
  });
});
test('fail closed for incomplete trusted host and unsafe bounds',()=>{
  const h=fixture();
  assert.throws(()=>createWorldsPresenceProof({passport:h.services.passport}),/trusted_host_required/);
  assert.throws(()=>createWorldsPresenceProof({...h.services,leaseMs:0}),/trusted_host_required/);
  assert.throws(()=>createWorldsPresenceProof({...h.services,maxEntries:20000}),/trusted_host_required/);
});
