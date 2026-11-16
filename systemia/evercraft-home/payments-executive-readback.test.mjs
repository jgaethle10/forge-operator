import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createExecutivePaymentsReader, EXECUTIVE_PAYMENT_SCHEMA } from "./payments-executive-readback.mjs";
import { startEvercraftHomeServer } from "./server.mjs";

const FIXED = Date.parse("2026-11-15T22:00:00.000Z");
const ENDPOINT = "https://fabric.systemiacommandcenters.com/internal/payments/executive-readback";
function tokenFixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-payments-private-"));
  const tokenFile=path.join(root,"readback-token");
  fs.writeFileSync(tokenFile,"local-test-only-opaque-secret-value-of-sufficient-length\n",{mode:0o600});
  return {root,tokenFile,dispose:()=>fs.rmSync(root,{recursive:true,force:true})};
}
function sampleOrder() {
  return {
    order_key:"buyer-123456789",
    offer_key:"systemia.website_audit_quick_win_49.v1",
    amount_cents:4900, currency:"USD", provider_boundary:"raven_nexus",
    payment_state:"paid",provider_paid_verified:true,settlement_verified:true,
    synthetic:false,livemode:true,refund_state:"none",dispute_state:"none",
    provider_receipt_id:"pi_live_verified_001",
    provider_verified_at:new Date(FIXED).toISOString()
  };
}
function makeSnapshot(request,orders=[sampleOrder()]) {
  const fields={
    schema:"evercraft.payments.executive-paid-orders-snapshot.v1",
    authority:"evercraft_payments",provider_boundary:"raven_nexus",
    source:"canonical_order_ledger_and_authoritative_settlement_readback",
    complete:true,synthetic:false,livemode:true,currency:"USD",
    window_start:request.window_start,window_end:request.window_end,
    verified_at:new Date(FIXED).toISOString(),
    order_count:orders.length,
    gross_settled_cents:orders.reduce((sum,o)=>sum+o.amount_cents,0),
    orders
  };
  return {...fields,snapshot_receipt_sha256:"sha256:"+createHash("sha256").update(JSON.stringify(fields)).digest("hex")};
}
function readerFixture(transform=(snapshot)=>snapshot) {
  const token=tokenFixture();
  let calls=0;
  const reader=createExecutivePaymentsReader({
    readbackUrl:ENDPOINT,
    authorizationTokenFile:token.tokenFile,
    now:()=>FIXED,
    fetchImpl:async(url,opts)=>{
      calls++;
      assert.equal(url,ENDPOINT);
      assert.equal(opts.method,"POST");
      assert.equal(opts.redirect,"error");
      assert.equal(opts.headers.authorization,"Bearer local-test-only-opaque-secret-value-of-sufficient-length");
      const req=JSON.parse(opts.body);
      assert.equal(req.action,"read_executive_paid_orders");
      assert.equal(req.currency,"USD");
      assert.equal(Date.parse(req.window_end)-Date.parse(req.window_start),7*24*60*60*1000);
      return Response.json(transform(makeSnapshot(req)));
    }
  });
  return {reader,token,callCount:()=>calls};
}
test("trusted complete canonical snapshot exposes only aggregate settled gross in USD",async()=>{
  const f=readerFixture();
  try{
    const result=await f.reader.read();
    assert.equal(result.schema,EXECUTIVE_PAYMENT_SCHEMA);
    assert.equal(result.state,"verified_settled_snapshot");
    assert.equal(result.verified_paid_orders,1);
    assert.equal(result.gross_settled_cents,4900);
    assert.equal(result.currency,"USD");
    assert.equal(result.full_period_covered,true);
    assert.equal(result.payment_execution_performed,false);
    assert.equal(result.provider_receipts_redacted,true);
    assert.equal(JSON.stringify(result).includes("pi_live_verified_001"),false);
    assert.equal(f.callCount(),1);
  }finally{f.token.dispose();}
});
test("only a complete canonical empty window can verify a zero",async()=>{
  const f=readerFixture(s=>makeSnapshot({window_start:s.window_start,window_end:s.window_end},[]));
  try{
    const r=await f.reader.read();
    assert.equal(r.state,"verified_settled_snapshot");
    assert.equal(r.verified_paid_orders,0);
    assert.equal(r.gross_settled_cents,0);
  }finally{f.token.dispose();}
});
test("unconfigured and unsafe endpoint states never mean there were zero orders",async()=>{
  const none=createExecutivePaymentsReader();
  const r=await none.read();
  assert.equal(r.state,"canonical_feed_not_connected");
  assert.equal(r.verified_paid_orders,null);
  assert.equal(r.gross_settled_cents,null);
  for(const url of [
    "http://fabric.systemiacommandcenters.com/internal/payments/readback",
    "https://evil.example/internal/readback",
    "https://fabric.systemiacommandcenters.com:8443/internal/readback",
    "https://fabric.systemiacommandcenters.com/internal/readback?buyer=1",
  ]){
    const fixture=tokenFixture();
    try{
      const reader=createExecutivePaymentsReader({
        readbackUrl:url,authorizationTokenFile:fixture.tokenFile,
        fetchImpl:async()=>{throw Error("must not call untrusted URL")}
      });
      assert.equal(reader.configured,false);
      assert.equal((await reader.read()).verified_paid_orders,null);
    }finally{fixture.dispose();}
  }
});
test("world-readable or symlinked private token prevents outbound readback",async()=>{
  const f=tokenFixture();
  try{
    fs.chmodSync(f.tokenFile,0o644);
    let reader=createExecutivePaymentsReader({
      readbackUrl:ENDPOINT,authorizationTokenFile:f.tokenFile,
      fetchImpl:()=>{throw Error("not allowed");}
    });
    assert.equal(reader.configured,false);
    assert.equal((await reader.read()).state,"private_readback_configuration_invalid");
    fs.chmodSync(f.tokenFile,0o600);
    const symlink=path.join(f.root,"token-symlink");
    fs.symlinkSync(f.tokenFile,symlink);
    reader=createExecutivePaymentsReader({readbackUrl:ENDPOINT,authorizationTokenFile:symlink});
    assert.equal(reader.configured,false);
  }finally{f.dispose();}
});
test("partial, sandbox, refunded, forged and mismatched order receipts all fail closed",async()=>{
  const cases=[
    s=>({...s,complete:false}),
    s=>({...s,livemode:false}),
    s=>({...s,synthetic:true}),
    s=>({...s,source:"stripe_redirect"}),
    s=>({...s,order_count:s.order_count+1}),
    s=>({...s,gross_settled_cents:s.gross_settled_cents+100}),
    s=>({...s,snapshot_receipt_sha256:"sha256:"+"a".repeat(64)}),
    s=>({...s,verified_at:"2026-11-14T19:00:00.000Z"}),
    s=>makeSnapshot({window_start:s.window_start,window_end:s.window_end},[
      {...sampleOrder(),refund_state:"refunded"}
    ]),
    s=>makeSnapshot({window_start:s.window_start,window_end:s.window_end},[
      {...sampleOrder(),settlement_verified:false}
    ]),
    s=>makeSnapshot({window_start:s.window_start,window_end:s.window_end},[
      sampleOrder(),sampleOrder()
    ]),
    s=>makeSnapshot({window_start:s.window_start,window_end:s.window_end},[
      {...sampleOrder(),currency:"EUR"}
    ]),
  ];
  for(const change of cases){
    const f=readerFixture(change);
    try{
      const result=await f.reader.read();
      assert.equal(result.state,"canonical_feed_unverified");
      assert.equal(result.verified_paid_orders,null);
      assert.equal(result.gross_settled_cents,null);
      assert.equal(result.full_period_covered,false);
    }finally{f.token.dispose();}
  }
});
test("an unavailable or denied payments backend does not create an order or expose a value",async()=>{
  const token=tokenFixture();
  try{
    for(const status of [401,402,403,404,500]){
      const reader=createExecutivePaymentsReader({
        readbackUrl:ENDPOINT,authorizationTokenFile:token.tokenFile,
        fetchImpl:async()=>new Response("not available",{status}),
      });
      const result=await reader.read();
      assert.equal(result.state,"canonical_feed_unverified");
      assert.equal(result.gross_settled_cents,null);
      assert.equal(result.payment_execution_performed,false);
    }
  }finally{token.dispose();}
});
test("Home Payments API has an independent Passport scope and a safe local loopback fallback",async()=>{
  const source=fs.readFileSync(new URL("./server.mjs",import.meta.url),"utf8");
  const route=source.indexOf('url.pathname === "/api/executive/payments"');
  assert.ok(route>0);
  const segment=source.slice(route,route+450);
  assert.ok(segment.includes('sessionFor(req, "home.payments.read")'));
  assert.ok(segment.includes('if (!session.ok) return json(res, session.status, session)'));
  const runtime=await startEvercraftHomeServer({
    host:"127.0.0.1",port:0,authMode:"local",credentialStateDir:"",
    serviceOrigins:{
      RAVEN_NEXUS_WORK_URL:"",
      RAVEN_NEXUS_WORK_TOKEN_FILE:"",
      LINEAGE_CONTROL_ROOM_BRIDGE_URL:"",
      LINEAGE_CONTROL_ROOM_BRIDGE_TOKEN_FILE:"",
      EVERCRAFT_HOME_PAYMENTS_READBACK_URL:"",
      EVERCRAFT_HOME_PAYMENTS_READBACK_TOKEN_FILE:"",
    },
  });
  try{
    const r=await fetch(runtime.url+"/api/executive/payments");
    const response=await r.json();
    assert.equal(r.status,200);
    assert.equal(response.ok,true);
    assert.equal(response.state,"canonical_feed_not_connected");
    assert.equal(response.verified_paid_orders,null);
  }finally{await runtime.close();}
});
test("the private Executive Floor readback is after authenticated Home entry",()=>{
  const html=fs.readFileSync(new URL("./public/index.html",import.meta.url),"utf8");
  assert.ok(html.includes('homeFetch("/api/executive/payments")'));
  assert.ok(html.includes('if(response.status===403)'));
  assert.ok(html.includes('void refreshExecutiveEvidence();'));
  assert.ok(html.includes("Number.isSafeInteger(result.gross_settled_cents)"));
  assert.ok(!html.includes("Stripe dashboard total"));
});
