import test from "node:test";
import assert from "node:assert/strict";
import {EvidenceLedger} from "./evidence-ledger.mjs";
import {projectPublicTimeline} from "./public-timeline.mjs";
const ts=["2026-11-15T10:00:00Z","2026-11-15T10:01:00Z","2026-11-15T10:02:00Z"];
function fixture(){
 const l=new EvidenceLedger();
 for(const [type,at] of ["ingested","reviewed","approved"].map((type,i)=>[type,ts[i]]))
   l.append({event_id:"a",type,at,actor:"editor"});
 const record={id:"a",category:"diplomacy",status:"reported",headline:"Official public statement",summary:"A public statement was released.",region:"Middle East",reported_at_utc:ts[0],published_at_utc:"2026-11-15T10:03:00Z",sources:[{publisher:"Example",url:"https://example.org/story",published_at_utc:ts[0],claim_type:"official"}],safety_review:{approved:true}};
 return {l,record};
}
test("duplicate record identifiers never appear twice",()=>{
 const {l,record}=fixture();
 const result=projectPublicTimeline([record,{...record}],l.entries());
 assert.equal(result.events.length,1);
 assert.ok(result.withheld.some(x=>x.reason==="duplicate_id"));
});
test("snapshot cannot publish records with later publication timestamps",()=>{
 const {l,record}=fixture();
 const result=projectPublicTimeline([record],l.entries(),{asOf:ts[2]});
 assert.equal(result.events.length,0);
});
test("a retraction after snapshot still prevents export",()=>{
 const {l,record}=fixture();
 l.append({event_id:"a",type:"retracted",actor:"editor",at:"2026-11-15T10:04:00Z"});
 const result=projectPublicTimeline([record],l.entries(),{asOf:"2026-11-15T10:03:30Z"});
 assert.equal(result.events.length,0);
});
test("issue #2251: Revenue Games reconcile Gmail contact receipts with Grok/Harbor pipeline before new outreach", () => {
 const l = new EvidenceLedger();
 for(const [type,at] of ["ingested","reviewed","approved"].map((type,i)=>[type,ts[i]]))
   l.append({event_id:"gmail-receipt-2251",type,at,actor:"revenue-pipeline"});
 const record={
   id:"gmail-receipt-2251",
   category:"diplomacy",
   status:"corroborated",
   headline:"Revenue Games Contact Receipt Reconciled",
   summary:"Gmail contact receipts reconciled with Grok/Harbor pipeline before new outreach.",
   region:"Global",
   reported_at_utc:ts[0],
   published_at_utc:"2026-11-15T10:03:00Z",
   sources:[{publisher:"HarborPipeline",url:"https://example.org/receipt",published_at_utc:ts[0],claim_type:"official"}],
   safety_review:{approved:true}
 };
 const result = projectPublicTimeline([record], l.entries());
 assert.equal(result.events.length, 1);
 assert.equal(result.events[0].id, "gmail-receipt-2251");
 assert.equal(result.withheld.length, 0);
});