import test from "node:test";
import assert from "node:assert/strict";
import {reviewEvent} from "./publication-gate.mjs";
const base=()=>({
 category:"diplomacy",status:"reported",headline:"Public diplomatic statement",summary:"A public statement was released.",region:"Middle East",
 reported_at_utc:"2026-11-04T12:00:00Z",event_time_utc:null,verified_at_utc:null,published_at_utc:null,
 sources:[{publisher:"Example newsroom",url:"https://example.org/report",published_at_utc:"2026-11-04T12:00:00Z",claim_type:"independent"}],
 safety_review:{approved:true},corrections:[]
});
test("valid attributed record is eligible but still requires human review",()=>{const x=reviewEvent(base());assert.equal(x.eligible,true);assert.equal(x.requiresHumanReview,true)});
test("rejects source-free claims",()=>{const x=base();x.sources=[];assert.ok(reviewEvent(x).reasons.includes("missing_or_invalid_sources"))});
test("rejects unapproved publication",()=>{const x=base();x.safety_review.approved=false;assert.ok(reviewEvent(x).reasons.includes("safety_approval_missing"))});
test("flags operational movement",()=>{const x=base();x.summary="Live tracking of a warship departing now.";assert.ok(reviewEvent(x).reasons.includes("possible_operational_intelligence"))});
test("flags precise location",()=>{const x=base();x.latitude=32.1;assert.ok(reviewEvent(x).reasons.includes("precise_location_requires_review"))});
test("requires correction history",()=>{const x=base();x.status="corrected";assert.ok(reviewEvent(x).reasons.includes("correction_history_missing"))});
test("corroboration requires two publishers",()=>{const x=base();x.status="corroborated";assert.ok(reviewEvent(x).reasons.includes("corroboration_requires_independent_publishers"))});
test("rejects unsafe URLs",()=>{const x=base();x.sources[0].url="javascript:alert(1)";assert.ok(reviewEvent(x).reasons.includes("missing_or_invalid_sources"))});
test("rejects malformed timestamps",()=>{const x=base();x.reported_at_utc="yesterday";assert.ok(reviewEvent(x).reasons.includes("invalid_report_time"))});
