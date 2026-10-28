import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {createWorld} from '../public/the-window/world.mjs';
import {hash} from '../systemia/society/window-agent-boundary.mjs';
import {initializeLocalSociety,readLocalSociety,readLocalObserver,runLocalSocietyTurn,advanceLocalSocietyClock} from '../systemia/society/window-local-journal.mjs';

const now=Date.parse('2026-10-23T12:00:00Z');
const provider='approved_test_adapter',model='synthetic_model_v1';
async function sandbox(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mossmere-agent-journal-'));
  t.after(async()=>{await fs.rm(dir,{recursive:true,force:true});});
  const world=createWorld(now,42);
  world.actors[0].zone='bakery';
  world.actors[1].zone='bakery';
  await initializeLocalSociety({dir,world,now});
  return {dir,world};
}
function client(opts={}){
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const calls={infer:0,reserve:0,reconcile:[]};
  const providerClient={infer:async request=>{
    calls.infer++;
    if(opts.blockInference)await opts.blockInference();
    return {provider,model,request_id:opts.requestId||'request_journal_123456789',
      output:{action:opts.action||{type:'wait'}},
      input_tokens:100,output_tokens:20,cost_micro_usd:12};
  }};
  const budgetGate={
    reserve:async request=>{calls.reserve++;return {...request,
      society:'mossmere',approved:opts.approved!==false,provider,model,
      expires_at:now+60000,max_tokens:200,max_cost_micro_usd:100,
      reservation_id:'approved_lease_12345678'};},
    reconcile:async record=>{calls.reconcile.push(record);}
  };
  return {providerClient,budgetGate,adapterSigningKey:privateKey.export({type:'pkcs8',format:'pem'}),
    trustedAdapterPublicKey:publicKey.export({type:'spki',format:'pem'}),calls};
}
function turn(dir,h,agentId='r1',at=now){
  const {calls,...rest}=h;
  return runLocalSocietyTurn({dir,agentId,provider,model,now:at,...rest});
}
test('sandbox initializes explicitly, cannot reset existing data and remains held',async t=>{
  const {dir,world}=await sandbox(t);
  const s=await readLocalSociety({dir});
  assert.equal(s.sequence,0);
  assert.equal(s.world_hash,hash(world));
  assert.equal(s.release_status,'held_local_only');
  await assert.rejects(()=>initializeLocalSociety({dir,world,now}),/refusing reset/);
});
test('a modeled choice is atomically persisted and survives reopening',async t=>{
  const {dir}=await sandbox(t);
  const a=await turn(dir,client({action:{type:'move',zone:'market'}}));
  assert.equal(a.sequence,1);
  const reload=await readLocalSociety({dir});
  assert.equal(reload.world.actors[0].zone,'market');
  assert.equal(reload.records.length,1);
  assert.equal(reload.records[0].before_world_hash,reload.genesis_world_hash);
  assert.equal(reload.last_record_hash,a.record_hash);
  const publicView=await readLocalObserver({dir});
  assert.equal(publicView.sequence,1);
  assert.equal(publicView.decisions.length,1);
  assert.equal(publicView.release_status,'held_local_only');
  assert.equal(JSON.stringify(publicView).includes('request_journal_123456789'),false);
});
test('sequential residents have separate source outcomes and a chained history',async t=>{
  const {dir}=await sandbox(t);
  await turn(dir,client({action:{type:'offer_help',to:'r2',kind:'repair'},requestId:'request_offer_123456'}));
  const first=await readLocalSociety({dir});
  const invitation=first.world.agent_experiment_v1.invitations[0];
  await turn(dir,client({action:{type:'respond',invitation_id:invitation.id,kind:'decline'},requestId:'request_decline_123456'}),'r2');
  const s=await readLocalSociety({dir});
  assert.equal(s.sequence,2);
  assert.equal(s.records[1].previous_hash,s.records[0].record_hash);
  assert.equal(s.records[1].before_world_hash,s.records[0].after_world_hash);
  assert.equal(s.world.agent_experiment_v1.invitations[0].state,'declined');
  assert.equal(s.world.agent_experiment_v1.receipts.length,2);
  assert.equal(s.release_status,'held_local_only');
  assert.equal((await readLocalObserver({dir})).decisions.length,2);
});
test('one resident cannot spend multiple action receipts in a single town tick',async t=>{
  const {dir}=await sandbox(t);
  const first=client({requestId:'request_first_12345678'});
  await turn(dir,first);
  const second=client({requestId:'request_second_12345678'});
  await assert.rejects(()=>turn(dir,second),/already acted/);
  assert.equal(second.calls.infer,0);
  assert.equal((await readLocalSociety({dir})).sequence,1);
});
test('bad model actions and unapproved budgets cannot advance disk state',async t=>{
  const {dir}=await sandbox(t);
  const original=await readLocalSociety({dir});
  const blocked=client({approved:false});
  await assert.rejects(()=>turn(dir,blocked),/Invalid or expired/);
  assert.equal(blocked.calls.infer,0);
  const invalid=client({action:{type:'external_url',url:'https://example.org'}});
  await assert.rejects(()=>turn(dir,invalid),/Unsupported action/);
  const after=await readLocalSociety({dir});
  assert.deepEqual(after,original);
});
test('tampered world or historical record is rejected on reload',async t=>{
  const {dir}=await sandbox(t);
  await turn(dir,client());
  const file=path.join(dir,'mossmere-agent-sandbox.json');
  const stored=JSON.parse(await fs.readFile(file,'utf8'));
  stored.world.actors[0].coins+=500;
  await fs.writeFile(file,JSON.stringify(stored));
  await assert.rejects(()=>readLocalSociety({dir}),/integrity mismatch/);
});
test('contention never calls a second model or skips the lock',async t=>{
  const {dir}=await sandbox(t);
  let openGate;
  const released=new Promise(resolve=>{openGate=resolve;});
  let seen;
  const entered=new Promise(resolve=>{seen=resolve;});
  const first=client({requestId:'request_waiting_1234567',blockInference:async()=>{seen();await released;}});
  const pending=turn(dir,first);
  await entered;
  const second=client({requestId:'request_race_12345678'});
  try{
    await assert.rejects(()=>turn(dir,second),e=>e.code==='EEXIST');
    assert.equal(second.calls.infer,0);
  }finally{openGate();}
  await pending;
  assert.equal((await readLocalSociety({dir})).sequence,1);
});
test('leftover lock refuses work and requires operator repair, never silent reset',async t=>{
  const {dir}=await sandbox(t);
  const lock=path.join(dir,'.mossmere-agent-sandbox.lock');
  await fs.mkdir(lock);
  const h=client();
  await assert.rejects(()=>turn(dir,h),e=>e.code==='EEXIST');
  assert.equal(h.calls.infer,0);
  assert.equal((await readLocalSociety({dir})).sequence,0);
});
test('private memories and provider request IDs never appear in observer projection',async t=>{
  const {dir}=await sandbox(t);
  const file=path.join(dir,'mossmere-agent-sandbox.json');
  const s=JSON.parse(await fs.readFile(file,'utf8'));
  s.world.actors[0].memories=['private debugging secret'];
  s.world_hash=hash(s.world);s.genesis_world_hash=s.world_hash;
  await fs.writeFile(file,JSON.stringify(s));
  await turn(dir,client({requestId:'request_private_1234567'}));
  const observer=await readLocalObserver({dir});
  const projection=JSON.stringify(observer);
  assert.ok(!projection.includes('private debugging secret'));
  assert.ok(!projection.includes('request_private_1234567'));
  assert.ok(projection.includes('adapter_attested_unverified_model'));
});

test('passive world time advances without scripting an agent choice and enables future real choices',async t=>{
  const {dir}=await sandbox(t);
  await turn(dir,client({requestId:'request_tick_one_00000001',action:{type:'wait'}}));
  const before=await readLocalSociety({dir});
  const priorEvents=before.world.events.map(e=>e.description);
  const priorPositions=before.world.actors.map(a=>a.zone);
  const priorActions=before.world.actors.map(a=>a.action);
  await assert.rejects(()=>advanceLocalSocietyClock({dir,now:now+10_000}),/too early/);
  const tick=await advanceLocalSocietyClock({dir,now:now+30_000});
  assert.equal(tick.source,'passive_environment_no_model');
  const after=await readLocalSociety({dir});
  assert.equal(after.world.tick,before.world.tick+1);
  assert.equal(after.world.minute,before.world.minute+15);
  assert.deepEqual(after.world.events.map(e=>e.description),priorEvents);
  assert.deepEqual(after.world.actors.map(a=>a.zone),priorPositions);
  assert.deepEqual(after.world.actors.map(a=>a.action),priorActions);
  assert.equal(after.records[1].kind,'environment_tick');
  assert.equal(after.records[1].provider_request_id,null);
  assert.equal(after.records[1].previous_hash,after.records[0].record_hash);
  await turn(dir,client({requestId:'request_tick_two_00000002',action:{type:'move',zone:'market'}}),'r1',now+30_000);
  const result=await readLocalSociety({dir});
  assert.equal(result.sequence,3);
  assert.equal(result.world.actors[0].zone,'market');
  assert.equal(result.records.filter(r=>r.kind==='agent_decision').length,2);
  assert.equal(result.records.filter(r=>r.kind==='environment_tick').length,1);
});
test('the passive clock is a separate factual event in the journal, not fake model activity',async t=>{
  const {dir}=await sandbox(t);
  await advanceLocalSocietyClock({dir,now:now+30_000});
  await advanceLocalSocietyClock({dir,now:now+60_000});
  const s=await readLocalSociety({dir});
  assert.equal(s.records.length,2);
  assert.equal(s.records[0].kind,'environment_tick');
  assert.equal(s.records[1].kind,'environment_tick');
  assert.equal(s.world.agent_experiment_v1,undefined);
  assert.equal((await readLocalObserver({dir})).decisions.length,0);
  assert.equal(s.world.actors.length,12);
});
