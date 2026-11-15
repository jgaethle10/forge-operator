import test from "node:test";
import assert from "node:assert/strict";
import { EvidenceLedger } from "./evidence-ledger.mjs";
import { projectPublicTimeline } from "./public-timeline.mjs";
const t=["2026-11-10T10:00:00Z","2026-11-10T10:01:00Z","2026-11-10T10:02:00Z"];
function ledger(approved=true) {
 const l=new EvidenceLedger();
 l.append({event_id:"sample",type:"ingested",actor:"editor",at:t[0]});
 l.append({event_id:"sample",type:"reviewed",actor:"editor",at:t[1]});
 if(approved)l.append({event_id:"sample",type:"approved",actor:"editor",at:t[2]});
 return l;
}
const record=()=>({
 id:"sample",category:"diplomacy",status:"reported",headline:"Public statement",summary:"An attributed statement was published.",
 region:"Middle East",reported_at_utc:t[0],event_time_utc:null,verified_at_utc:t[1],published_at_utc:"2026-11-10T10:03:00Z",
 sources:[{publisher:"Example",url:"https://example.org/story",published_at_utc:t[0],claim_type:"independent"}],
 safety_review:{approved:true},corrections:[],private_notes:"do not expose",latitude:30.5
});
test("withholds location-bearing records despite approval",()=>{
 const result=projectPublicTimeline([record()],ledger().entries());
 assert.equal(result.events.length,0);
});
test("projects approved safe fields without private metadata",()=>{
 const item=record();delete item.latitude;
 const result=projectPublicTimeline([item],ledger().entries());
 assert.equal(result.events.length,1);
 assert.equal("private_notes" in result.events[0],false);
 assert.equal("safety_review" in result.events[0],false);
});
test("withholds unapproved records",()=>{
 const item=record();delete item.latitude;
 assert.equal(projectPublicTimeline([item],ledger(false).entries()).events.length,0);
});
test("withholds retracted records",()=>{
 const l=ledger();l.append({event_id:"sample",type:"retracted",actor:"editor",at:"2026-11-10T10:04:00Z",details:{reason:"withdrawn"}});
 const item=record();delete item.latitude;
 assert.equal(projectPublicTimeline([item],l.entries()).events.length,0);
});
test("fails closed on tampered ledger",()=>{
 const entries=ledger().entries();entries[0].actor="forged";
 assert.throws(()=>projectPublicTimeline([],entries),/integrity/);
});
test("withholds future approval relative to snapshot",()=>{
 const item=record();delete item.latitude;
 assert.equal(projectPublicTimeline([item],ledger().entries(),{asOf:t[1]}).events.length,0);
});
