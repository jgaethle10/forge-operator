import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SabanFencedAckJournal } from './fenced-ack-journal.mjs';

const execFileAsync = promisify(execFile);
const scratch=[];
const digest = char => 'sha256:' + char.repeat(64);
function makeJournal(secret='bounded-test-secret') {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-fenced-ack-'));
  scratch.push(root);
  return {root,journal:new SabanFencedAckJournal({stateDir:root,integritySecret:secret})};
}
test.after(()=>{for(const x of scratch) fs.rmSync(x,{recursive:true,force:true});});
const base = {jobKey:'os-readiness:runtime',workloadClass:'saban.source-readiness.v1',workDigest:digest('a'),now:10000};

test('one logical submission deduplicates without ever launching a worker',()=>{
  const {journal}=makeJournal();
  const first=journal.submit(base);
  assert.equal(first.deduplicated,false);
  assert.equal(first.state,'queued');
  assert.equal(first.systemia_execution_authorized,false);
  assert.equal(first.physical_worker_dispatched,false);
  assert.equal(journal.submit(base).deduplicated,true);
  assert.equal(journal.inspect({jobKey:base.jobKey,now:10001}).journal_events,1);
  assert.throws(()=>journal.submit({...base,workDigest:digest('b')}),/idempotency_conflict/);
});

test('fenced acknowledgement persists and lost-response replay stays idempotent',()=>{
  const {root,journal}=makeJournal();
  journal.submit(base);
  const granted=journal.acquire({jobKey:base.jobKey,workerId:'local-a',now:11000,leaseMs:5000});
  assert.equal(granted.state,'leased');
  assert.equal(granted.attempts,1);
  assert.match(granted.lease_token,/^[a-f0-9]{64}$/);
  const record=journal.acknowledge({jobKey:base.jobKey,workerId:'local-a',
    leaseToken:granted.lease_token,resultDigest:digest('c'),receiptRef:'proof:readonly-one',now:12000});
  assert.equal(record.state,'ack_recorded');
  assert.equal(record.external_effect_verified,false);
  assert.equal(record.deduplicated,false);
  const again=journal.acknowledge({jobKey:base.jobKey,workerId:'local-a',
    leaseToken:granted.lease_token,resultDigest:digest('c'),receiptRef:'proof:readonly-one',now:13000});
  assert.equal(again.deduplicated,true);
  const reloaded=new SabanFencedAckJournal({stateDir:root,integritySecret:'bounded-test-secret'});
  assert.equal(reloaded.inspect({jobKey:base.jobKey,now:14000}).journal_events,3);
  assert.equal(reloaded.inspect({jobKey:base.jobKey,now:14000}).state,'ack_recorded');
  assert.ok(!JSON.stringify(reloaded.inspect({jobKey:base.jobKey})).includes(granted.lease_token));
  assert.ok(!fs.readFileSync(journal.filename(base.jobKey),'utf8').includes(granted.lease_token));
  assert.throws(()=>reloaded.acquire({jobKey:base.jobKey,workerId:'local-b'}),/not_queued/);
  assert.throws(()=>reloaded.acknowledge({jobKey:base.jobKey,workerId:'local-a',
    leaseToken:granted.lease_token,resultDigest:digest('d'),receiptRef:'proof:readonly-one'}),/stale_or_unowned/);
  assert.throws(()=>reloaded.acknowledge({jobKey:base.jobKey,workerId:'other',
    leaseToken:granted.lease_token,resultDigest:digest('c'),receiptRef:'proof:readonly-one'}),/stale_or_unowned/);
});

test('late response cannot masquerade as a new lease held by same worker',()=>{
  const {journal}=makeJournal();
  journal.submit(base);
  const old=journal.acquire({jobKey:base.jobKey,workerId:'worker-x',now:11000,leaseMs:1000});
  assert.equal(journal.inspect({jobKey:base.jobKey,now:12001}).state,'ambiguous_expired');
  assert.throws(()=>journal.acquire({jobKey:base.jobKey,workerId:'worker-x',now:12001}),/ambiguous_completion_requires_review/);
  assert.throws(()=>journal.acknowledge({jobKey:base.jobKey,workerId:'worker-x',
    leaseToken:old.lease_token,resultDigest:digest('c'),receiptRef:'proof:late',now:12001}),/lease_expired_hold/);
  assert.throws(()=>journal.reviewRetry({jobKey:base.jobKey,approvalRef:'review-1',now:12002}),/evidence_ref_invalid/);
  const reviewed=journal.reviewRetry({jobKey:base.jobKey,approvalRef:'review-1',evidenceRef:'proof:inspection',now:12002});
  assert.equal(reviewed.state,'queued');
  const fresh=journal.acquire({jobKey:base.jobKey,workerId:'worker-x',now:12003,leaseMs:1000});
  assert.notEqual(fresh.lease_token,old.lease_token);
  assert.equal(fresh.attempts,2);
  assert.throws(()=>journal.acknowledge({jobKey:base.jobKey,workerId:'worker-x',
    leaseToken:old.lease_token,resultDigest:digest('c'),receiptRef:'proof:old',now:12004}),/stale_or_unowned/);
  assert.equal(journal.acknowledge({jobKey:base.jobKey,workerId:'worker-x',
    leaseToken:fresh.lease_token,resultDigest:digest('c'),receiptRef:'proof:new',now:12004}).state,'ack_recorded');
});

test('explicit hold never retries itself and only review opens a new attempt',()=>{
  const {journal}=makeJournal();
  journal.submit(base);
  const lease=journal.acquire({jobKey:base.jobKey,workerId:'worker-a',now:11000});
  assert.equal(journal.hold({jobKey:base.jobKey,workerId:'worker-a',
    leaseToken:lease.lease_token,reason:'operator_paused',now:12000}).state,'held');
  assert.throws(()=>journal.acquire({jobKey:base.jobKey,workerId:'worker-a',now:12001}),/not_queued/);
  assert.equal(journal.reviewRetry({jobKey:base.jobKey,approvalRef:'founder-reviewed',
    evidenceRef:'proof:no_external_effect',now:13000}).state,'queued');
});

test('truncated or modified journal and wrong HMAC key forbid any next action',()=>{
  const {root,journal}=makeJournal();
  journal.submit(base);
  const file=journal.filename(base.jobKey);
  const saved=fs.readFileSync(file,'utf8');
  fs.appendFileSync(file,'{"schema":');
  assert.throws(()=>journal.inspect({jobKey:base.jobKey}),/integrity_hold/);
  assert.throws(()=>journal.acquire({jobKey:base.jobKey,workerId:'worker-a'}),/integrity_hold/);
  fs.writeFileSync(file,saved.replace('queued-do-not-exist','queued-do-not-exist')); // restore original for tamper case
  const changed=saved.replace('saban.source-readiness.v1','saban.impersonated-readiness.v1');
  fs.writeFileSync(file,changed);
  assert.throws(()=>journal.inspect({jobKey:base.jobKey}),/integrity_hold/);
  fs.writeFileSync(file,saved);
  const wrong=new SabanFencedAckJournal({stateDir:root,integritySecret:'wrong'});
  assert.throws(()=>wrong.inspect({jobKey:base.jobKey}),/integrity_hold/);
});

test('two separate processes submit the same work and produce only one durable event',async()=>{
  const {root,journal}=makeJournal();
  const moduleUrl=new URL('./fenced-ack-journal.mjs',import.meta.url).href;
  const script='import {SabanFencedAckJournal} from '+JSON.stringify(moduleUrl)+';\n'+
    'const j=new SabanFencedAckJournal({stateDir:process.argv[1],integritySecret:"bounded-test-secret"});\n'+
    'j.submit({jobKey:"os-readiness:runtime",workloadClass:"saban.source-readiness.v1",'+
    'workDigest:"'+digest('a')+'"});\n';
  await Promise.all(['first','second'].map(async name=>{
    await execFileAsync(process.execPath,['--input-type=module','-e',script,root,name],
      {timeout:12000,maxBuffer:100000});
  }));
  const receipt=journal.inspect({jobKey:base.jobKey,now:20000});
  assert.equal(receipt.journal_events,1);
  assert.equal(receipt.state,'queued');
});

test('unknown job and lock leftovers fail closed, with no filesystem side effects outside state',()=>{
  const {journal}=makeJournal();
  assert.equal(journal.inspect({jobKey:'unknown:job',now:10000}).journal_events,0);
  journal.submit(base);
  const lock=journal.filename(base.jobKey)+'.lock';
  fs.mkdirSync(lock);
  assert.throws(()=>journal.acquire({jobKey:base.jobKey,workerId:'local-a',now:11000}),/lock_held/);
  assert.equal(journal.inspect({jobKey:base.jobKey,now:11000}).state,'queued');
});

test('retry budget is immutable per submitted job and never overruns explicit bounds',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'saban-bounded-retry-'));
  scratch.push(dir);
  const journal=new SabanFencedAckJournal({stateDir:dir,integritySecret:'retry-test',maxAttempts:2});
  journal.submit(base);
  const first=journal.acquire({jobKey:base.jobKey,workerId:'a',now:11000,leaseMs:1000});
  assert.equal(first.attempts,1);
  journal.reviewRetry({jobKey:base.jobKey,approvalRef:'review-1',evidenceRef:'proof:review-1',now:12001});
  const second=journal.acquire({jobKey:base.jobKey,workerId:'a',now:12002,leaseMs:1000});
  assert.equal(second.attempts,2);
  assert.throws(()=>journal.reviewRetry({jobKey:base.jobKey,approvalRef:'review-2',
    evidenceRef:'proof:review-2',now:13003}),/retry_budget_exhausted/);
  assert.equal(journal.inspect({jobKey:base.jobKey,now:13003}).state,'ambiguous_expired');
  assert.throws(()=>new SabanFencedAckJournal({stateDir:dir,maxAttempts:0}),/max_attempts_invalid/);
  assert.throws(()=>journal.hold({jobKey:base.jobKey,workerId:'a',
    leaseToken:second.lease_token,reason:'late',now:13004}),/lease_expired_hold/);
});

