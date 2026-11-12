import test from 'node:test';
import assert from 'node:assert/strict';
import {decideWorldsApproach,decideWorldsIntroduction,LIVING_LOBBIES} from '../systemia/worlds/living-lobby-policy.mjs';
const at='2026-11-11T12:00:00.000Z';
const base={
  a:{kind:'human',subject_ref:'human:a',lobby_id:'business',active:true,verified:true,age_evidence:'verified_adult'},
  b:{kind:'human',subject_ref:'human:b',lobby_id:'business',active:true,verified:true,age_evidence:'verified_adult'},
  c:{kind:'agent',subject_ref:'agent:c',lobby_id:'business',active:true,verified:true},
};
function harness() {
  const people=structuredClone(base),grants=new Set(),blockedPairs=new Set();
  const passport={authorize({subject_ref,product,scope,resource_ref}){
    assert.equal(product,'evercraft-worlds');
    return {decision:grants.has([subject_ref,scope,resource_ref].join('|'))?'allow':'deny'};
  }};
  const resolvePresence=id=>people[id];
  const isBlocked=(recipient,sender)=>blockedPairs.has([recipient,sender].join('|'));
  const give=(id,scope,lobby='business')=>grants.add([people[id].subject_ref,scope,'worlds:lobby:'+lobby].join('|'));
  const approach=(from_presence_id='a',to_presence_id='b',lobby_id='business')=>decideWorldsApproach({passport,resolvePresence,isBlocked,from_presence_id,to_presence_id,lobby_id,at});
  const intro=()=>decideWorldsIntroduction({passport,resolvePresence,isBlocked,agent_presence_id:'c',first_presence_id:'a',second_presence_id:'b',lobby_id:'business',at});
  return {people,grants,blockedPairs,passport,resolvePresence,isBlocked,give,approach,intro};
}
test('only Business is eligible for pilot contacts; learning/minor lobbies remain closed',()=>{
  assert.equal(LIVING_LOBBIES.business.pilot_contact,true);
  for(const id of ['play','explore','learn','community']) assert.equal(LIVING_LOBBIES[id].pilot_contact,false);
});
test('human approach requires active initiator Passport scope and specific recipient opt-in',()=>{
  const h=harness();
  assert.equal(h.approach().reason,'initiator_not_authorized');
  h.give('a','worlds.contact.initiate');
  assert.equal(h.approach().reason,'recipient_not_opted_in');
  h.give('b','worlds.contact.receive.human');
  assert.equal(h.approach().decision,'proposal_only');
  assert.equal(h.approach().reason,'individual_acceptance_required');
});
test('agent may approach a human only with separate agent contact consent',()=>{
  const h=harness();h.give('c','worlds.contact.initiate');h.give('b','worlds.contact.receive.human');
  assert.equal(h.approach('c','b').reason,'recipient_not_opted_in');
  h.give('b','worlds.contact.receive.agent');
  assert.equal(h.approach('c','b').decision,'proposal_only');
});
test('unverified, inactive, missing adult verification and mismatched lobby are denied',()=>{
  const h=harness();h.give('a','worlds.contact.initiate');h.give('b','worlds.contact.receive.human');
  h.people.b.verified=false;assert.equal(h.approach().reason,'presence_not_verified');h.people.b.verified=true;
  h.people.b.active=false;assert.equal(h.approach().decision,'deny');h.people.b.active=true;
  h.people.b.age_evidence='unverified';assert.equal(h.approach().reason,'adult_gate_not_verified');h.people.b.age_evidence='verified_adult';
  h.people.b.lobby_id='play';assert.equal(h.approach().reason,'presence_not_verified');h.people.b.lobby_id='business';
  assert.equal(h.approach('a','b','learn').reason,'gateway_or_lobby_not_ready');
  assert.equal(h.approach('a','a').reason,'same_subject');
});
test('blocking either direction overrides grants, no fallback if block service fails',()=>{
  const h=harness();h.give('a','worlds.contact.initiate');h.give('b','worlds.contact.receive.human');
  h.blockedPairs.add('human:b|human:a');assert.equal(h.approach().reason,'blocked');
  h.blockedPairs.clear();h.blockedPairs.add('human:a|human:b');assert.equal(h.approach().reason,'blocked');
  assert.equal(decideWorldsApproach({passport:h.passport,resolvePresence:h.resolvePresence,isBlocked:()=>{throw Error('offline')},from_presence_id:'a',to_presence_id:'b',lobby_id:'business',at}).reason,'blocked');
});
test('missing security dependencies, invalid time and revoked consent fail closed',()=>{
  const h=harness();h.give('a','worlds.contact.initiate');h.give('b','worlds.contact.receive.human');
  assert.equal(decideWorldsApproach({passport:h.passport,resolvePresence:h.resolvePresence,from_presence_id:'a',to_presence_id:'b',lobby_id:'business',at}).decision,'deny');
  assert.equal(decideWorldsApproach({passport:h.passport,resolvePresence:h.resolvePresence,isBlocked:h.isBlocked,from_presence_id:'a',to_presence_id:'b',lobby_id:'business',at:'invalid'}).decision,'deny');
  h.grants.delete('human:b|worlds.contact.receive.human|worlds:lobby:business');
  assert.equal(h.approach().reason,'recipient_not_opted_in');
});
test('agent introductions require independent opt-in from BOTH humans and agent authority',()=>{
  const h=harness();
  assert.equal(h.intro().reason,'agent_not_authorized');
  h.give('c','worlds.introduction.propose');
  h.give('a','worlds.introduction.suggest');
  assert.equal(h.intro().reason,'mutual_introduction_consent_missing');
  h.give('b','worlds.introduction.suggest');
  assert.equal(h.intro().decision,'proposal_only');
  assert.equal(h.intro().reason,'two_individual_acceptances_required');
  h.blockedPairs.add('human:b|human:a');
  assert.equal(h.intro().reason,'blocked');
});
test('no caller-supplied consent booleans, no messages or private data in decisions',()=>{
  const h=harness();h.give('a','worlds.contact.initiate');h.give('b','worlds.contact.receive.human');
  const result=h.approach();
  assert.deepEqual(Object.keys(result).sort(),['decision','reason','schema']);
  assert.equal(JSON.stringify(result).includes('human:'),false);
});
