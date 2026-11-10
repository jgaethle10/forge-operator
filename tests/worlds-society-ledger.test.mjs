import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSocietyObservation,OBSERVATION_SCHEMA,RECEIPT_SCHEMA} from '../public/worlds/society-ledger.mjs';

export function fixture(){
 return {
  schema:OBSERVATION_SCHEMA,
  origin:'operator_supplied_local_snapshot_not_authenticated',
  verified:'internal_world_hash_only',
  release_status:'held',
  model_mode:'civic_and_social_policy_no_llm',
  observation_created_from:{sequence:215,tick:66290,heartbeat_at:'2026-11-10T00:25:06.900Z',world_hash:'a'.repeat(64)},
  historical_limit:'only_retained_bounded_chronicle_not_full_history',
  residents:Array.from({length:12},(_,i)=>({id:'r'+(i+1),name:'Resident '+(i+1),job:'gardener',zone:'garden',emoji:'🌱'})),
  decision_projection:{
   schema:RECEIPT_SCHEMA,execution_mode:'deterministic_rules_no_llm',
   attestation:'content_digest_not_signature',coverage:'partial_bounded_ledger',
   total_events_generated:404,policy_events_available:2,omitted_policy_events:0,
   receipts:[
    {event_id:'e500',source:'social_policy_v1',event_type:'promise_made',actor_id:'r2',
     related_actor_id:'r3',day:12,time:'09:30',description:'A resident offered to help.',
     authority:'window_civic_social_rule_policy',inference:'none',external_actions:false,
     fictional:true,content_sha256:'b'.repeat(64)}
   ]
  }
 };
}
test('accepts only bounded fictional policy observation, never mutates input',()=>{
 const source=fixture(),before=JSON.stringify(source);
 const result=validateSocietyObservation(source);
 assert.equal(result.residents.length,12);
 assert.equal(result.receipts.length,1);
 assert.equal(result.tick,66290);
 assert.equal(result.coverage,'partial_bounded_ledger');
 assert.equal(result.receipts[0].actor_id,'r2');
 assert.equal(JSON.stringify(source),before);
});
test('refuses invented live LLM and release claims',()=>{
 const source=fixture();
 for(const patch of [
  {model_mode:'autonomous_agents'},
  {release_status:'live'},
  {verified:'signature_verified'},
  {origin:'live_cloud_stream'}
 ]){
  assert.throws(()=>validateSocietyObservation({...source,...patch}),/Unsupported or unverified/);
 }
});
test('refuses duplicate identity, forged actor, oversized ledger or missing content digest',()=>{
 let source=fixture();source.residents[1].id='r1';
 assert.throws(()=>validateSocietyObservation(source),/Invalid fictional resident/);
 source=fixture();source.decision_projection.receipts[0].actor_id='r999';
 assert.throws(()=>validateSocietyObservation(source),/Malformed fictional/);
 source=fixture();source.decision_projection.receipts[0].content_sha256='not-a-hash';
 assert.throws(()=>validateSocietyObservation(source),/Malformed fictional/);
 source=fixture();source.decision_projection.receipts=Array.from({length:49},(_,i)=>({...source.decision_projection.receipts[0],event_id:'e'+(i+1)}));
 assert.throws(()=>validateSocietyObservation(source),/Unsupported or unverified/);
});
