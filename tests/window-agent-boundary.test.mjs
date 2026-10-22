import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createWorld} from '../public/the-window/world.mjs';
import {
  DECISION_SCHEMA,RECEIPT_SCHEMA,hash,residentObservation,applyAgentDecision,spectatorDecisions
} from '../systemia/society/window-agent-boundary.mjs';

const now=Date.parse('2026-10-22T20:00:00Z');
function setup(){
  const w=createWorld(now,818);
  w.actors.find(a=>a.id==='r1').zone='bakery';
  w.actors.find(a=>a.id==='r2').zone='bakery';
  w.actors.find(a=>a.id==='r3').zone='lake';
  return w;
}
function prepare(w,id,action){
  const obs=residentObservation(w,id);
  return {obs,decision:{schema:DECISION_SCHEMA,agent_id:id,observation_hash:hash(obs),action}};
}
function fixture(w,id,action){
  const {obs,decision}=prepare(w,id,action);
  return applyAgentDecision(w,obs,decision,null,{mode:'fixture',allowFixtures:true});
}
test('each resident has different, limited observations and no other residents private memories',()=>{
  const w=setup();
  w.actors.find(a=>a.id==='r2').memories=['secret for Ivo'];
  const mara=residentObservation(w,'r1');
  assert.equal(mara.agent_id,'r1');
  assert.ok(mara.surroundings.nearby.some(x=>x.id==='r2'));
  assert.ok(!mara.surroundings.nearby.some(x=>x.id==='r3'));
  assert.ok(!JSON.stringify(mara).includes('secret for Ivo'));
  assert.equal(Object.hasOwn(mara,'actors'),false);
  assert.equal(Object.hasOwn(mara.surroundings,'private_memory'),false);
  const ivo=residentObservation(w,'r2');
  assert.ok(ivo.self.memories.includes('secret for Ivo'));
  assert.notEqual(hash(ivo),hash(mara));
});
test('a model cannot freely mutate world, inject command fields, or act as another resident',()=>{
  const w=setup(),{obs,decision}=prepare(w,'r1',{type:'wait'});
  const before=hash(w);
  assert.throws(()=>applyAgentDecision(w,obs,decision),/No approved model adapter/);
  assert.throws(()=>applyAgentDecision(w,obs,decision,null,{mode:'fixture'}),/Test fixtures forbidden/);
  assert.throws(()=>applyAgentDecision(w,obs,{...decision,agent_id:'r2'},null,{mode:'fixture',allowFixtures:true}),/mismatched/);
  assert.throws(()=>applyAgentDecision(w,obs,{...decision,action:{type:'wait',shell:'rm -rf /'}},null,{mode:'fixture',allowFixtures:true}),/Unsupported|Extra/);
  assert.deepEqual(w,setup());
  assert.equal(hash(w),before);
});
test('action choice, not a hardcoded town schedule, creates different observable outcomes',()=>{
  const w=setup();
  const stay=fixture(w,'r1',{type:'wait'});
  const travel=fixture(w,'r1',{type:'move',zone:'garden'});
  assert.equal(stay.world.actors[0].zone,'bakery');
  assert.equal(travel.world.actors[0].zone,'garden');
  assert.notEqual(stay.receipt.outcome,travel.receipt.outcome);
  assert.equal(w.actors[0].zone,'bakery');
  assert.equal(stay.receipt.provenance,'fixture');
  assert.equal(travel.world.agent_experiment_v1.receipts.length,1);
  assert.equal(travel.world.events[0].source,'agent_experiment_v1');
});
test('resident can offer help, other resident decides independently to accept or decline',()=>{
  const w=setup();
  const invite=fixture(w,'r1',{type:'offer_help',to:'r2',kind:'repair'});
  const invitation=invite.world.agent_experiment_v1.invitations[0];
  assert.equal(invitation.state,'pending');
  assert.equal(invitation.from,'r1');
  const accept=fixture(invite.world,'r2',{type:'respond',invitation_id:invitation.id,kind:'accept'});
  const decline=fixture(invite.world,'r2',{type:'respond',invitation_id:invitation.id,kind:'decline'});
  assert.equal(accept.world.agent_experiment_v1.invitations[0].state,'accepted');
  assert.equal(decline.world.agent_experiment_v1.invitations[0].state,'declined');
  assert.equal(accept.world.metrics.repairs,w.metrics.repairs+2);
  assert.equal(decline.world.metrics.repairs,w.metrics.repairs);
  assert.ok(accept.world.actors[0].bonds.r2>decline.world.actors[0].bonds.r2);
  assert.equal(accept.receipt.action.type,'respond');
  assert.equal(decline.receipt.action.type,'respond');
});
test('finite resources and geographic constraints cannot be overruled by agent prose',()=>{
  const w=setup();
  assert.throws(()=>fixture(w,'r1',{type:'share',to:'r3',amount:2}),/out of range/);
  w.actors[0].coins=1;
  assert.throws(()=>fixture(w,'r1',{type:'share',to:'r2',amount:5}),/Insufficient/);
  w.actors[0].coins=0;
  assert.throws(()=>fixture(w,'r1',{type:'work'}),/Not able to work|not/);
  w.actors[0].energy=0;
  assert.throws(()=>fixture(w,'r1',{type:'move',zone:'garden'}),/exhausted/);
  assert.equal(w.events.length,0);
});
test('stale decisions and replay cannot cause duplicate effects',()=>{
  const w=setup();
  const {obs,decision}=prepare(w,'r1',{type:'wait'});
  const applied=applyAgentDecision(w,obs,decision,null,{mode:'fixture',allowFixtures:true});
  assert.throws(()=>applyAgentDecision(applied.world,obs,decision,null,{mode:'fixture',allowFixtures:true}),/stale/i);
  assert.throws(()=>applyAgentDecision({...w,actors:[...w.actors].reverse()},obs,decision,null,{mode:'fixture',allowFixtures:true}),/stale/i);
});
test('wrong-key, forged, expired or substituted provider signatures fail closed',()=>{
  const w=setup(),{obs,decision}=prepare(w,'r1',{type:'move',zone:'market'});
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const {publicKey:rogue}=generateKeyPairSync('ed25519');
  const proof={provider:'sandbox-model',provider_request_id:'request_1700000000000',issued_at:now};
  const packet={schema:RECEIPT_SCHEMA,observation_hash:decision.observation_hash,
    decision_hash:hash(decision),provider:proof.provider,provider_request_id:proof.provider_request_id,
    issued_at:proof.issued_at};
  proof.signature=sign(null,Buffer.from(JSON.stringify(packet)),privateKey).toString('base64');
  const publicPem=publicKey.export({type:'spki',format:'pem'});
  const roguePem=rogue.export({type:'spki',format:'pem'});
  assert.throws(()=>applyAgentDecision(w,obs,decision,proof,{mode:'attested_adapter',now,trustedPublicKey:roguePem}),/Untrusted/);
  assert.throws(()=>applyAgentDecision(w,obs,decision,proof,{mode:'attested_adapter',now:now+301000,trustedPublicKey:publicPem}),/Stale/);
  const changed={...decision,action:{type:'work'}};
  assert.throws(()=>applyAgentDecision(w,obs,changed,proof,{mode:'attested_adapter',now,trustedPublicKey:publicPem}),/Untrusted/);
  const verified=applyAgentDecision(w,obs,decision,proof,{mode:'attested_adapter',now,trustedPublicKey:publicPem});
  assert.equal(verified.receipt.provenance,'adapter_attested_unverified_model');
  assert.equal(verified.receipt.provider_request_id,proof.provider_request_id);
  assert.equal(verified.world.actors[0].zone,'market');
  assert.equal(verified.receipt.release_status,'held_not_live');
});
test('public spectator decision trail exposes action/outcome, not observations, secrets or free-text reasoning',()=>{
  const w=setup();w.actors[0].memories=['private message'];
  const a=fixture(w,'r1',{type:'wait'});
  const projection=spectatorDecisions(a.world);
  assert.equal(projection.length,1);
  assert.equal(projection[0].provenance,'fixture');
  assert.equal(projection[0].action,'wait');
  assert.ok(projection[0].receipt_hash);
  assert.ok(!JSON.stringify(projection).includes('private message'));
  assert.ok(!JSON.stringify(projection).includes('world_hash'));
});
test('invalid actions preserve the original world and stay out of public receipts',()=>{
  const w=setup(),before=hash(w);
  assert.throws(()=>fixture(w,'r1',{type:'offer_help',to:'r3',kind:'repair'}),/not local/);
  assert.equal(hash(w),before);
  assert.deepEqual(spectatorDecisions(w),[]);
});
