import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import {createGoalState,admitGoalPlan,authorizeGoalWork,startGoalWork} from './goal-runtime.mjs';
import {humanApprovalMessage,verifyGoalHumanApproval} from './goal-human-approval.mjs';

const NOW=new Date('2026-10-07T19:00:00Z');
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const {publicKey:wrongPublicKey}=generateKeyPairSync('ed25519');
const trustedPublicKeys={'systemia-human-gate-v1':publicKey.export({format:'pem',type:'spki'})};
const state=admitGoalPlan({state:createGoalState({
 goalKey:'goal-safe',missionKey:'mission-safe',objective:'An authorized operation',now:NOW
}),plan:[
 {work_key:'public',work_type:'research'},
 {work_key:'charge',work_type:'payment',human_gate_required:true}
],now:NOW});
const claims=Object.freeze({
 schema:'evercraft.goal.human-approval-claims.v1',
 mission_key:'mission-safe',goal_key:'goal-safe',work_key:'charge',
 scope:'systemia.goal.authorize',approved:true,
 receipt_ref:'passport:verified-test-001',
 issued_at:'2026-10-07T18:55:00.000Z',
 expires_at:'2026-10-07T19:55:00.000Z'
});
function envelope(overrides={}){
 const claim={...claims,...overrides};
 return {schema:'evercraft.goal.human-approval-envelope.v1',
  key_id:'systemia-human-gate-v1',claims:claim,
  signature_base64:sign(null,humanApprovalMessage(claim),privateKey).toString('base64')};
}
test('arbitrary authorizationRef cannot unlock a human gate',()=>{
 assert.throws(()=>authorizeGoalWork({
  state,workKey:'charge',authorizationRef:'human:approved',now:NOW
 }),/signed human approval envelope required/);
 assert.equal(state.tasks.find(t=>t.work_key==='charge').human_gate_unresolved,true);
});
test('valid trusted signature admits gate and is reverified at start',()=>{
 const signed=envelope();
 const unlocked=authorizeGoalWork({
  state,workKey:'charge',approval:signed,trustedPublicKeys,now:NOW
 });
 const task=unlocked.tasks.find(t=>t.work_key==='charge');
 assert.equal(task.human_gate_unresolved,false);
 assert.deepEqual(task.authorization_refs,['passport:verified-test-001']);
 const started=startGoalWork({state:unlocked,workKey:'charge',trustedPublicKeys,now:NOW});
 assert.equal(started.tasks.find(t=>t.work_key==='charge').status,'executing');
 assert.throws(()=>startGoalWork({state:unlocked,workKey:'charge',now:NOW}),
  /trusted human approval signer missing/);
});
test('untrusted signer or substituted key fails',()=>{
 assert.throws(()=>authorizeGoalWork({
  state,workKey:'charge',approval:envelope(),now:NOW
 }),/trusted human approval signer missing/);
 assert.throws(()=>authorizeGoalWork({
  state,workKey:'charge',approval:envelope(),
  trustedPublicKeys:{'systemia-human-gate-v1':wrongPublicKey.export({format:'pem',type:'spki'})},now:NOW
 }),/signature not verified/);
});
test('claims cannot cross mission, goal, work or scope boundaries',()=>{
 for (const bad of [
  {mission_key:'other'},{goal_key:'other'},{work_key:'public'},
  {scope:'systemia.goal.execute'},{approved:false}
 ]){
  assert.throws(()=>authorizeGoalWork({
   state,workKey:'charge',approval:envelope(bad),trustedPublicKeys,now:NOW
  }),/claim mismatch/);
 }
});
test('expired, overlong and future-dated grants are rejected',()=>{
 for(const bad of [
  {expires_at:'2026-10-07T18:56:00.000Z'},
  {expires_at:'2026-10-09T18:55:00.000Z'},
  {issued_at:'2026-10-08T18:55:00.000Z',expires_at:'2026-10-08T19:55:00.000Z'}
 ]){
  assert.throws(()=>authorizeGoalWork({
   state,workKey:'charge',approval:envelope(bad),trustedPublicKeys,now:NOW
  }),/outside validity window/);
 }
});
test('signature tampering and unsigned added fields cannot gain authority',()=>{
 const modified=envelope();
 modified.claims.receipt_ref='another';
 assert.throws(()=>verifyGoalHumanApproval({
  approval:modified,state,workKey:'charge',trustedPublicKeys,now:NOW
 }),/signature not verified/);
 const extra=envelope();
 extra.claims.attacker_authorized=true;
 assert.throws(()=>verifyGoalHumanApproval({
  approval:extra,state,workKey:'charge',trustedPublicKeys,now:NOW
 }),/claims shape invalid/);
});
test('even previously authorized state cannot execute after approval expiry',()=>{
 const approved=authorizeGoalWork({
  state,workKey:'charge',approval:envelope(),trustedPublicKeys,now:NOW
 });
 assert.throws(()=>startGoalWork({
  state:approved,workKey:'charge',trustedPublicKeys,now:new Date('2026-10-07T20:00:00Z')
 }),/outside validity window/);
});
test('injected untrusted envelope public key is never used as an authority',()=>{
 const foreign=envelope();
 foreign.key_id='missing-key';
 assert.throws(()=>authorizeGoalWork({
  state,workKey:'charge',approval:foreign,trustedPublicKeys,now:NOW
 }),/trusted human approval signer missing/);
});
