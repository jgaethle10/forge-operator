import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {compileLocalResearch} from "../systemia/research-service/compile.mjs";

test("local operator produces a private review draft and a separate receipt, not a customer delivery",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-research-test-"));
 try{
  const input=path.join(root,"job.json"),out=path.join(root,"deliverables");
  fs.writeFileSync(input,JSON.stringify({job_id:"test-001",question:"What inputs are missing from this research decision?",
    as_of:"2026-10-20T00:00:00Z",sources:[],claims:[],next_steps:["Collect source snapshots before drawing conclusions."]}));
  const result=compileLocalResearch(input,out);
  assert.equal(result.status,"draft_needs_human_review");
  const document=fs.readFileSync(result.markdown,"utf8");
  const receipt=JSON.parse(fs.readFileSync(result.receipt,"utf8"));
  assert.match(document,/No source snapshots supplied/);
  assert.match(document,/REVIEW DRAFT/);
  assert.equal(receipt.source_count,0);
  assert.equal(receipt.payment_verified,false);
  assert.equal(receipt.delivery_authorized,false);
  assert.throws(()=>compileLocalResearch(input,out),/EEXIST/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test("local writer blocks publishing research documents to a public web directory",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-research-block-"));
 try{assert.throws(()=>compileLocalResearch(path.join(root,"nonexistent"),path.join(root,"public","research")),/research_output_must_not_be_public/)}
 finally{fs.rmSync(root,{recursive:true,force:true})}
});
