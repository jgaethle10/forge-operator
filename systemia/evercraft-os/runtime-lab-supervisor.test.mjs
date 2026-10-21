import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateKeyPairSync, sign, createHash, randomUUID } from 'node:crypto';
import { EvercraftOsIndependentRuntimeGates } from './runtime-independent-gates.mjs';
import { EvercraftOsLabRuntimeSupervisor } from './runtime-lab-supervisor.mjs';
import {EvercraftOsLabExternalWitnessGate,LAB_EXTERNAL_WITNESS_BODY,LAB_EXTERNAL_WITNESS_ENVELOPE,LAB_EXTERNAL_WITNESS_DOMAIN,hashLabExternalWitnessReceipt} from './runtime-lab-external-witness.mjs';

const NOW=new Date('2026-10-11T23:20:00.000Z');
const ROLE_FIELDS={systemia:'systemia_mission_receipt_hash',execution_gate:'execution_policy_hash',capsule:'capsule_contract_hash',nodeseed:'device_attestation_hash'};
const fx=path.join(path.dirname(new URL(import.meta.url).pathname),'runtime-lab-fixture.mjs');
const sha=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
const canon=x=>Array.isArray(x)?x.map(canon):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])])):x;
const cleanup=async f=>{for(const j of f.supervisor.active.values()) {try {j.child.kill('SIGKILL');}catch{}}await new Promise(r=>setTimeout(r,50));fs.rmSync(f.root,{recursive:true,force:true});};
function fixture({wrongFixture=false,now=()=>NOW}={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evos-lab-'));
  const subjectRef='subject:owner';
  const plan={schema:'evercraft.os.runtime-handoff-plan.v1',node_id:'node-A',product_key:'proof-app',subject_ref:subjectRef,request_fingerprint:sha('handoff-plan'),prepared_at:NOW.toISOString(),...Object.fromEntries(Object.keys(ROLE_FIELDS).map(role=>[ROLE_FIELDS[role],sha(role)]))};
  const keys=Object.fromEntries(Object.keys(ROLE_FIELDS).map(role=>[role,generateKeyPairSync('ed25519')]));
  const handoff={revalidate:({plan:incoming,subjectRef:subject})=>incoming===plan&&subject===subjectRef&&handoff.enabled?{state:'still_prepared_for_independent_gate_review'}:{state:'held',reason:'not_current'},enabled:true};
  const gate=new EvercraftOsIndependentRuntimeGates({handoff,pinnedAuthorityKeys:Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,v.publicKey.export({format:'pem',type:'spki'})]))});
  const labKey=generateKeyPairSync('ed25519');
  const supervisor=new EvercraftOsLabRuntimeSupervisor({labEnabled:true,authorityKey:labKey.publicKey.export({format:'pem',type:'spki'}),gateVerifier:gate,ledgerDirectory:path.join(root,'receipts'),fixtureScript:fx,fixtureSha256:wrongFixture?sha('evil'):sha(fs.readFileSync(fx)),now});
  function decisions(){return Object.fromEntries(Object.keys(ROLE_FIELDS).map(role=>{
    const body={schema:'evercraft.os.runtime-independent-gate-decision.v1',role,decision:'allow',evidence_hash:plan[ROLE_FIELDS[role]],plan_fingerprint:plan.request_fingerprint,
      product_key:plan.product_key,node_id:plan.node_id,subject_ref:subjectRef,issued_at:NOW.toISOString(),expires_at:new Date(NOW.getTime()+120000).toISOString()};
    return [role,{schema:'evercraft.os.runtime-independent-gate-attestation.v1',signature_algorithm:'ed25519',body,signature_base64:sign(null,Buffer.from(JSON.stringify(canon(body))),keys[role].privateKey).toString('base64')}];
  }));}
  function permit(scope,jobId,instanceHash=null,changes={},signingKey=labKey.privateKey){const body={schema:'evercraft.os.lab-runtime-permit-body.v1',permit_id:randomUUID(),scope,plan_fingerprint:plan.request_fingerprint,node_id:plan.node_id,product_key:plan.product_key,subject_ref:subjectRef,job_id:jobId,instance_hash:instanceHash,fixture_sha256:sha(fs.readFileSync(fx)),issued_at:NOW.toISOString(),expires_at:new Date(NOW.getTime()+60000).toISOString(),...changes};return {schema:'evercraft.os.lab-runtime-permit.v1',signature_algorithm:'ed25519',body,signature_base64:sign(null,Buffer.from(JSON.stringify(canon(body))),signingKey).toString('base64')};}
  return {root,plan,supervisor,decisions,permit,subjectRef,keys,handoff,labKey,launch(args={}){const jobId=args.jobId||'job-'+randomUUID();return supervisor.launch({plan,subjectRef,attestations:decisions(),permit:permit('lab.runtime.launch',jobId),jobId,...args});}};
}
async function run(title,fn) { await test(title,async()=>{const f=fixture();try{await fn(f);}finally{await cleanup(f);}}); }

await test('lab supervisor disabled by default, even with correct keys',()=>{
  assert.throws(()=>new EvercraftOsLabRuntimeSupervisor(),/disabled_by_default/);
});
await test('fixture must match out-of-band pinned hash',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evos-lab-reject-'));
  try{const key=generateKeyPairSync('ed25519');assert.throws(()=>new EvercraftOsLabRuntimeSupervisor({labEnabled:true,authorityKey:key.publicKey.export({format:'pem',type:'spki'}),gateVerifier:{verify(){}},ledgerDirectory:root,fixtureScript:fx,fixtureSha256:sha('wrong')}),/fixture_integrity_failed/);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
await run('one-use valid lab launch is a real Linux subprocess with observed identity but NO production health claim',async f=>{
  const jobId='job-launch';const r=await f.launch({jobId});assert.equal(r.state,'lab_fixture_started',r.reason);
  assert.equal(r.process_started,true);assert.equal(r.local_process_identity_verified,true);assert.equal(r.runtime_health_verified,false);
  assert.equal(r.production_authority_granted,false);assert.equal(r.fixture_ipc_readiness_reported,true);
  assert.equal(f.supervisor.inspect({jobId}).state,'lab_fixture_alive');
});
await run('without four independent signed decisions no process is spawned',async f=>{
  const jobId='job-no-gates';const att=f.decisions();delete att.nodeseed;
  const r=await f.launch({jobId,attestations:att});assert.match(r.reason,/lab_gate_held/);assert.equal(f.supervisor.jobs.has(jobId),false);
});
await run('without lab permit no process is spawned',async f=>{
  const r=await f.launch({jobId:'job-no-permit',permit:undefined});assert.match(r.reason,/lab_permit_schema_invalid/);assert.equal(f.supervisor.jobs.size,0);
});
await run('production-like scope cannot authorize lab launch',async f=>{
  const j='job-wrong-scope';const r=await f.launch({jobId:j,permit:f.permit('app.runtime.launch',j)});assert.match(r.reason,/lab_permit_binding_invalid/);
});
await run('a forged lab launch signature is rejected before process creation',async f=>{
  const j='job-forged';const signer=generateKeyPairSync('ed25519');const r=await f.launch({jobId:j,permit:f.permit('lab.runtime.launch',j,null,{},signer.privateKey)});assert.match(r.reason,/lab_permit_signature_invalid/);
});
await run('expired lab permit is rejected',async f=>{
  const j='job-expired';const r=await f.launch({jobId:j,permit:f.permit('lab.runtime.launch',j,null,{issued_at:new Date(NOW.getTime()-120000).toISOString(),expires_at:new Date(NOW.getTime()-60000).toISOString()})});assert.match(r.reason,/lab_permit_stale/);
});
await run('subject mismatch is blocked by existing gate',async f=>{
  const r=await f.launch({jobId:'job-subject',subjectRef:'subject:untrusted'});assert.match(r.reason,/lab_gate_held/);
});
await run('a stale handoff plan blocks execution even with signatures',async f=>{
  f.handoff.enabled=false;const r=await f.launch({jobId:'job-held'});assert.match(r.reason,/lab_gate_held/);
});
await run('same permit cannot be replayed even after first process stops',async f=>{
  const j='job-original',p=f.permit('lab.runtime.launch',j),atts=f.decisions();const r=await f.launch({jobId:j,permit:p,attestations:atts});assert.equal(r.state,'lab_fixture_started',r.reason);
  const sh=sha(JSON.stringify(canon(r.process_instance)));
  const stop=await f.supervisor.stop({jobId:j,plan:f.plan,subjectRef:f.subjectRef,attestations:f.decisions(),permit:f.permit('lab.runtime.stop',j,sh)});
  assert.equal(stop.state,'lab_fixture_stopped',stop.reason);
  const second=await f.supervisor.launch({jobId:j,plan:f.plan,subjectRef:f.subjectRef,attestations:atts,permit:p});assert.equal(second.state,'held');assert.match(second.reason,/EEXIST/);
});
await run('a second job for the same app cannot start while first is active, and rejected permit remains unused',async f=>{
  const r=await f.launch({jobId:'job-one'});assert.equal(r.state,'lab_fixture_started',r.reason);
  const j='job-two',permit=f.permit('lab.runtime.launch',j);
  const s=await f.launch({jobId:j,permit});assert.match(s.reason,/EEXIST/);
  const receipt=path.join(f.root,'receipts','permits',sha(permit.body.permit_id).slice(7)+'.json');assert.equal(fs.existsSync(receipt),false);
});
await run('unauthorized stop is rejected and supervised process remains alive',async f=>{
  const j='job-stop-denied',r=await f.launch({jobId:j});assert.equal(r.state,'lab_fixture_started',r.reason);
  const stop=await f.supervisor.stop({jobId:j,plan:f.plan,subjectRef:f.subjectRef,attestations:f.decisions(),permit:null});assert.match(stop.reason,/permit_schema_invalid/);
  assert.equal(f.supervisor.inspect({jobId:j}).state,'lab_fixture_alive');
});
await run('correct separately signed stop intent can terminate same observed process',async f=>{
  const j='job-stop',r=await f.launch({jobId:j});assert.equal(r.state,'lab_fixture_started',r.reason);
  const hash=sha(JSON.stringify(canon(r.process_instance)));
  const stop=await f.supervisor.stop({jobId:j,plan:f.plan,subjectRef:f.subjectRef,attestations:f.decisions(),permit:f.permit('lab.runtime.stop',j,hash)});
  assert.equal(stop.state,'lab_fixture_stopped',stop.reason);
  assert.equal(f.supervisor.inspect({jobId:j}).state,'lab_fixture_exited');
});
await run('wrong process identity in stop permit is held rather than signaling',async f=>{
  const j='job-stop-wrong-process',r=await f.launch({jobId:j});assert.equal(r.state,'lab_fixture_started',r.reason);
  const stop=await f.supervisor.stop({jobId:j,plan:f.plan,subjectRef:f.subjectRef,attestations:f.decisions(),permit:f.permit('lab.runtime.stop',j,sha('wrong'))});assert.match(stop.reason,/lab_permit_binding_invalid/);
  assert.equal(f.supervisor.inspect({jobId:j}).state,'lab_fixture_alive');
});
await run('an existing ambiguous lock is never auto-cleared to make way for new execution',async f=>{
  const lock=path.join(f.root,'receipts','locks',sha('node-A:proof-app').slice(7)+'.json');
  fs.writeFileSync(lock,'{"state":"unresolved-crash"}');
  const r=await f.launch({jobId:'job-lock-held'});assert.match(r.reason,/EEXIST/);assert.equal(fs.existsSync(lock),true);
});
await run('a symlinked fixture is explicitly rejected',async f=>{
  const link=path.join(f.root,'alias.mjs');fs.symlinkSync(fx,link);const signer=generateKeyPairSync('ed25519');
  assert.throws(()=>new EvercraftOsLabRuntimeSupervisor({labEnabled:true,authorityKey:signer.publicKey.export({format:'pem',type:'spki'}),gateVerifier:{verify(){}},ledgerDirectory:path.join(f.root,'alt'),fixtureScript:link,fixtureSha256:sha(fs.readFileSync(fx))}),/fixture_not_regular/);
});
await run('tampering with the pinned executable fixture blocks a new spawn',async f=>{
  // The independent source stays untouched. Monkey-patch the test-only pinned hash to prove recheck failure.
  f.supervisor.fixtureHash=sha('tampered');
  const r=await f.launch({jobId:'job-tamper'});assert.match(r.reason,/lab_permit_binding_invalid|fixture_or_binary_changed/);
});
await run('concurrent launch attempts serialize: exactly one spawn and no losing-permit consumption',async f=>{
  const j1='race-first',j2='race-second';const p1=f.permit('lab.runtime.launch',j1),p2=f.permit('lab.runtime.launch',j2);
  const both=await Promise.all([f.launch({jobId:j1,permit:p1}),f.launch({jobId:j2,permit:p2})]);
  assert.deepEqual(both.map(x=>x.state).sort(),['held','lab_fixture_started']);
  const loser=both[0].state==='held'?p1:p2;
  assert.equal(fs.existsSync(path.join(f.root,'receipts','permits',sha(loser.body.permit_id).slice(7)+'.json')),false);
});
await run('uncertain consumed permit with orphan lock holds on later attempts and is not silently repaired',async f=>{
  const j='crash-before-spawn',p=f.permit('lab.runtime.launch',j);
  fs.writeFileSync(path.join(f.root,'receipts','locks',sha('node-A:proof-app').slice(7)+'.json'),JSON.stringify({job_id:j,permit_id:p.body.permit_id,lock_token:'old-unknown-token'}));
  fs.writeFileSync(path.join(f.root,'receipts','permits',sha(p.body.permit_id).slice(7)+'.json'),JSON.stringify({job_id:j,permit_id:p.body.permit_id}));
  const r=await f.launch({jobId:j,permit:p});assert.match(r.reason,/EEXIST/);
  assert.equal(fs.readdirSync(path.join(f.root,'receipts','permits')).length,1);
  assert.equal(f.supervisor.jobs.size,0);
});
await run('unowned replacement lock cannot be removed by a legitimate exiting process',async f=>{
  const j='lock-replaced',r=await f.launch({jobId:j});assert.equal(r.state,'lab_fixture_started',r.reason);
  const lock=path.join(f.root,'receipts','locks',sha('node-A:proof-app').slice(7)+'.json');
  fs.writeFileSync(lock,JSON.stringify({lock_token:'replacement-token',state:'manual-hold'}));
  const hash=sha(JSON.stringify(canon(r.process_instance)));
  const stop=await f.supervisor.stop({jobId:j,plan:f.plan,subjectRef:f.subjectRef,attestations:f.decisions(),permit:f.permit('lab.runtime.stop',j,hash)});
  assert.equal(stop.state,'lab_fixture_stopped');
  assert.equal(fs.existsSync(lock),true);
});
await run('successful stop permit cannot be replayed to stop a new process',async f=>{
  const j='original-stop',r=await f.launch({jobId:j});assert.equal(r.state,'lab_fixture_started',r.reason);
  const stopPermit=f.permit('lab.runtime.stop',j,sha(JSON.stringify(canon(r.process_instance))));
  const stop=await f.supervisor.stop({jobId:j,plan:f.plan,subjectRef:f.subjectRef,attestations:f.decisions(),permit:stopPermit});assert.equal(stop.state,'lab_fixture_stopped');
  const second=await f.supervisor.stop({jobId:j,plan:f.plan,subjectRef:f.subjectRef,attestations:f.decisions(),permit:stopPermit});assert.match(second.reason,/not_active/);
});
await test('no-ready fixture is terminated rather than being treated as a healthy service',async()=>{
  const f=fixture();const noReady=path.join(path.dirname(fx),'runtime-lab-fixture-no-ready.mjs');
  try {
    const x=new EvercraftOsLabRuntimeSupervisor({labEnabled:true,authorityKey:f.labKey.publicKey.export({type:'spki',format:'pem'}),gateVerifier:f.supervisor.gates,ledgerDirectory:path.join(f.root,'no-ready'),fixtureScript:noReady,fixtureSha256:sha(fs.readFileSync(noReady)),now:()=>NOW});
    const j='no-ready',permit=f.permit('lab.runtime.launch',j,null,{fixture_sha256:sha(fs.readFileSync(noReady))});
    const r=await x.launch({plan:f.plan,subjectRef:f.subjectRef,attestations:f.decisions(),permit,jobId:j,timeoutMs:200});
    assert.equal(r.state,'held');assert.match(r.reason,/did_not_report_ready/);
    assert.equal(x.inspect({jobId:j}).state,'lab_fixture_exited');
  }finally{await cleanup(f);}
});

await run('journal checkpoint damage blocks launch without consuming its signed lab permit',async f=>{
  const j=f.supervisor.journal;
  j.append({job_id:'prior-job',state:'proof'});
  fs.writeFileSync(j.head,JSON.stringify({schema:'tampered'}));
  const jobId='checkpoint-damage',permit=f.permit('lab.runtime.launch',jobId);
  const r=await f.launch({jobId,permit});
  assert.match(r.reason,/lab_journal_integrity_held/);
  assert.equal(f.supervisor.jobs.has(jobId),false);
  assert.equal(fs.existsSync(path.join(f.root,'receipts','permits',sha(permit.body.permit_id).slice(7)+'.json')),false);
});
await run('ambiguous journal writer reservation blocks launch before permit consumption',async f=>{
  fs.writeFileSync(f.supervisor.journal.writer,'orphan');
  const jobId='writer-ambiguous',permit=f.permit('lab.runtime.launch',jobId);
  const r=await f.launch({jobId,permit});
  assert.match(r.reason,/lab_journal_writer_ambiguous/);
  assert.equal(fs.existsSync(path.join(f.root,'receipts','permits',sha(permit.body.permit_id).slice(7)+'.json')),false);
});
await run('read-only recovery inspector observes running fixture and never clears lock',async f=>{
  const jobId='recovery-running',r=await f.launch({jobId});assert.equal(r.state,'lab_fixture_started',r.reason);
  const old=fs.readdirSync(path.join(f.root,'receipts','locks'));
  const evidence=f.supervisor.inspectRecovery();
  assert.equal(evidence.state,'held_ambiguous_locks');
  assert.equal(evidence.records[0].observation,'same_process_alive');
  assert.equal(evidence.mutation_performed,false);
  assert.deepEqual(fs.readdirSync(path.join(f.root,'receipts','locks')),old);
});
await run('corrupted history forbids authorized stop before stop-permit consumption',async f=>{
  const jobId='stop-journal-hold',r=await f.launch({jobId});assert.equal(r.state,'lab_fixture_started',r.reason);
  const journal=f.supervisor.journal;
  fs.appendFileSync(journal.log,'partial-corruption');
  const permit=f.permit('lab.runtime.stop',jobId,sha(JSON.stringify(canon(r.process_instance))));
  const stop=await f.supervisor.stop({jobId,plan:f.plan,subjectRef:f.subjectRef,attestations:f.decisions(),permit});
  assert.match(stop.reason,/lab_journal_integrity_held/);
  assert.equal(fs.existsSync(path.join(f.root,'receipts','permits',sha(permit.body.permit_id).slice(7)+'.json')),false);
  assert.equal(f.supervisor.inspect({jobId}).state,'held');
});
await run('damaged audit on process exit keeps the app lock held for manual review',async f=>{
  const jobId='audit-exit-hold',r=await f.launch({jobId});assert.equal(r.state,'lab_fixture_started',r.reason);
  fs.appendFileSync(f.supervisor.journal.log,'not-json');
  const job=f.supervisor.jobs.get(jobId);
  job.child.kill('SIGTERM');
  await new Promise(resolve=>job.child.once('exit',resolve));
  assert.equal(fs.readdirSync(path.join(f.root,'receipts','locks')).length,1);
  assert.match(f.supervisor.inspectRecovery().reason,/lab_journal_integrity_held/);
});
await run('completed authorized stop has locally verifiable lifecycle and no remaining lock',async f=>{
  const jobId='completed-lifecycle',r=await f.launch({jobId});assert.equal(r.state,'lab_fixture_started',r.reason);
  const stop=await f.supervisor.stop({jobId,plan:f.plan,subjectRef:f.subjectRef,attestations:f.decisions(),permit:f.permit('lab.runtime.stop',jobId,sha(JSON.stringify(canon(r.process_instance))))});
  assert.equal(stop.state,'lab_fixture_stopped',stop.reason);
  const audit=f.supervisor.journal.inspect();
  assert.equal(audit.state,'verified_local_chain');
  assert.deepEqual(audit.events.map(e=>e.state),['intent_recorded','spawn_observed','authorized_stop_intent','exit_observed']);
  assert.equal(f.supervisor.inspectRecovery().state,'no_locks_observed');
});


// Exact external witness mode: signing only in test harness, never in supervisor.
function strictFixture(f){
  const witnessKey=generateKeyPairSync('ed25519');let external=null;
  const witnessGate=new EvercraftOsLabExternalWitnessGate({journalId:'node-A:proof-app',publicKey:witnessKey.publicKey.export({type:'spki',format:'pem'}),witnessSource:()=>external,now:()=>NOW});
  const strict=new EvercraftOsLabRuntimeSupervisor({labEnabled:true,authorityKey:f.labKey.publicKey.export({type:'spki',format:'pem'}),gateVerifier:f.supervisor.gates,
    ledgerDirectory:path.join(f.root,'strict-ledger'),fixtureScript:fx,fixtureSha256:sha(fs.readFileSync(fx)),now:()=>NOW,witnessMode:'external_required',witnessGate});
  const publish=()=>{
    const state=strict.journal.inspect(),body={schema:LAB_EXTERNAL_WITNESS_BODY,journal_id:'node-A:proof-app',sequence:state.count,head_hash:state.head_hash,
      witness_epoch:1,issued_at:NOW.toISOString(),expires_at:new Date(NOW.getTime()+60000).toISOString()};
    const receipt={schema:LAB_EXTERNAL_WITNESS_ENVELOPE,signature_algorithm:'ed25519',body,signature_base64:sign(null,Buffer.concat([
      Buffer.from(LAB_EXTERNAL_WITNESS_DOMAIN),Buffer.from(JSON.stringify(canon(body)))]),witnessKey.privateKey).toString('base64')};
    external={receipt,committedDigest:hashLabExternalWitnessReceipt(receipt)};
    return external;
  };
  const setExternal=x=>{external=x;};
  return {strict,publish,setExternal};
}
await run('external-required mode fails closed before consuming launch permit if witness absent',async f=>{
 const x=strictFixture(f),jobId='strict-absent',permit=f.permit('lab.runtime.launch',jobId);
 const r=await x.strict.launch({jobId,plan:f.plan,subjectRef:f.subjectRef,attestations:f.decisions(),permit});
 assert.match(r.reason,/lab_external_witness_held:witness_external_commitment_missing/);
 assert.equal(fs.readdirSync(path.join(f.root,'strict-ledger','permits')).length,0);
 assert.equal(x.strict.jobs.size,0);
});
await run('exact detached witness enables pinned fixture launch; witness must be refreshed before separately authorized stop',async f=>{
 const x=strictFixture(f),jobId='strict-lifecycle';x.publish();
 try{
   const launch=await x.strict.launch({jobId,plan:f.plan,subjectRef:f.subjectRef,attestations:f.decisions(),permit:f.permit('lab.runtime.launch',jobId)});
   assert.equal(launch.state,'lab_fixture_started',launch.reason);
   assert.match(x.strict.inspectRecovery().reason,/lab_external_witness_held:witness_checkpoint_diverged/);
   const stopPermit=f.permit('lab.runtime.stop',jobId,sha(JSON.stringify(canon(launch.process_instance))));
   const held=await x.strict.stop({jobId,plan:f.plan,subjectRef:f.subjectRef,attestations:f.decisions(),permit:stopPermit});
   assert.match(held.reason,/lab_external_witness_held/);
   assert.equal(fs.readdirSync(path.join(f.root,'strict-ledger','permits')).length,1);
   x.publish();
   const stop=await x.strict.stop({jobId,plan:f.plan,subjectRef:f.subjectRef,attestations:f.decisions(),permit:stopPermit});
   assert.equal(stop.state,'lab_fixture_stopped',stop.reason);
   assert.equal(x.strict.inspect({jobId}).state,'lab_fixture_exited');
 }finally{for(const job of x.strict.active.values())try{job.child.kill('SIGKILL');}catch{}await new Promise(r=>setTimeout(r,50));}
});
await run('signed witness with incorrect external commitment blocks launch before permit consumption',async f=>{
 const x=strictFixture(f),external=x.publish();x.setExternal({...external,committedDigest:sha('not-the-witness')});
 const jobId='strict-mismatch',permit=f.permit('lab.runtime.launch',jobId);
 const r=await x.strict.launch({jobId,plan:f.plan,subjectRef:f.subjectRef,attestations:f.decisions(),permit});
 assert.match(r.reason,/lab_external_witness_held:witness_external_commitment_mismatch/);
 assert.equal(fs.readdirSync(path.join(f.root,'strict-ledger','permits')).length,0);
});
await run('external-required recovery inspector reads but does not repair mismatched independent witness',async f=>{
 const x=strictFixture(f);x.publish();x.strict.journal.append({job_id:'earlier',state:'intent'});
 const before=fs.readFileSync(x.strict.journal.log);
 const r=x.strict.inspectRecovery();assert.equal(r.state,'held');assert.match(r.reason,/lab_external_witness_held/);assert.equal(r.mutation_performed,false);
 assert.deepEqual(fs.readFileSync(x.strict.journal.log),before);
});
await run('strict witness configuration without gate is rejected at construction',async f=>{
 assert.throws(()=>new EvercraftOsLabRuntimeSupervisor({labEnabled:true,authorityKey:f.labKey.publicKey.export({type:'spki',format:'pem'}),
 gateVerifier:f.supervisor.gates,ledgerDirectory:path.join(f.root,'bad-strict'),fixtureScript:fx,fixtureSha256:sha(fs.readFileSync(fx)),witnessMode:'external_required'}),/lab_external_witness_gate_required/);
});

await run('strict mode rejects a fake witness verifier that simply asserts approval',async f=>{
 assert.throws(()=>new EvercraftOsLabRuntimeSupervisor({labEnabled:true,authorityKey:f.labKey.publicKey.export({type:'spki',format:'pem'}),
 gateVerifier:f.supervisor.gates,ledgerDirectory:path.join(f.root,'fake-witness'),fixtureScript:fx,fixtureSha256:sha(fs.readFileSync(fx)),
 witnessMode:'external_required',witnessGate:{inspect:()=>({state:'witnessed_exact_checkpoint'})}}),/lab_external_witness_gate_required/);
});
