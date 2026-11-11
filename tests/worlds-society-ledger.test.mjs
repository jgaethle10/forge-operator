import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {validateSocietyObservation,verifySocietyObservationReceipts,OBSERVATION_SCHEMA,RECEIPT_SCHEMA} from '../public/worlds/society-ledger.mjs';

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

test('browser-side SHA-256 matches source event evidence and rejects altered text',async()=>{
 const source=fixture();
 const r=source.decision_projection.receipts[0];
 const evidence={
  event_id:r.event_id,source:r.source,event_type:r.event_type,
  actor_id:r.actor_id,related_actor_id:r.related_actor_id,
  day:r.day,time:r.time,description:r.description
 };
 r.content_sha256=createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
 const result=await verifySocietyObservationReceipts(source,{subtle:webcrypto.subtle});
 assert.equal(result.receipts[0].content_sha256,r.content_sha256);
 r.description+=' Tampered after the digest.';
 await assert.rejects(()=>verifySocietyObservationReceipts(source,{subtle:webcrypto.subtle}),/digest mismatch/);
 await assert.rejects(()=>verifySocietyObservationReceipts(fixture(),{subtle:null}),/unavailable/);
});
test('file-reported pinned GitHub commit is displayed only with bounded exact metadata',()=>{
 const source=fixture();
 source.source_fetch={
  kind:'github_https_commit_pinned_read_only',
  repo:'jgaethle10/forge-operator',
  branch:'window-society-state',
  path:'state/window.json',
  commit_sha:'a'.repeat(40),
  blob_sha:'b'.repeat(40),
  observed_at:'2026-11-10T23:00:00.000Z',
  assertion:'git_blob_and_world_content_consistency_not_signed_attestation'
 };
 const parsed=validateSocietyObservation(source);
 assert.equal(parsed.sourceFetch.commitSha,'a'.repeat(40));
 source.source_fetch.repo='unknown/other';
 assert.throws(()=>validateSocietyObservation(source),/Invalid file-supplied source provenance/);
});
test('unknown rule-policy event types and invalid fictional clock data fail closed',()=>{
 let source=fixture();
 source.decision_projection.receipts[0].event_type='remote_payment';
 assert.throws(()=>validateSocietyObservation(source),/Malformed fictional/);
 source=fixture();source.decision_projection.receipts[0].time='32:66';
 assert.throws(()=>validateSocietyObservation(source),/Malformed fictional/);
});

test('saved cumulative societal outcome totals survive validation, but impossible totals do not',()=>{
 const source=fixture();
 source.snapshot_stats={
  civic:{proposed:221,completed:220,failed:0},
  social:{promised:1949,kept:1818,broken:130,declined:234}
 };
 const parsed=validateSocietyObservation(source);
 assert.equal(parsed.stats.civic.completed,220);
 assert.equal(parsed.stats.social.kept,1818);
 assert.equal(parsed.stats.social.broken,130);
 source.snapshot_stats.social.kept=2000;
 assert.throws(()=>validateSocietyObservation(source),/Inconsistent saved promise totals/);
 source.snapshot_stats.social.kept=-1;
 assert.throws(()=>validateSocietyObservation(source),/Invalid saved simulation totals/);
});
