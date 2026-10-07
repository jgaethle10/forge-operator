import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  authorizeProposal,
  captureAuthorizedPayPalOrder,
  createAuthorizedPayPalOrder,
  interpretPurchaseIntent,
  reconcileAuthorizedPayPalOrder,
} from "./agent.mjs";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(__dirname,"public","index.html"),"utf8");
const port=Math.max(1,Math.min(65535,Number(process.env.PORT||8080)));
const signingKey=process.env.CHECKOUT_BLACK_BOX_SIGNING_KEY||"";
const proposals=new Map();
const records=new Map();

function send(res,status,body,type="application/json; charset=utf-8"){
  res.statusCode=status;
  res.setHeader("content-type",type);
  res.setHeader("cache-control","no-store");
  res.setHeader("x-content-type-options","nosniff");
  res.setHeader("referrer-policy","no-referrer");
  res.end(type.startsWith("application/json")?JSON.stringify(body,null,2):body);
}
async function readJson(req){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>64*1024)throw new Error("request_too_large");chunks.push(chunk);}
  const raw=Buffer.concat(chunks).toString("utf8"); return raw?JSON.parse(raw):{};
}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||"/","http://localhost");
  if(req.method==="GET"&&(url.pathname==="/"||url.pathname==="/index.html")){send(res,200,html,"text/html; charset=utf-8");return;}
  if(req.method==="GET"&&url.pathname==="/health"){
    send(res,200,{ok:true,product:"Checkout Black Box",ai_configured:Boolean(process.env.AI_API_KEY||process.env.OPENAI_API_KEY),paypal_sandbox_configured:Boolean(process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET),signing_key_configured:Boolean(signingKey),silent_purchase_allowed:false});
    return;
  }
  if(req.method==="POST"&&url.pathname==="/api/propose"){
    try{
      const body=await readJson(req);
      const proposal=await interpretPurchaseIntent(body);
      proposals.set(proposal.proposal_id,proposal);
      send(res,200,{ok:true,proposal});
    }catch(error){send(res,400,{ok:false,error:String(error?.message||"proposal_failed").slice(0,300)});}
    return;
  }
  if(req.method==="POST"&&url.pathname==="/api/authorize"){
    try{
      const body=await readJson(req);
      const proposal=proposals.get(String(body.proposal_id||""));
      if(!proposal) throw new Error("proposal_not_found");
      const authorization=authorizeProposal(proposal,{confirmed:body.confirmed===true,signingKey});
      const record=await createAuthorizedPayPalOrder({proposal,authorization},{signingKey});
      records.set(record.paypal.order_id,record);
      send(res,201,{ok:true,record});
    }catch(error){send(res,400,{ok:false,error:String(error?.message||"authorization_failed").slice(0,300)});}
    return;
  }
  if(req.method==="GET"&&url.pathname.startsWith("/api/reconcile/")){
    try{
      const orderId=decodeURIComponent(url.pathname.split("/").pop()||"");
      const record=records.get(orderId); if(!record) throw new Error("order_not_found");
      const result=await reconcileAuthorizedPayPalOrder(record);
      send(res,result.reconciliation.ok?200:409,{ok:result.reconciliation.ok,...result});
    }catch(error){send(res,400,{ok:false,error:String(error?.message||"reconcile_failed").slice(0,300)});}
    return;
  }
  if(req.method==="POST"&&url.pathname.startsWith("/api/capture/")){
    try{
      const orderId=decodeURIComponent(url.pathname.split("/").pop()||"");
      const record=records.get(orderId); if(!record) throw new Error("order_not_found");
      const body=await readJson(req);
      const receipt=await captureAuthorizedPayPalOrder(record,{confirmCapture:body.confirm_capture===true});
      send(res,receipt.payment_verified?200:409,{ok:receipt.payment_verified,receipt});
    }catch(error){send(res,400,{ok:false,error:String(error?.message||"capture_failed").slice(0,300)});}
    return;
  }
  send(res,404,{ok:false,error:"not_found"});
});
server.listen(port,"0.0.0.0",()=>console.log("Checkout Black Box listening on port "+port));
