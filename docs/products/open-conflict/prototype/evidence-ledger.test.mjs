import test from "node:test";
import assert from "node:assert/strict";
import {EvidenceLedger} from "./evidence-ledger.mjs";
const add=(ledger,type,at,details={})=>ledger.append({event_id:"demo-1",type,actor:"editor",at,details});
test("hash chain validates and can be restored",()=>{
 const l=new EvidenceLedger();
 add(l,"ingested","2026-11-09T10:00:00Z");
 add(l,"reviewed","2026-11-09T10:01:00Z");
 add(l,"approved","2026-11-09T10:02:00Z");
 assert.equal(EvidenceLedger.verify(l.entries()),true);
 assert.equal(new EvidenceLedger(l.entries()).entries().length,3);
});
test("tampering with past details is detected",()=>{
 const l=new EvidenceLedger();add(l,"ingested","2026-11-09T10:00:00Z",{source:"A"});
 const entries=l.entries();entries[0].details.source="B";
 assert.equal(EvidenceLedger.verify(entries),false);
});
test("cannot approve before review",()=>{
 const l=new EvidenceLedger();add(l,"ingested","2026-11-09T10:00:00Z");
 assert.throws(()=>add(l,"approved","2026-11-09T10:01:00Z"),/requires review/);
});
test("correction and retraction remain recorded",()=>{
 const l=new EvidenceLedger();
 add(l,"ingested","2026-11-09T10:00:00Z");
 add(l,"reviewed","2026-11-09T10:01:00Z");
 add(l,"approved","2026-11-09T10:02:00Z");
 add(l,"corrected","2026-11-09T10:03:00Z",{reason:"Attribution revised"});
 add(l,"retracted","2026-11-09T10:04:00Z",{reason:"Source withdrawn"});
 assert.equal(l.entries().length,5);
 assert.throws(()=>add(l,"reviewed","2026-11-09T10:05:00Z"),/terminal/);
});
test("entry snapshots cannot mutate the ledger",()=>{
 const l=new EvidenceLedger();const e=add(l,"ingested","2026-11-09T10:00:00Z");
 e.actor="tampered";
 assert.equal(EvidenceLedger.verify(l.entries()),true);
});
test("backdated entry is rejected",()=>{
 const l=new EvidenceLedger();add(l,"ingested","2026-11-09T10:00:00Z");
 assert.throws(()=>add(l,"reviewed","2026-11-09T09:00:00Z"),/out of order/);
});
