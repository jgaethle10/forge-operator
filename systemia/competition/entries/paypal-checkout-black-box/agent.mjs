import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  capturePayPalOrder,
  createPayPalOrder,
  getPayPalOrder,
  reconcilePayPalOrder,
} from "./paypal.mjs";

const DEFAULT_AI_BASE_URL="https://api.openai.com/v1";

function clean(value,max=2000){
  return String(value??"").replace(/\s+/g," ").trim().slice(0,max);
}
function money(value){
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0) throw new Error("positive_amount_required");
  return Math.round(n*100)/100;
}
function hash(value){
  return "sha256:"+createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function stableProposalBody(proposal){
  return {
    proposal_id:proposal.proposal_id,
    merchant:proposal.merchant,
    item:proposal.item,
    amount:proposal.amount,
    currency:proposal.currency,
    max_amount:proposal.max_amount,
    recurring:proposal.recurring,
    source_intent_hash:proposal.source_intent_hash,
  };
}
function extractJson(text){
  let value=String(text||"").trim().replace(/<think>[\s\S]*?<\/think>/gi,"").trim();
  const fence=value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if(fence) value=fence[1].trim();
  const first=value.indexOf("{"),last=value.lastIndexOf("}");
  if(first>=0&&last>first) value=value.slice(first,last+1);
  return JSON.parse(value);
}

export async function interpretPurchaseIntent(input={},{
  fetchImpl=globalThis.fetch,
  apiKey=process.env.AI_API_KEY||process.env.OPENAI_API_KEY||"",
  baseUrl=process.env.AI_API_BASE_URL||DEFAULT_AI_BASE_URL,
  model=process.env.AI_MODEL||"",
  timeoutMs=20_000,
}={}){
  const intent=clean(input.intent,4000);
  if(!intent) throw new Error("purchase_intent_required");
  const hardMax=input.hard_max_amount==null?null:money(input.hard_max_amount);
  const hardCurrency=clean(input.currency||"USD",8).toUpperCase();
  if(!apiKey) throw new Error("ai_api_key_missing");
  if(!model) throw new Error("ai_model_required");

  const system=[
    "You convert a human purchase request into a narrow commerce proposal.",
    "Return exactly one JSON object.",
    "Never invent a merchant, item, or amount that is not supported by the request.",
    "Never increase a stated maximum budget.",
    "Recurring must be false unless the human explicitly asked for recurring billing.",
    'Schema: {"merchant":"string","item":"string","amount":49.00,"currency":"USD","max_amount":49.00,"recurring":false,"rationale":"short string"}',
  ].join("\n");

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs||20_000)));
  try{
    const response=await fetchImpl(String(baseUrl).replace(/\/$/,"")+"/chat/completions",{
      method:"POST",
      headers:{
        authorization:"Bearer "+apiKey,
        "content-type":"application/json",
        accept:"application/json",
      },
      body:JSON.stringify({
        model,
        temperature:0,
        max_tokens:700,
        messages:[
          {role:"system",content:system},
          {role:"user",content:JSON.stringify({intent,hard_max_amount:hardMax,currency:hardCurrency})},
        ],
      }),
      signal:controller.signal,
    });
    const raw=await response.text();
    let payload={};
    try{payload=raw?JSON.parse(raw):{};}catch{payload={};}
    if(!response.ok) throw new Error("ai_http_"+response.status+":"+clean(payload?.error?.message||raw,240));
    const content=payload?.choices?.[0]?.message?.content;
    if(typeof content!=="string"||!content.trim()) throw new Error("ai_empty_response");
    const parsed=extractJson(content);
    const amount=money(parsed.amount);
    const currency=clean(parsed.currency||hardCurrency,8).toUpperCase();
    const maxAmount=money(parsed.max_amount??hardMax??amount);

    if(hardMax!=null&&amount>hardMax) throw new Error("proposal_exceeds_human_hard_max");
    if(hardMax!=null&&maxAmount>hardMax) throw new Error("proposal_max_exceeds_human_hard_max");
    if(currency!==hardCurrency) throw new Error("proposal_currency_drift");
    if(amount>maxAmount) throw new Error("proposal_exceeds_declared_max");

    const proposal={
      schema:"evercraft.competition.checkout-black-box.proposal.v1",
      proposal_id:"proposal_"+randomUUID(),
      merchant:clean(parsed.merchant,160),
      item:clean(parsed.item,240),
      amount,
      currency,
      max_amount:maxAmount,
      recurring:parsed.recurring===true,
      rationale:clean(parsed.rationale,500),
      source_intent_hash:hash({intent}),
      created_at:new Date().toISOString(),
      model:String(payload?.model||model),
      ai_provider_evidence_state:"live_api_response",
    };
    if(!proposal.merchant) throw new Error("merchant_required");
    if(!proposal.item) throw new Error("item_required");
    return {...proposal,proposal_hash:hash(stableProposalBody(proposal))};
  }finally{
    clearTimeout(timer);
  }
}

export function authorizeProposal(proposal,{
  confirmed=false,
  signingKey=process.env.CHECKOUT_BLACK_BOX_SIGNING_KEY||"",
  ttlSeconds=900,
}={}){
  if(!confirmed) throw new Error("explicit_human_confirmation_required");
  if(!signingKey||String(signingKey).length<24) throw new Error("authorization_signing_key_missing");
  const currentHash=hash(stableProposalBody(proposal));
  if(currentHash!==proposal.proposal_hash) throw new Error("proposal_tampered_before_authorization");
  const body={
    schema:"evercraft.competition.checkout-black-box.authorization.v1",
    authorization_id:"auth_"+randomUUID(),
    proposal_id:proposal.proposal_id,
    proposal_hash:proposal.proposal_hash,
    amount:proposal.amount,
    currency:proposal.currency,
    merchant:proposal.merchant,
    item:proposal.item,
    recurring:proposal.recurring,
    human_confirmed:true,
    issued_at:new Date().toISOString(),
    expires_at:new Date(Date.now()+Math.max(60,Number(ttlSeconds||900))*1000).toISOString(),
  };
  const signature=createHmac("sha256",String(signingKey)).update(JSON.stringify(body)).digest("hex");
  return {...body,signature};
}

export function verifyAuthorization(authorization,proposal,{
  signingKey=process.env.CHECKOUT_BLACK_BOX_SIGNING_KEY||"",
}={}){
  if(!authorization?.human_confirmed) throw new Error("authorization_not_human_confirmed");
  if(!signingKey||String(signingKey).length<24) throw new Error("authorization_signing_key_missing");
  const {signature,...body}=authorization;
  const expected=createHmac("sha256",String(signingKey)).update(JSON.stringify(body)).digest("hex");
  const left=Buffer.from(String(signature||""),"utf8"),right=Buffer.from(expected,"utf8");
  if(left.length!==right.length||!timingSafeEqual(left,right)) throw new Error("authorization_signature_invalid");
  if(Date.parse(authorization.expires_at)<=Date.now()) throw new Error("authorization_expired");
  if(authorization.proposal_id!==proposal.proposal_id) throw new Error("authorization_proposal_mismatch");
  if(authorization.proposal_hash!==proposal.proposal_hash) throw new Error("authorization_hash_mismatch");
  if(Number(authorization.amount)!==Number(proposal.amount)) throw new Error("authorization_amount_mismatch");
  if(String(authorization.currency)!==String(proposal.currency)) throw new Error("authorization_currency_mismatch");
  return true;
}

export async function createAuthorizedPayPalOrder({proposal,authorization},{
  signingKey=process.env.CHECKOUT_BLACK_BOX_SIGNING_KEY||"",
  paypal={},
}={}){
  verifyAuthorization(authorization,proposal,{signingKey});
  const order=await createPayPalOrder({
    proposal_id:proposal.proposal_id,
    item:proposal.item,
    amount:proposal.amount,
    currency:proposal.currency,
  },paypal);
  const reconciliation=reconcilePayPalOrder(order,authorization);
  if(!reconciliation.ok) throw new Error("paypal_order_reconciliation_failed:"+reconciliation.errors.join(","));
  return {
    schema:"evercraft.competition.checkout-black-box.order.v1",
    state:"paypal_order_created",
    proposal,
    authorization,
    paypal:{
      order_id:order.id,
      status:order.status,
      approval_url:(order.links||[]).find((x)=>x.rel==="approve"||x.rel==="payer-action")?.href||null,
    },
    reconciliation,
    capture_authority:false,
    payment_verified:false,
    created_at:new Date().toISOString(),
  };
}

export async function reconcileAuthorizedPayPalOrder(record,{paypal={}}={}){
  const order=await getPayPalOrder(record.paypal.order_id,paypal);
  return {
    order,
    reconciliation:reconcilePayPalOrder(order,record.authorization),
  };
}

export async function captureAuthorizedPayPalOrder(record,{
  confirmCapture=false,
  paypal={},
}={}){
  if(!confirmCapture) throw new Error("explicit_capture_confirmation_required");
  const before=await reconcileAuthorizedPayPalOrder(record,{paypal});
  if(!before.reconciliation.ok) throw new Error("pre_capture_reconciliation_failed");
  const captured=await capturePayPalOrder(record.paypal.order_id,paypal);
  const after=reconcilePayPalOrder(captured,record.authorization,{capture:true});
  if(!after.ok) throw new Error("post_capture_reconciliation_failed:"+after.errors.join(","));
  const completed=String(captured.status||"").toUpperCase()==="COMPLETED";
  const body={
    schema:"evercraft.competition.checkout-black-box.receipt.v1",
    state:completed?"payment_verified":"capture_returned_not_completed",
    proposal_id:record.proposal.proposal_id,
    authorization_id:record.authorization.authorization_id,
    paypal_order_id:captured.id,
    paypal_status:captured.status,
    reconciliation:after,
    payment_verified:completed,
    human_capture_confirmed:true,
    observed_at:new Date().toISOString(),
  };
  return {...body,receipt_hash:hash(body)};
}
