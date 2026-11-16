import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readExecutiveEvidence } from "./executive-evidence-adapter.mjs";
import { startEvercraftHomeServer } from "./server.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const file=(root,relative,content)=>{
  const target=path.join(root,"public","journal",relative);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,content);
};
const json=(value)=>JSON.stringify(value,null,2)+"\n";
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-exec-evidence-"));
  const slug="verified-source-piece";
  const title="A Source Verified Story";
  const url="https://fabric.systemiacommandcenters.com/journal/"+slug+"/";
  const article="<!doctype html><title>Story</title>";
  const sha=createHash("sha256").update(article).digest("hex");
  file(root,slug+"/index.html",article);
  file(root,"index.json",json({
    schema:"evercraft.journal.index.v1",
    stories:[{slug,story_id:"journal:test:verified",title,published_at:"2026-11-14T12:00:00Z",canonical_url:url}],
  }));
  file(root,"receipts/"+slug+".json",json({
    schema:"evercraft.journal.publication-receipt.v1",
    slug,story_id:"journal:test:verified",
    article_sha256:sha,publication_authority:true,publication_state:"live",
    published_at:"2026-11-14T12:00:00Z",canonical_url:url,
    clip_handoff_ref:"production/"+slug+"/clip-handoff.json"
  }));
  file(root,"production/"+slug+"/clip-handoff.json",json({schema:"source-only-test"}));
  return {root,slug,title};
}
test("Executive evidence is source-grounded; it never invents settled revenue or social publishing",()=>{
  const f=fixture();
  try{
    const data=readExecutiveEvidence({repoRoot:f.root,now:"2026-11-15T23:00:00Z"});
    assert.equal(data.journal.state,"source_receipt_verified");
    assert.equal(data.journal.title,f.title);
    assert.equal(data.journal.external_https_verified,false);
    assert.equal(data.clip.state,"handoff_source_present");
    assert.equal(data.clip.provider_post_verified,false);
    assert.equal(data.payments.state,"canonical_order_feed_not_connected");
    assert.equal(data.payments.revenue_verified,null);
    assert.equal(data.payments.paid_orders_verified,null);
    assert.equal(data.actions_performed,false);
    assert.equal(data.secrets_returned,false);
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});

test("Digest mismatch fails closed instead of calling a publication verified",()=>{
  const f=fixture();
  try{
    file(f.root,f.slug+"/index.html","changed article bytes");
    const data=readExecutiveEvidence({repoRoot:f.root});
    assert.equal(data.journal.state,"receipt_mismatch");
    assert.equal(data.journal.external_https_verified,false);
    assert.equal(data.clip.state,"provider_receipt_unverified");
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});

test("Missing or invalid Journal sources are held, not counted as zero stories",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-exec-evidence-"));
  try{
    let data=readExecutiveEvidence({repoRoot:root});
    assert.equal(data.journal.state,"source_unavailable");
    assert.equal(data.payments.revenue_verified,null);
    file(root,"index.json",json({schema:"unexpected",stories:[]}));
    data=readExecutiveEvidence({repoRoot:root});
    assert.equal(data.journal.state,"source_unavailable");
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test("Executive evidence is accessible only through the Home session gate",()=>{
  const server=fs.readFileSync(path.join(here,"server.mjs"),"utf8");
  const marker='url.pathname === "/api/executive/evidence"';
  const i=server.indexOf(marker);
  assert.ok(i>=0);
  const block=server.slice(i,i+300);
  assert.ok(block.includes('sessionFor(req, "home.read")'));
  assert.ok(block.includes("if (!session.ok) return json(res, session.status, session)"));
});

test("Local-loopback Home readback returns no authority or secret material",async()=>{
  const runtime=await startEvercraftHomeServer({host:"127.0.0.1",port:0,authMode:"local",credentialStateDir:""});
  try{
    const r=await fetch(runtime.url+"/api/executive/evidence");
    assert.equal(r.status,200);
    const d=await r.json();
    assert.equal(d.ok,true);
    assert.equal(d.schema,"evercraft.home.executive-evidence.v1");
    assert.equal(d.payments.paid_orders_verified,null);
    assert.equal(d.actions_performed,false);
    assert.equal(d.secrets_returned,false);
    assert.equal(JSON.stringify(d).includes("page_access_token"),false);
  }finally{await runtime.close();}
});

test("Executive Floor actually requests readback only after authenticated Home entry",()=>{
  const source=fs.readFileSync(path.join(here,"public","index.html"),"utf8");
  const show=source.indexOf("  showApp();",source.indexOf("async function load(afterLogin=false)"));
  const idx=source.indexOf("  void refreshExecutiveEvidence();",show);
  assert.ok(show>=0 && idx>show);
  assert.ok(source.includes('homeFetch("/api/executive/evidence")'));
  for(const id of ["executive-journal-state","executive-clip-state","executive-payments-state","executive-evidence-refresh"]){
    assert.ok(source.includes('id="'+id+'"'));
  }
  assert.match(source,/No verified paid order feed|Revenue is unknown, not zero/);
});
