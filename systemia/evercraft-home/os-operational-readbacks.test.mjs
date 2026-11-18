import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWorkState, leaseNext, checkpoint, fail, complete } from "../saban/work-state.mjs";
import { readEvercraftOsSabanSnapshot } from "./os-saban-snapshot.mjs";
import { startEvercraftHomeServer } from "./server.mjs";

const when = Date.parse("2026-11-15T23:00:00.000Z");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-os-saban-"));
  const privateDir = path.join(root, "private");
  fs.mkdirSync(privateDir, { mode: 0o700 });
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  return { dir:privateDir, file:path.join(privateDir,"work.json") };
}
function state() {
  return createWorkState({
    softwareId:"synthetic-proof",
    assignments:[
      {agent_id:"secret-agent-a",role:"private-person",work:{kind:"test",key:"a"},item:{customer_email:"private@example.com"}},
      {agent_id:"secret-agent-b",role:"private-person",work:{kind:"test",key:"b"},item:{customer_email:"private2@example.com"}},
    ],
    createdAt:when,
  });
}
test("default, missing and unsafe work-state inputs fail closed without counts", t => {
  assert.equal(readEvercraftOsSabanSnapshot().state, "not_configured");
  const f = fixture(t);
  assert.equal(readEvercraftOsSabanSnapshot({stateFile:f.file}).state,"snapshot_unverified");
  fs.writeFileSync(f.file, "{}", {mode:0o600});
  assert.equal(readEvercraftOsSabanSnapshot({stateFile:f.file}).state,"snapshot_unverified");
  fs.chmodSync(f.file,0o644);
  assert.equal(readEvercraftOsSabanSnapshot({stateFile:f.file}).total_jobs,null);
  fs.chmodSync(f.file,0o600);
  const link = path.join(f.dir,"link.json");
  fs.symlinkSync(f.file,link);
  assert.equal(readEvercraftOsSabanSnapshot({stateFile:link}).state,"snapshot_unverified");
});
test("real Saban state transitions project counts, retries and checkpoints without private contents", t => {
  const f=fixture(t), s=state();
  const first=leaseNext(s,{workerId:"private-worker-a",now:when+1000});
  checkpoint(s,{jobId:first.job_id,workerId:"private-worker-a",data:{secret:"do-not-expose"},now:when+1100});
  fail(s,{jobId:first.job_id,workerId:"private-worker-a",error:{message:"secret exception"},retry:true,now:when+1200});
  // Scheduler prioritizes not-yet-attempted work before retrying failed work.
  const second=leaseNext(s,{workerId:"private-worker-b",now:when+1300});
  complete(s,{jobId:second.job_id,workerId:"private-worker-b",result:{customer:"private"},now:when+1400});
  const retry=leaseNext(s,{workerId:"private-worker-a",now:when+1500});
  assert.equal(retry.job_id,first.job_id);
  complete(s,{jobId:retry.job_id,workerId:"private-worker-a",result:{customer:"private"},now:when+1600});
  fs.writeFileSync(f.file,JSON.stringify(s),{mode:0o600});
  const result=readEvercraftOsSabanSnapshot({stateFile:f.file,now:()=>when+1700});
  assert.equal(result.state,"local_snapshot_observed");
  assert.equal(result.total_jobs,2);
  assert.equal(result.counts.completed,2);
  assert.equal(result.counts.queued,0);
  assert.equal(result.retried_jobs,1);
  assert.equal(result.checkpointed_jobs,1);
  assert.equal(result.snapshot_recent,true);
  assert.equal(result.production_dispatch_verified,false);
  const serialized=JSON.stringify(result);
  for(const phrase of ["private@example.com","secret-agent","private-worker","do-not-expose","secret exception","synthetic-proof","customer_email"]){
    assert.equal(serialized.includes(phrase),false,phrase);
  }
  assert.match(result.source_digest,/^sha256:[a-f0-9]{64}$/);
});
test("stale and inconsistent summaries never become current runtime proof",t=>{
  const f=fixture(t),s=state();
  fs.writeFileSync(f.file,JSON.stringify({schema:"evercraft.saban.scheduler-receipt.v1",state:s,summary:{total:777,counts:{queued:2}}}),{mode:0o600});
  assert.equal(readEvercraftOsSabanSnapshot({stateFile:f.file,now:()=>when+3600000}).state,"snapshot_unverified");
  fs.writeFileSync(f.file,JSON.stringify(s),{mode:0o600});
  const stale=readEvercraftOsSabanSnapshot({stateFile:f.file,now:()=>when+3600000});
  assert.equal(stale.state,"local_snapshot_observed");
  assert.equal(stale.snapshot_recent,false);
  assert.equal(stale.independently_attested,false);
});
test("Home presents separate, permission-scoped Saban and Payments readbacks",async t=>{
  const f=fixture(t),s=state();fs.writeFileSync(f.file,JSON.stringify(s),{mode:0o600});
  const runtime=await startEvercraftHomeServer({
    host:"127.0.0.1",port:0,authMode:"local",operator:"OS Readback Proof",
    serviceOrigins:{EVERCRAFT_HOME_SABAN_WORK_STATE_FILE:f.file},
  });
  t.after(()=>runtime.close());
  const worker=await fetch(runtime.url+"/api/os/saban-snapshot");
  assert.equal(worker.status,200);
  const snapshot=await worker.json();
  assert.equal(snapshot.ok,true);
  assert.equal(snapshot.total_jobs,2);
  assert.equal(snapshot.customer_fulfillment_verified,false);
  const payment=await fetch(runtime.url+"/api/os/commerce");
  assert.equal(payment.status,200);
  const commerce=await payment.json();
  assert.equal(commerce.ok,true);
  assert.equal(commerce.state,"canonical_feed_not_connected");
  assert.equal(commerce.verified_paid_orders,null);
  assert.equal(commerce.payment_execution_performed,false);
});
