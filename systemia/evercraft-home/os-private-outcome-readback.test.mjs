import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, createHmac } from "node:crypto";
import { buildVerifiedDeliveryReceipt } from "../shipping/delivery-receipt.mjs";
import { buildShippingProofBundle } from "../shipping/proof-bundle.mjs";
import { createPrivateOutcomeReadback } from "./os-private-outcome-readback.mjs";
import { startEvercraftHomeServer } from "./server.mjs";
import { EvercraftPassport } from "../passport/passport.mjs";

const CLOCK = Date.parse("2026-11-15T18:07:00.000Z");
const TIME = stamp => new Date(CLOCK + stamp * 1000).toISOString();
const URL = "https://fabric.systemiacommandcenters.com/internal/os/outcomes/latest";
const KEY = "test-signature-key-that-is-only-a-synthetic-fixture-123";
const TOKEN = "test-bearer-token-for-synthetic-fixture-1234567";
const NONCE = "ab".repeat(24);
const hash = x => createHash("sha256").update(x).digest("hex");
const signed = (body,kind) => ({
  ...body,receipt_hash: kind==="mission" ? hash(JSON.stringify(body)).slice(0,12)
    : "sha256:" + hash(JSON.stringify(body))
});
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-outcome-readback-"));
  const tok=path.join(dir,"token"),key=path.join(dir,"signer");
  fs.writeFileSync(tok,TOKEN+"\n",{mode:0o600});
  fs.writeFileSync(key,KEY+"\n",{mode:0o600});
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  return {dir,tok,key};
}
function specimen() {
  const paidOrder={
    order_key:"buyer-internal-12345",offer_key:"systemia.website_audit_quick_win_49.v1",
    amount_cents:4900,currency:"USD",provider_boundary:"raven_nexus",
    payment_state:"paid",provider_paid_verified:true,settlement_verified:true,
    synthetic:false,livemode:true,refund_state:"none",dispute_state:"none",
    provider_receipt_id:"pi_fixture_private_001",provider_verified_at:TIME(-420),
  };
  const missionReceipt=signed({
    schema:"evercraft.systemia.mission-admission-receipt.v1",mission_key:"test-mission-123",
    admitted_at:TIME(-360),admitted:true,execution_authority_granted:false,
  },"mission");
  const executionReceipt=signed({
    schema:"evercraft.execution-gate.lease-event.v1",
    lease_id:"test-lease-123",idempotency_key:"test-idempotency-123",
    state:"completed",execution_outcome_recorded:true,
    outcome_evidence_ref:"private-worker-reference-123",recorded_at:TIME(-240),
  },"execution");
  const release={
    package_digest:"sha256:"+"a".repeat(64),pass:true,
    artifacts:[{client_filename:"Audit.pdf",size_bytes:124,mime_type:"application/pdf",
      sha256:"sha256:"+"b".repeat(64),openability:{openable:true},render_verified:true}],
  };
  const shipment={
    shipment_key:"private-shipment-123",state:"verified_delivered",
    idempotency_key:"only-once-fixture",provider_message_id:"fixture-msg-123",
  };
  const sent={
    verified:true,provider_message_id:shipment.provider_message_id,
    verification_digest:"sha256:"+"c".repeat(64),
    recipient_verified:true,attachments_verified:true,subject_verified:true,
    attachment_names:["Audit.pdf"],
  };
  const recipient_ref="buyer-secret@example.test";
  const deliveryReceipt=buildVerifiedDeliveryReceipt({
    state:{
      fulfillment_key:"private-fulfillment-123",mission_key:missionReceipt.mission_key,
      public_id:"website-audit",product_name:"Website Audit",
      payment:{order_key:paidOrder.order_key,evidence_ref:"payment:private-test-123"},
      tasks:[
        {work_key:"customer-delivery",state:"completed",evidence_refs:["private-worker-reference-123"]},
        {work_key:"parallel-quality-pass",state:"completed",evidence_refs:["qa-proof"]},
        {work_key:"human-delivery-review",state:"completed"},
      ],
      promised_deliverables:["PDF"],qa_contract:["QA"],
    },
    recipient_ref,shipment,package_manifest:release,
    sent_copy_verification:sent,delivered_at:TIME(-180),
  });
  const shippingProof=buildShippingProofBundle({
    order:{order_key:"shipping-tower-123",state:"verified_delivered",recipient_ref,
      package_digest:release.package_digest},
    release_manifest:release,shipment,sent_copy_verification:sent,
    delivery_receipt:deliveryReceipt,generated_at:TIME(-180),
  });
  assert.equal(shippingProof.pass,true);
  return {paidOrder,missionReceipt,executionReceipt,deliveryReceipt,shippingProof};
}
function envelope(records=specimen(),overrides={}) {
  const body={
    schema:"evercraft.os.private-outcome-source-envelope.v1",
    read_action:"read_latest_os_outcome",
    nonce:NONCE,complete:true,synthetic:false,observed_at:TIME(0),records,
    ...overrides,
  };
  return {...body,signature:"hmac-sha256:"+createHmac("sha256",KEY)
    .update(JSON.stringify(body)).digest("hex")};
}
function reader(t,fetchImpl,config={}) {
  const {tok,key}=fixture(t);
  return createPrivateOutcomeReadback({
    endpointUrl:URL,tokenFile:tok,signatureKeyFile:key,
    fetchImpl,now:()=>CLOCK,nonceFactory:()=>NONCE,...config,
  });
}
test("unconfigured, unsafe credentials, and non-owned endpoints fail before network",async t=>{
  const blank=await createPrivateOutcomeReadback().read();
  assert.equal(blank.state,"not_connected");
  assert.equal(blank.private_order_data_returned,false);
  let outbound=0;
  const f=fixture(t);
  const bad=[
    URL.replace("https:","http:"),
    "https://untrusted.example/internal/os/outcomes/latest",
    "https://fabric.systemiacommandcenters.com:444/internal/os/outcomes/latest",
    "https://fabric.systemiacommandcenters.com/public/outcomes/latest",
    URL+"?order_id=private",
  ];
  for(const endpointUrl of bad) {
    const r=createPrivateOutcomeReadback({
      endpointUrl,tokenFile:f.tok,signatureKeyFile:f.key,
      fetchImpl:()=>{outbound++;throw Error("should not fetch");}
    });
    assert.equal(r.configured,false);
    assert.equal((await r.read()).state,"configuration_invalid");
  }
  fs.chmodSync(f.key,0o644);
  assert.equal(createPrivateOutcomeReadback({
    endpointUrl:URL,tokenFile:f.tok,signatureKeyFile:f.key,
  }).configured,false);
  assert.equal(outbound,0);
});
test("server-only nonce and HMAC bridge projects sanitized, UNATTESTED source consistency",async t=>{
  let calls=0;
  const r=reader(t,async(url,opts)=>{
    calls++;
    assert.equal(url,URL);
    assert.equal(opts.method,"POST");
    assert.equal(opts.redirect,"error");
    assert.equal(opts.headers.authorization,"Bearer "+TOKEN);
    const q=JSON.parse(opts.body);
    assert.equal(q.action,"read_latest_os_outcome");
    assert.equal(q.max_outcomes,1);
    assert.equal(q.nonce,NONCE);
    assert.equal(q.order_key,undefined);
    return Response.json(envelope());
  });
  const value=await r.read();
  assert.equal(calls,1);
  assert.equal(value.state,"authenticated_source_consistent_unattested");
  assert.equal(value.bridge_response_authenticated,true);
  assert.equal(value.source_contracts_structurally_consistent,true);
  for(const name of [
    "payment_issuer_independently_authenticated","systemia_ledger_independently_authenticated",
    "execution_ledger_independently_authenticated","shipping_provider_independently_refetched",
    "exact_offer_product_verified","replay_and_side_effects_verified","worker_result_attested",
    "customer_delivery_verified","customer_acceptance_verified","business_margin_verified",
    "authority_granted","mutation_performed","private_order_data_returned"
  ]) assert.equal(value[name],false,name);
  const output=JSON.stringify(value);
  for(const secret of [TOKEN,KEY,"buyer-secret@example.test","pi_fixture_private_001",
    "buyer-internal-12345","private-worker-reference-123","test-mission-123"]){
    assert.equal(output.includes(secret),false,"private material returned: "+secret);
  }
});
test("tamper, replayed nonce, stale signature, synthetic and source mismatch are held",async t=>{
  const variants=[
    x=>({...x,signature:"hmac-sha256:"+"f".repeat(64)}),
    x=>envelope(specimen(),{nonce:"cd".repeat(24)}),
    x=>envelope(specimen(),{observed_at:TIME(-3600)}),
    x=>envelope(specimen(),{synthetic:true}),
    x=>({...x,records:{...x.records,paidOrder:{...x.records.paidOrder,order_key:"tampered"}}}),
  ];
  for(const v of variants){
    const r=reader(t,async()=>Response.json(v(envelope())));
    const result=await r.read();
    assert.equal(result.bridge_response_authenticated,false);
    assert.equal(result.state,"private_bridge_unverified");
  }
  const mismatched=reader(t,async()=>Response.json(
    envelope({...specimen(),paidOrder:{...specimen().paidOrder,refund_state:"refunded"}})
  ));
  const held=await mismatched.read();
  assert.equal(held.state,"authenticated_source_held");
  assert.equal(held.bridge_response_authenticated,true);
  assert.ok(held.reason_codes.includes("payment_contract_invalid"));
});
test("non-JSON, redirects, oversized and provider outages fail closed",async t=>{
  for(const fake of [
    async()=>new Response("bad",{status:302}),
    async()=>new Response("bad",{status:200,headers:{"content-type":"text/plain"}}),
    async()=>Response.json({bad:true}),
    async()=>new Response("x".repeat(256*1024+1),{status:200,headers:{"content-type":"application/json"}}),
    async()=>{throw Error("upstream offline")},
  ]) {
    const r=reader(t,fake);
    const result=await r.read();
    assert.equal(result.state,"private_bridge_unverified");
    assert.equal(result.customer_delivery_verified,false);
  }
});
test("Home exposes private readback only on an authenticated scoped route",async t=>{
  const server=await startEvercraftHomeServer({
    host:"127.0.0.1",port:0,authMode:"local",operator:"OS Signed Bridge Lab",
    serviceOrigins:{},
  });
  t.after(()=>server.close());
  const res=await fetch(server.url+"/api/os/outcome-readback");
  assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.schema,"evercraft.home.os-outcome-readback.v1");
  assert.equal(body.state,"not_connected");
  assert.equal(body.customer_delivery_verified,false);
  assert.equal(body.private_order_data_returned,false);
});

test("Home HTTP boundary performs a private signed read and emits no customer identifiers",async t=>{
  const creds=fixture(t);
  let calls=0;
  const server=await startEvercraftHomeServer({
    host:"127.0.0.1",port:0,authMode:"local",operator:"OS Signed Integration Lab",
    serviceOrigins:{
      EVERCRAFT_OS_OUTCOME_READBACK_URL:URL,
      EVERCRAFT_OS_OUTCOME_READBACK_TOKEN_FILE:creds.tok,
      EVERCRAFT_OS_OUTCOME_READBACK_SIGNING_KEY_FILE:creds.key,
    },
    outcomeReadbackFetch:async(url,opts)=>{
      calls++;
      assert.equal(url,URL);
      assert.equal(opts.headers.authorization,"Bearer "+TOKEN);
      const request=JSON.parse(opts.body);
      const base={...envelope(),nonce:request.nonce,observed_at:new Date().toISOString()};
      const {signature:ignored,...body}=base;
      return Response.json({...body,signature:"hmac-sha256:"+
        createHmac("sha256",KEY).update(JSON.stringify(body)).digest("hex")});
    },
  });
  t.after(()=>server.close());
  const response=await fetch(server.url+"/api/os/outcome-readback");
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(calls,1);
  assert.equal(body.state,"authenticated_source_consistent_unattested");
  assert.equal(body.bridge_response_authenticated,true);
  assert.equal(body.customer_delivery_verified,false);
  assert.equal(body.payment_issuer_independently_authenticated,false);
  const serialized=JSON.stringify(body);
  for(const secret of [TOKEN,KEY,"buyer-secret@example.test","buyer-internal-12345",
    "pi_fixture_private_001","private-worker-reference-123"]) {
    assert.equal(serialized.includes(secret),false);
  }
});

test("Passport-mode Home denies outcome bridge without payments scope and permits explicit grant", async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-os-scope-"));
  const claimCode="private-one-time-os-scope-claim";
  let runtime;
  t.after(async()=>{
    if(runtime)await runtime.close();
    fs.rmSync(root,{recursive:true,force:true});
  });
  runtime=await startEvercraftHomeServer({
    host:"127.0.0.1",port:0,authMode:"passport",
    identitySecret:"os-scope-test-identity-secret-long-enough-1234",
    identityStateDir:path.join(root,"identity"),
    passportStateDir:path.join(root,"passport"),
    credentialStateDir:path.join(root,"credentials"),
    cookieSecure:false,
    ownerClaimSha256:hash(claimCode),
    ownerSubjectRef:"user:os-scope-owner",
    ownerLogin:"operator-test",
    ownerDisplayName:"Operator",
    serviceOrigins:{},
  });
  const claimed=await fetch(runtime.url+"/api/owner-claim",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({claim_code:claimCode,password:"long-local-test-password-123"}),
  });
  assert.equal(claimed.status,201);
  const login=await fetch(runtime.url+"/api/login",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({login:"operator-test",password:"long-local-test-password-123"}),
  });
  assert.equal(login.status,200);
  const cookie=String(login.headers.get("set-cookie")).split(";")[0];
  assert.match(cookie,/^evercraft_session=/);
  let response=await fetch(runtime.url+"/api/os/outcome-readback",{
    headers:{cookie},
  });
  assert.equal(response.status,403,"identity + Systemia read must not imply payment read");
  const passport=new EvercraftPassport({stateDir:path.join(root,"passport")});
  const now=Date.now();
  const granted=passport.issueGrant({
    idempotency_key:"os-proof-grant-payment-read",
    authority_state:"manual_authorized",
    authority_receipt_ref:"receipt:synthetic-os-scope-review",
    subject_ref:"user:os-scope-owner",
    issuer_ref:"authority:synthetic-test",
    product:"evercraft-home",
    scopes:["home.payments.read"],
    starts_at:new Date(now-60_000).toISOString(),
    ends_at:new Date(now+60*60_000).toISOString(),
  });
  assert.equal(granted.state,"granted");
  response=await fetch(runtime.url+"/api/os/outcome-readback",{
    headers:{cookie},
  });
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.state,"not_connected");
  assert.equal(body.customer_delivery_verified,false);
});
