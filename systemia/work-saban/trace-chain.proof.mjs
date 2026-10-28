import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createLocalEventChain, verifyLocalEventChain, sha256Text } from './trace-chain.mjs';
import { auditWorkSabanTrace } from './audit-trace.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const script=fs.readFileSync(path.join(here,'trace-client.js'),'utf8');
const ctx={window:{},crypto:webcrypto,TextEncoder,structuredClone,Uint8Array,Array};
vm.runInNewContext(script,ctx,{filename:'trace-client.js'});
const client=ctx.window.WorkSabanTrace;
assert(client?.create);
const roles=['analyst','writer','designer','auditor','coordinator'];
const csv='month,revenue\n2026-08,100.10\n2026-09,90.05';
const report='# Monthly sales report\nVerified local, synthetic fixture.';
const receipts=roles.map((role,i)=>({
  role,status:'completed',quality_status:'pass',attempts:1,
  result_sha256:sha256Text('role-result-'+role),
  idempotency_key:sha256Text('assignment-'+i)
}));
const execution={
  run_id:'synthetic-test-run',
  status:'verified_local',
  evidence_state:'actual_registered_worker_local',
  physically_distributed:false,
  public_execution:false,
  human_account_access:false,
  quality:{status:'verified'},
  source_sha256:sha256Text(csv),
  report_sha256:sha256Text(report),
  report_markdown:report,
  specialist_receipts:receipts,
  model_inference:false,
  external_actions:[]
};
const chain=createLocalEventChain({traceId:'local-proof-test'});
const events=[chain.next({type:'accepted',status:'running_local'})];
for(let i=0;i<roles.length;i++){
  events.push(chain.next({type:'stage_started',role:roles[i]}));
  events.push(chain.next({type:'stage_verified',role:roles[i],receipt:receipts[i]}));
}
events.push(chain.next({type:'completed',execution}));
assert.equal(events.length,12);
assert.equal(verifyLocalEventChain(events).count,12);
const test=client.create();
for(const e of events) await test.accept(e);
assert.equal(test.summary().status,'completed');
assert.equal(test.summary().event_count,12);
assert.equal(test.summary().trace_id,'local-proof-test');
assert.equal(test.export().events.length,12);
assert.equal(test.summary().tail_digest,chain.summary().tail_digest);
assert.equal(test.export().authenticity,'local_hash_chain_unsigned');
// A fully rehashed but malformed specialist digest must still be refused.
const malformed=createLocalEventChain({traceId:'malformed-digest'});
const malformedVerifier=client.create();
await malformedVerifier.accept(malformed.next({type:'accepted'}));
await malformedVerifier.accept(malformed.next({type:'stage_started',role:'analyst'}));
await assert.rejects(
  malformedVerifier.accept(malformed.next({type:'stage_verified',role:'analyst',
    receipt:{...receipts[0],result_sha256:'sha256:not-a-valid-digest'}})),
  /invalid_worker_result_digest/
);

const retryChain=createLocalEventChain({traceId:'retry-budget-proof'});
const retryVerifier=client.create();
await retryVerifier.accept(retryChain.next({type:'accepted'}));
await retryVerifier.accept(retryChain.next({type:'stage_started',role:'analyst'}));
await assert.rejects(
  retryVerifier.accept(retryChain.next({type:'stage_verified',role:'analyst',
    receipt:{...receipts[0],attempts:3}})),
  /invalid_worker_attempt_or_assignment_key/
);
const absentActionsChain=createLocalEventChain({traceId:'missing-action-ledger'});
const absentActionsVerifier=client.create();
for(let i=0;i<events.length-1;i++){
  await absentActionsVerifier.accept(absentActionsChain.next(
    (({trace,...body})=>body)(events[i])
  ));
}
const {external_actions:omittedActions,...noLedgerExecution}=execution;
await assert.rejects(
  absentActionsVerifier.accept(absentActionsChain.next({
    type:'completed',execution:noLedgerExecution
  })),/incomplete_local_delivery/
);
const noSourceChain=createLocalEventChain({traceId:'missing-source-proof'});
const noSourceVerifier=client.create();
for(let i=0;i<events.length-1;i++){
  const {trace,...body}=events[i];
  await noSourceVerifier.accept(noSourceChain.next(body));
}
const {source_sha256:removedSource,...noSourceExecution}=execution;
await assert.rejects(noSourceVerifier.accept(noSourceChain.next({
  type:'completed',execution:noSourceExecution
})),/incomplete_local_delivery/);
const offline=auditWorkSabanTrace(test.export());
assert.equal(offline.status,'local_trace_integrity_verified');
assert.equal(offline.event_count,12);
assert.equal(offline.independent_identity_attestation,false);
const mutatedArchive=structuredClone(test.export());
mutatedArchive.events[11].execution.report_markdown+='tampered';
assert.throws(()=>auditWorkSabanTrace(mutatedArchive),/invalid_trace_hash/);
// Recompute the entire unsigned chain to prove semantic checks still matter.
const invalidReceipt={...receipts[0],result_sha256:'sha256:invalid'};
const recomputed=createLocalEventChain({traceId:'recomputed-invalid-receipt'});
const recomputedEvents=[recomputed.next({type:'accepted'})];
for(let i=0;i<roles.length;i++){
  recomputedEvents.push(recomputed.next({type:'stage_started',role:roles[i]}));
  recomputedEvents.push(recomputed.next({type:'stage_verified',role:roles[i],
    receipt:i===0?invalidReceipt:receipts[i]}));
}
recomputedEvents.push(recomputed.next({type:'completed',execution:{
  ...execution,specialist_receipts:[invalidReceipt,...receipts.slice(1)]
}}));
const recomputedArchive={...test.export(),events:recomputedEvents,
  trace_id:'recomputed-invalid-receipt',tail_digest:recomputed.summary().tail_digest};
assert.equal(verifyLocalEventChain(recomputedEvents).valid,true);
assert.throws(()=>auditWorkSabanTrace(recomputedArchive),/worker_receipt_mismatch/);
const exceededReceipt={...receipts[0],attempts:3};
const retryAuditChain=createLocalEventChain({traceId:'offline-retry-budget'});
const retryAuditEvents=[retryAuditChain.next({type:'accepted'})];
for(let i=0;i<roles.length;i++){
  retryAuditEvents.push(retryAuditChain.next({type:'stage_started',role:roles[i]}));
  retryAuditEvents.push(retryAuditChain.next({type:'stage_verified',role:roles[i],
    receipt:i===0?exceededReceipt:receipts[i]}));
}
retryAuditEvents.push(retryAuditChain.next({type:'completed',execution:{
  ...execution,specialist_receipts:[exceededReceipt,...receipts.slice(1)]
}}));
assert.throws(()=>auditWorkSabanTrace({
  ...test.export(),events:retryAuditEvents,trace_id:'offline-retry-budget',
  tail_digest:retryAuditChain.summary().tail_digest
}),/worker_receipt_mismatch/);
const missingArchive=structuredClone(test.export());
missingArchive.events.splice(2,1);
assert.throws(()=>auditWorkSabanTrace(missingArchive),/invalid_trace_link/);


async function rejectWithTrace(mutator,match){
  const corrupted=structuredClone(events);
  mutator(corrupted);
  const observer=client.create();
  await assert.rejects(async()=>{
    for(const event of corrupted) await observer.accept(event);
  },match);
}
await rejectWithTrace(a=>{a[2].receipt.quality_status='fail';},/hash_mismatch/);
await rejectWithTrace(a=>{a.splice(4,1);},/sequence/);
await rejectWithTrace(a=>{a[11].execution.report_markdown+=' changed';},/hash_mismatch/);
await rejectWithTrace(a=>{a[11].trace.previous_digest='sha256:deadbeef';},/sequence/);
assert.throws(()=>verifyLocalEventChain([...events.slice(0,3),events[4]]),/invalid_trace_link/);
assert.throws(()=>verifyLocalEventChain([events[0],events[0]]),/invalid_trace_link/);

// Maliciously re-hashed inconsistency must still be caught by end-to-end semantics:
const bogus={...execution,report_sha256:sha256Text('wrong content')};
const forged=createLocalEventChain({traceId:'inconsistent-delivery'});
const forgedEvents=[forged.next({type:'accepted'})];
for(let i=0;i<roles.length;i++){
  forgedEvents.push(forged.next({type:'stage_started',role:roles[i]}));
  forgedEvents.push(forged.next({type:'stage_verified',role:roles[i],receipt:receipts[i]}));
}
forgedEvents.push(forged.next({type:'completed',execution:bogus}));
assert.equal(verifyLocalEventChain(forgedEvents).valid,true,'hash chain alone cannot prove report correctness');
const bad=client.create();
await assert.rejects(async()=>{for(const e of forgedEvents)await bad.accept(e);},/report_hash_mismatch/);
console.log('Work Saban tamper-evident streamed receipt proof: PASS (12 events, browser Web Crypto, tampering, reorder, delivery checks).');
