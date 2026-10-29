import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {compileEvidenceDossier} from "../systemia/research-service/evidence-dossier.mjs";
const sha=v=>createHash("sha256").update(v).digest("hex");
const snapshot="Sample public discussion text captured for testing, not independently authenticated.";
const base=()=>({
 job_id:"research-0001",question:"Which constraints should be checked before expanding this service?",
 as_of:"2026-10-20T10:00:00Z",
 sources:[{id:"S1",url:"https://example.org/public",title:"Public source provided by requester",
  captured_at:"2026-10-20T09:00:00Z",snapshot_text:snapshot}],
 claims:[{id:"C1",statement:"The sample discusses a cost constraint.",evidence_state:"user_supplied",
  basis:"Claim derived only from a requester-supplied sample.",source_ids:["S1"],confidence:"low"}],
 conflicts:[],next_steps:["Review the original source manually before proposing a course of action."]
});
test("an unverified public URL remains explicitly unverified and cannot become a delivered report",()=>{
 const r=compileEvidenceDossier(base());
 assert.equal(r.receipt.source_count,1);
 assert.equal(r.receipt.receipt_verified_source_count,0);
 assert.equal(r.sources[0].capture_state,"supplied_snapshot_unverified");
 assert.equal(r.receipt.report_status,"draft_needs_human_review");
 assert.equal(r.receipt.delivery_authorized,false);
 assert.equal(r.receipt.payment_verified,false);
 assert.match(r.markdown,/REVIEW DRAFT/);
 assert.match(r.markdown,/https:\/\/example\.org\/public/);
 assert.match(r.markdown,/supplied_snapshot_unverified/);
 assert.equal(r.receipt.dossier_sha256,sha(r.markdown));
});
test("contradictions and assumptions are preserved verbatim, never averaged",()=>{
 const job=base();
 job.claims.push({id:"C2",statement:"An alternate scenario may be more expensive.",evidence_state:"modeled",
  basis:"A scenario hypothesis, not observed economics.",source_ids:[],assumptions:"Assumes labor prices rise 25%.",confidence:"low"});
 job.conflicts=[{left:"C1",right:"C2",reason:"A source assertion versus a scenario hypothesis."}];
 const r=compileEvidenceDossier(job);
 assert.match(r.markdown,/C1.*versus.*C2/);
 assert.match(r.markdown,/labor prices rise 25%/);
 assert.equal(r.receipt.conflict_count,1);
 assert.equal(r.claims[1].evidence_state,"modeled");
});
test("observed status requires verified capture, not an invented receipt or supplied boolean",()=>{
 const job=base();
 job.sources[0].capture_receipt={anything:true};
 job.claims[0].evidence_state="observed";
 assert.throws(()=>compileEvidenceDossier(job),/verified_capture/);
 assert.throws(()=>compileEvidenceDossier(job,{verifyCaptureReceipt:()=>false}),/verified_capture/);
 assert.throws(()=>compileEvidenceDossier(job,{verifyCaptureReceipt:()=>{throw Error("bad signature")}}),/verified_capture/);
});
test("authorized injected collector verifier only attests snapshot capture, not underlying factual truth",()=>{
 const job=base();
 job.sources[0].capture_receipt={source:"hypothetical-test-receipt"};
 job.claims[0].evidence_state="public";
 job.claims[0].confidence="high";
 const r=compileEvidenceDossier(job,{verifyCaptureReceipt:(receipt,details)=>receipt.source==="hypothetical-test-receipt"&&details.sha256===sha(snapshot)});
 assert.equal(r.sources[0].receipt_verified,true);
 assert.equal(r.receipt.receipt_verified_source_count,1);
 assert.match(r.markdown,/A verified capture means a source snapshot is traceable/);
 assert.equal(r.receipt.delivery_authorized,false);
});
test("bad hashes, broken citations, private destinations and unsupported high confidence fail closed",()=>{
 const job=base();
 job.sources[0].snapshot_sha256="0".repeat(64);
 assert.throws(()=>compileEvidenceDossier(job),/source_hash_mismatch/);
 job.sources[0].snapshot_sha256=sha(snapshot);
 job.claims[0].source_ids=["S2"];
 assert.throws(()=>compileEvidenceDossier(job),/unknown_source_ref/);
 job.claims[0].source_ids=["S1"];
 job.claims[0].confidence="high";
 assert.throws(()=>compileEvidenceDossier(job),/high_confidence_requires_verified_capture/);
 job.claims[0].confidence="low";
 job.sources[0].url="http://127.0.0.1/secret";
 assert.throws(()=>compileEvidenceDossier(job),/source_private_address/);
});
test("inferred and modeled outputs demand explicit assumptions",()=>{
 const job=base();
 job.claims[0].evidence_state="inferred";
 assert.throws(()=>compileEvidenceDossier(job),/interpretation_requires_assumptions/);
 job.claims[0].assumptions="Only one illustrative public-source excerpt was supplied";
 const r=compileEvidenceDossier(job);
 assert.equal(r.claims[0].evidence_state,"inferred");
 assert.match(r.markdown,/Assumptions/);
});
test("does not accept unknown conflict claims or future-dated evidence",()=>{
 const job=base();
 job.conflicts=[{left:"C1",right:"C9",reason:"Incompatible statements"}];
 assert.throws(()=>compileEvidenceDossier(job),/conflict_refs_invalid/);
 job.conflicts=[];
 job.sources[0].captured_at="2099-02-01T00:00:00Z";
 assert.throws(()=>compileEvidenceDossier(job),/source_captured_at_invalid/);
});


test("snapshot digest preserves exact whitespace and byte representation",()=>{
 const job=base();
 job.sources[0].snapshot_text="  First paragraph.\nSecond paragraph. \n";
 const r=compileEvidenceDossier(job);
 assert.equal(r.sources[0].snapshot_sha256,sha(job.sources[0].snapshot_text));
 assert.equal(r.sources[0].excerpt,job.sources[0].snapshot_text.slice(0,500));
 const modified=structuredClone(job);
 modified.sources[0].snapshot_sha256=r.sources[0].snapshot_sha256;
 modified.sources[0].snapshot_text=job.sources[0].snapshot_text.trim();
 assert.throws(()=>compileEvidenceDossier(modified),/source_hash_mismatch/);
});
