import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { startFabricLocalRuntime } from "../systemia/mcp/fabric-local-runtime.mjs";
import { FABRIC_OUTCOME_ROUTE } from "../systemia/mcp/fabric-private-outcome-readback.mjs";
import { startEvercraftHomeServer } from "../systemia/evercraft-home/server.mjs";
import { buildVerifiedDeliveryReceipt } from "../systemia/shipping/delivery-receipt.mjs";
import { buildShippingProofBundle } from "../systemia/shipping/proof-bundle.mjs";

const TOKEN="private-test-bridge-token-material-0123456789";
const SIGNING="private-test-source-signature-material-0123456789";
const PUBLIC_ORIGIN="https://fabric.systemiacommandcenters.com";
const H = raw => createHash("sha256").update(raw).digest("hex");
const iso = stamp => new Date(stamp).toISOString();
function sign(body,short=false){return {...body,receipt_hash:short?H(JSON.stringify(body)).slice(0,12):
  "sha256:"+H(JSON.stringify(body))};}
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-fabric-outcome-"));
  const tokenFile=path.join(dir,"token"),signingKeyFile=path.join(dir,"signing");
  fs.writeFileSync(tokenFile,TOKEN+"\n",{mode:0o600});
  fs.writeFileSync(signingKeyFile,SIGNING+"\n",{mode:0o600});
  t.after(()=>fs.rmSync(dir,{force:true,recursive:true}));
  return {tokenFile,signingKeyFile};
}
function receiptSpecimen(now){
  // Entire specimen is artificial, despite intentionally exercising the live-
  // mode data contract. A test constructor cannot attest production provenance.
  const paidOrder={order_key:"fixture-order-123",offer_key:"systemia.website_audit_quick_win_49.v1",
    provider_boundary:"raven_nexus",provider_receipt_id:"fixture-provider-123",
    currency:"USD",amount_cents:4900,payment_state:"paid",provider_paid_verified:true,
    settlement_verified:true,synthetic:false,livemode:true,refund_state:"none",
    dispute_state:"none",provider_verified_at:iso(now-240000)};
  const missionReceipt=sign({schema:"evercraft.systemia.mission-admission-receipt.v1",
    mission_key:"fixture-mission-123",admitted_at:iso(now-180000),
    admitted:true,execution_authority_granted:false},true);
  const executionReceipt=sign({schema:"evercraft.execution-gate.lease-event.v1",
    state:"completed",lease_id:"fixture-lease-123",idempotency_key:"fixture-once",
    outcome_evidence_ref:"fixture-worker-evidence",execution_outcome_recorded:true,
    recorded_at:iso(now-120000)});
  const package_manifest={package_digest:"sha256:"+"a".repeat(64),pass:true,
    artifacts:[{client_filename:"Customer Audit.pdf",mime_type:"application/pdf",
      size_bytes:128,sha256:"sha256:"+"b".repeat(64),
      openability:{openable:true},render_verified:true}]};
  const shipment={shipment_key:"fixture-shipment",idempotency_key:"fixture-shipment-once",
    state:"verified_delivered",provider_message_id:"synthetic-msg-123"};
  const sent_copy_verification={verified:true,provider_message_id:shipment.provider_message_id,
    verification_digest:"sha256:"+"c".repeat(64),recipient_verified:true,
    subject_verified:true,attachments_verified:true,attachment_names:["Customer Audit.pdf"]};
  const recipient_ref="fixture-secret-buyer@example.test";
  const deliveryReceipt=buildVerifiedDeliveryReceipt({
    state:{fulfillment_key:"fixture-fulfillment",mission_key:missionReceipt.mission_key,
      public_id:"website-audit",product_name:"Website Audit",
      payment:{order_key:paidOrder.order_key,evidence_ref:"payment:fixture-authority-only"},
      tasks:[{work_key:"customer-delivery",state:"completed",evidence_refs:["fixture-worker-evidence"]},
        {work_key:"parallel-quality-pass",state:"completed",evidence_refs:["fixture-qa"]},
        {work_key:"human-delivery-review",state:"completed"}],
      promised_deliverables:["PDF"],qa_contract:["artifact review"]},
    recipient_ref,shipment,package_manifest,sent_copy_verification,
    delivered_at:iso(now-60000)});
  const shippingProof=buildShippingProofBundle({
    order:{order_key:"separate-shipping-order-123",recipient_ref,
      state:"verified_delivered",package_digest:package_manifest.package_digest},
    release_manifest:package_manifest,shipment,sent_copy_verification,
    delivery_receipt:deliveryReceipt,generated_at:iso(now-60000)});
  assert.equal(shippingProof.pass,true);
  return {paidOrder,missionReceipt,executionReceipt,deliveryReceipt,shippingProof};
}
async function fabric(t,{loader=null,creds=fixture(t)}={}){
  const runtime=await startFabricLocalRuntime({
    host:"127.0.0.1",port:0,catalog:[],faieSurfaceEnabled:false,
    outcomeReadbackTokenFile:creds.tokenFile,
    outcomeReadbackSigningKeyFile:creds.signingKeyFile,
    outcomeReadbackRecordLoader:loader,
  });
  t.after(()=>runtime.close());
  return runtime;
}
function request(runtime,{nonce="ab".repeat(24),token=TOKEN,method="POST",
  headers={},bodyOverride}={}){
  const body=bodyOverride??{
    schema:"evercraft.os.private-outcome-read-request.v1",
    action:"read_latest_os_outcome",nonce,
    requested_at:iso(Date.now()),max_outcomes:1,
    response_contract:"evercraft.os.private-outcome-source-envelope.v1",
  };
  return fetch(runtime.url+FABRIC_OUTCOME_ROUTE,{
    method,headers:{"authorization":"Bearer "+token,"content-type":"application/json",...headers},
    ...(method==="POST"?{body:JSON.stringify(body)}:{}),
  });
}
test("Fabric private route is held without a canonical source, never browser-accessible",async t=>{
  const r=await fabric(t);
  let response=await request(r);
  assert.equal(response.status,503);
  assert.doesNotMatch(await response.text(),/fixture-order|records|signature/);
  response=await fetch(r.url+FABRIC_OUTCOME_ROUTE);
  assert.equal(response.status,405);
  assert.equal(response.headers.get("access-control-allow-origin"),null);
  response=await fetch(r.url+FABRIC_OUTCOME_ROUTE,{method:"OPTIONS"});
  assert.equal(response.status,405);
  assert.equal(response.headers.get("access-control-allow-origin"),null);
});
test("Fabric requires bearer auth and rejects Origin, malformed data and nonce replay",async t=>{
  let loads=0;
  const r=await fabric(t,{loader:async()=>{loads++;return receiptSpecimen(Date.now());}});
  let response=await request(r,{token:"wrong-but-very-long-token"});
  assert.equal(response.status,403);
  response=await request(r,{headers:{origin:PUBLIC_ORIGIN}});
  assert.equal(response.status,403);
  response=await request(r,{bodyOverride:{hello:"world"}});
  assert.equal(response.status,400);
  assert.equal(loads,0);
  response=await request(r);
  assert.equal(response.status,200);
  const delivered=await response.json();
  assert.equal(delivered.schema,"evercraft.os.private-outcome-source-envelope.v1");
  assert.match(delivered.signature,/^hmac-sha256:[a-f0-9]{64}$/);
  assert.equal(delivered.nonce,"ab".repeat(24));
  assert.equal(loads,1);
  response=await request(r);
  assert.equal(response.status,409);
  assert.equal(loads,1);
});
test("Fabric does not sign refunded, missing, tampered or unjoined source records",async t=>{
  let receipts=receiptSpecimen(Date.now());
  const r=await fabric(t,{loader:async()=>receipts});
  receipts={...receipts,paidOrder:{...receipts.paidOrder,refund_state:"refunded"}};
  let response=await request(r,{nonce:"bc".repeat(24)});
  assert.equal(response.status,503);
  assert.doesNotMatch(await response.text(),/fixture-order-123/);
  receipts=null;
  response=await request(r,{nonce:"cd".repeat(24)});
  assert.equal(response.status,503);
  receipts=receiptSpecimen(Date.now());
  receipts={...receipts,executionReceipt:{...receipts.executionReceipt,outcome_evidence_ref:"false-join"}};
  response=await request(r,{nonce:"de".repeat(24)});
  assert.equal(response.status,503);
});
test("real localhost Fabric to Home signed transport preserves owner-side UNATTESTED state",async t=>{
  const creds=fixture(t);
  const f=await fabric(t,{creds,loader:async()=>receiptSpecimen(Date.now())});
  let forwarded=0;
  const home=await startEvercraftHomeServer({
    host:"127.0.0.1",port:0,authMode:"local",
    operator:"Evercraft Test Operator",
    serviceOrigins:{
      EVERCRAFT_OS_OUTCOME_READBACK_URL:PUBLIC_ORIGIN+FABRIC_OUTCOME_ROUTE,
      EVERCRAFT_OS_OUTCOME_READBACK_TOKEN_FILE:creds.tokenFile,
      EVERCRAFT_OS_OUTCOME_READBACK_SIGNING_KEY_FILE:creds.signingKeyFile,
    },
    outcomeReadbackFetch:async(url,options)=>{
      forwarded++;
      assert.equal(url,PUBLIC_ORIGIN+FABRIC_OUTCOME_ROUTE);
      return fetch(f.url+FABRIC_OUTCOME_ROUTE,options);
    },
  });
  t.after(()=>home.close());
  const response=await fetch(home.url+"/api/os/outcome-readback");
  assert.equal(response.status,200);
  const status=await response.json();
  assert.equal(status.state,"authenticated_source_consistent_unattested");
  assert.equal(status.bridge_response_authenticated,true);
  assert.equal(status.source_contracts_structurally_consistent,true);
  assert.equal(status.customer_delivery_verified,false);
  assert.equal(status.payment_issuer_independently_authenticated,false);
  assert.equal(status.systemia_ledger_independently_authenticated,false);
  assert.equal(status.execution_ledger_independently_authenticated,false);
  assert.equal(status.shipping_provider_independently_refetched,false);
  assert.equal(forwarded,1);
  const redacted=JSON.stringify(status);
  for(const secret of ["fixture-secret-buyer@example.test",TOKEN,SIGNING,
    "fixture-provider-123","fixture-worker-evidence","fixture-order-123"]){
    assert.ok(!redacted.includes(secret),secret);
  }
  // A separate anonymous public Home request is not used to dispatch.
  const osStatus=await (await fetch(home.url+"/api/os/integration")).json();
  assert.equal(osStatus.overall_state,"held_pending_end_to_end_field_proof");
  assert.equal(osStatus.real_settlement_verified_by_this_read,false);
});
test("private secret file mode reversal causes preflight hold",async t=>{
  const creds=fixture(t);fs.chmodSync(creds.tokenFile,0o644);
  const r=await fabric(t,{creds,loader:async()=>receiptSpecimen(Date.now())});
  const response=await request(r);
  assert.equal(response.status,503);
});
