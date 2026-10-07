import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createPayPalOrder, reconcilePayPalOrder } from "./entries/paypal-checkout-black-box/paypal.mjs";
import { payPalCompetitionSecretStatus, resolvePayPalCompetitionSecret } from "./paypal-secret-boundary.mjs";

const secret=resolvePayPalCompetitionSecret(process.env);
const status=payPalCompetitionSecretStatus(secret);
const out=path.resolve(process.env.SYSTEMIA_PAYPAL_CANARY_RECEIPT||"artifacts/competition-provider/paypal-sandbox-canary.json");
const hash=(value)=>"sha256:"+createHash("sha256").update(JSON.stringify(value)).digest("hex");
let body;

if(!secret){
  body={
    schema:"evercraft.systemia.paypal-sandbox-canary.v1",
    state:"held_missing_credentials",
    provider:"PayPal Sandbox",
    credential_status:status,
    real_money_attempted:false,
    capture_attempted:false,
    terms_acceptance_attempted:false,
    observed_at:new Date().toISOString(),
  };
}else{
  try{
    const proposalId="canary-"+Date.now();
    const order=await createPayPalOrder({
      proposal_id:proposalId,
      item:"Checkout Black Box sandbox canary",
      amount:1,
      currency:"USD",
    },{
      clientId:secret.client_id,
      clientSecret:secret.client_secret,
      baseUrl:process.env.PAYPAL_API_BASE_URL||"https://api-m.sandbox.paypal.com",
    });
    const reconciliation=reconcilePayPalOrder(order,{
      proposal_id:proposalId,
      amount:1,
      currency:"USD",
    });
    body={
      schema:"evercraft.systemia.paypal-sandbox-canary.v1",
      state:order?.id&&reconciliation.ok?"passed":"held_reconciliation_failed",
      provider:"PayPal Sandbox",
      credential_status:status,
      paypal_order_id:order?.id||null,
      paypal_status:order?.status||null,
      reconciliation,
      real_money_attempted:false,
      capture_attempted:false,
      terms_acceptance_attempted:false,
      observed_at:new Date().toISOString(),
    };
  }catch(error){
    body={
      schema:"evercraft.systemia.paypal-sandbox-canary.v1",
      state:"held_provider_error",
      provider:"PayPal Sandbox",
      credential_status:status,
      error_code:String(error?.message||"paypal_canary_failed").slice(0,240),
      real_money_attempted:false,
      capture_attempted:false,
      terms_acceptance_attempted:false,
      observed_at:new Date().toISOString(),
    };
  }
}
const receipt={...body,receipt_hash:hash(body)};
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
process.stdout.write(JSON.stringify(receipt)+"\n");
