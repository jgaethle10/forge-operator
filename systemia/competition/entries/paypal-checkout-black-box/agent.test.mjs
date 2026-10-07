import test from "node:test";
import assert from "node:assert/strict";
import {
  authorizeProposal,
  captureAuthorizedPayPalOrder,
  createAuthorizedPayPalOrder,
  interpretPurchaseIntent,
} from "./agent.mjs";
import { reconcilePayPalOrder } from "./paypal.mjs";

function fakeAi(content){
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    calls.push({url:String(url),headers:options.headers,body:JSON.parse(options.body||"{}")});
    return {ok:true,status:200,async text(){return JSON.stringify({id:"ai-fixture",model:"fixture-model",choices:[{message:{content:JSON.stringify(content)}}]});}};
  };
  fetchImpl.calls=calls; return fetchImpl;
}
function fakePayPal(){
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    const u=String(url);
    const isJson=String(options.headers?.["content-type"]||"").includes("application/json");
    calls.push({url:u,method:options.method,headers:options.headers,body:options.body?(isJson?JSON.parse(options.body):String(options.body)):null});
    if(u.endsWith("/v1/oauth2/token")){
      return {ok:true,status:200,async text(){return JSON.stringify({access_token:"sandbox-token",expires_in:3600});}};
    }
    if(u.endsWith("/v2/checkout/orders")&&options.method==="POST"){
      const body=JSON.parse(options.body);
      return {ok:true,status:201,async text(){return JSON.stringify({
        id:"PAYPAL-ORDER-1",
        status:"CREATED",
        purchase_units:body.purchase_units,
        links:[{rel:"approve",href:"https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-1"}],
      });}};
    }
    if(u.endsWith("/v2/checkout/orders/PAYPAL-ORDER-1")&&options.method==="GET"){
      return {ok:true,status:200,async text(){return JSON.stringify({
        id:"PAYPAL-ORDER-1",status:"APPROVED",
        purchase_units:[{reference_id:"proposal-fixture",custom_id:"proposal-fixture",amount:{currency_code:"USD",value:"49.00"}}],
      });}};
    }
    if(u.endsWith("/v2/checkout/orders/PAYPAL-ORDER-1/capture")){
      return {ok:true,status:201,async text(){return JSON.stringify({
        id:"PAYPAL-ORDER-1",status:"COMPLETED",
        purchase_units:[{reference_id:"proposal-fixture",custom_id:"proposal-fixture",amount:{currency_code:"USD",value:"49.00"},payments:{captures:[{amount:{currency_code:"USD",value:"49.00"}}]}}],
      });}};
    }
    throw new Error("unexpected_paypal_call:"+u);
  };
  fetchImpl.calls=calls; return fetchImpl;
}

test("AI proposal obeys human hard max and does not echo model key",async()=>{
  const fetchImpl=fakeAi({merchant:"Evercraft LLC",item:"Quick Win Audit",amount:49,currency:"USD",max_amount:49,recurring:false,rationale:"Requested one-time audit"});
  const proposal=await interpretPurchaseIntent({intent:"Pay Evercraft $49 once for a Quick Win Audit",hard_max_amount:49},{fetchImpl,apiKey:"model-secret-abcdefghijklmnopqrstuvwxyz",model:"fixture-model"});
  assert.equal(proposal.amount,49);
  assert.equal(proposal.max_amount,49);
  assert.equal(proposal.recurring,false);
  assert.match(proposal.proposal_hash,/^sha256:/);
  assert.equal(JSON.stringify(proposal).includes("model-secret"),false);
});

test("AI proposal cannot exceed the human hard maximum",async()=>{
  const fetchImpl=fakeAi({merchant:"Evercraft LLC",item:"Audit",amount:80,currency:"USD",max_amount:80,recurring:false,rationale:"bad"});
  await assert.rejects(
    ()=>interpretPurchaseIntent({intent:"Spend no more than $50",hard_max_amount:50},{fetchImpl,apiKey:"fixture-key-abcdefghijklmnopqrstuvwxyz",model:"fixture"}),
    /hard_max/
  );
});

test("human authorization is signed and tampering fails before PayPal",async()=>{
  const fetchImpl=fakeAi({merchant:"Evercraft LLC",item:"Quick Win Audit",amount:49,currency:"USD",max_amount:49,recurring:false,rationale:"Requested"});
  const proposal=await interpretPurchaseIntent({intent:"Pay $49 for the audit",hard_max_amount:49},{fetchImpl,apiKey:"fixture-key-abcdefghijklmnopqrstuvwxyz",model:"fixture"});
  const signingKey="checkout-black-box-signing-key-fixture-123456789";
  const auth=authorizeProposal(proposal,{confirmed:true,signingKey});
  const tampered={...proposal,amount:99};
  const paypalFetch=fakePayPal();
  await assert.rejects(
    ()=>createAuthorizedPayPalOrder({proposal:tampered,authorization:auth},{signingKey,paypal:{fetchImpl:paypalFetch,clientId:"sandbox-client",clientSecret:"sandbox-secret-abcdefghijklmnopqrstuvwxyz"}}),
    /authorization_hash_mismatch|proposal_tampered|authorization_amount_mismatch/
  );
  assert.equal(paypalFetch.calls.length,0);
});

test("PayPal order is created only from the exact authorized value",async()=>{
  const proposal={
    proposal_id:"proposal-fixture",merchant:"Evercraft LLC",item:"Quick Win Audit",amount:49,currency:"USD",max_amount:49,recurring:false,source_intent_hash:"sha256:intent"
  };
  const crypto=await import("node:crypto");
  const stable={proposal_id:proposal.proposal_id,merchant:proposal.merchant,item:proposal.item,amount:proposal.amount,currency:proposal.currency,max_amount:proposal.max_amount,recurring:proposal.recurring,source_intent_hash:proposal.source_intent_hash};
  proposal.proposal_hash="sha256:"+crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex");
  const signingKey="checkout-black-box-signing-key-fixture-123456789";
  const auth=authorizeProposal(proposal,{confirmed:true,signingKey});
  const fetchImpl=fakePayPal();
  const record=await createAuthorizedPayPalOrder({proposal,authorization:auth},{signingKey,paypal:{fetchImpl,clientId:"sandbox-client",clientSecret:"sandbox-secret-abcdefghijklmnopqrstuvwxyz",baseUrl:"https://api-m.sandbox.paypal.com"}});
  assert.equal(record.paypal.order_id,"PAYPAL-ORDER-1");
  assert.equal(record.reconciliation.ok,true);
  assert.equal(record.payment_verified,false);
  const createCall=fetchImpl.calls.find((x)=>x.url.endsWith("/v2/checkout/orders")&&x.method==="POST");
  assert.equal(createCall.body.purchase_units[0].amount.value,"49.00");
  assert.equal(createCall.body.purchase_units[0].amount.currency_code,"USD");
});

test("reconciliation catches amount drift",()=>{
  const result=reconcilePayPalOrder({
    id:"X",status:"CREATED",
    purchase_units:[{reference_id:"p",custom_id:"p",amount:{currency_code:"USD",value:"59.00"}}],
  },{proposal_id:"p",amount:49,currency:"USD"});
  assert.equal(result.ok,false);
  assert.ok(result.errors.includes("amount_drift"));
});

test("capture requires a second explicit confirmation",async()=>{
  await assert.rejects(
    ()=>captureAuthorizedPayPalOrder({paypal:{order_id:"PAYPAL-ORDER-1"}},{confirmCapture:false}),
    /explicit_capture_confirmation_required/
  );
});
