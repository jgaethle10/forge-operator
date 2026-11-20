import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";
import {reviewEvidence} from "./source-conflict-review.mjs";
const data=JSON.parse(readFileSync(new URL("./document-claims-2026-11-19.json",import.meta.url),"utf8"));
test("real public vendor warranty conflict is flagged",()=>{const r=reviewEvidence(data);assert.equal(r.conflicts.length,1);assert.equal(r.conflicts[0].attribute,"published_warranty_years");assert.equal(r.disposition,"HOLD_CLARIFICATION");assert.equal(r.automatic_customer_quote_authorized,false)});
test("variant scopes are not silently conflated",()=>{const x=JSON.parse(JSON.stringify(data));x.claims[1].product_scope+=" older revision";assert.equal(reviewEvidence(x).conflicts.length,0);assert.equal(reviewEvidence(x).automatic_supplier_qualification,false)});
test("non-https evidence rejected without producing false conflict",()=>{const x=JSON.parse(JSON.stringify(data));x.claims[1].source_url="file:///pretend";const r=reviewEvidence(x);assert.equal(r.rejected_claims.length,1);assert.equal(r.conflicts.length,0);assert.equal(r.disposition,"HOLD_CLARIFICATION")});
test("untrusted bare object fails closed",()=>assert.throws(()=>reviewEvidence({}),/unsupported_evidence_bundle/));
test("no clean result can auto-authorize quote or defense response",()=>{const x=JSON.parse(JSON.stringify(data));x.claims.pop();const r=reviewEvidence(x);assert.equal(r.conflicts.length,0);assert.equal(r.automatic_customer_quote_authorized,false);assert.equal(r.government_response_authorized,false)});
