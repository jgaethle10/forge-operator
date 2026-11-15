import test from "node:test";
import assert from "node:assert/strict";
import { stageReports } from "./evidence-staging.mjs";
const report=()=>({
 category:"diplomacy",status:"reported",headline:"Example public statement",
 summary:"A statement was issued.",region:"Middle East",
 reported_at_utc:"2026-11-04T12:00:00Z",
 sources:[{publisher:"Example",url:"https://example.org/item",published_at_utc:"2026-11-04T12:00:00Z",claim_type:"official"}],
 safety_review:{approved:true},published_at_utc:"2026-11-04T12:30:00Z"
});
test("ingestion never publishes or trusts upstream approval",()=>{
 const result=stageReports([report()]);
 assert.deepEqual(result.published,[]);
 assert.equal(result.reviewQueue[0].event.safety_review.approved,false);
 assert.equal(result.reviewQueue[0].event.published_at_utc,null);
});
test("duplicate source records are held",()=>{
 const result=stageReports([report(),report()]);
 assert.equal(result.duplicateRecords.length,1);
 assert.equal(result.reviewQueue.length,1);
});
test("operational content is not a publication candidate",()=>{
 const item=report();item.summary="Live tracking of a warship departing now.";
 const result=stageReports([item]);
 assert.equal(result.candidates.length,0);
 assert.ok(result.reviewQueue[0].reasons.includes("possible_operational_intelligence"));
});
test("precise locations are not candidates",()=>{
 const item=report();item.latitude=33.1;
 assert.equal(stageReports([item]).candidates.length,0);
});
test("invalid input is retained for review rather than crashing",()=>{
 const result=stageReports([null]);
 assert.equal(result.reviewQueue.length,1);
 assert.deepEqual(result.published,[]);
});
