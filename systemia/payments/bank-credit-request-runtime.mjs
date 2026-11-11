/**
 * Evercraft Payments | first-party ACH CREDIT payment-request pages.
 *
 * The buyer pushes funds from their own bank. No ACH debit, payment API,
 * charge, automatic paid status, or public account data in the repository.
 * Banking instructions and signing keys must come from a private operator vault.
 * This is an owned invoice/payment-request frontend, NOT a bank or clearinghouse.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {inspectBankCreditMatches} from './bank-credit-reconciliation.mjs';

const SCHEMA='evercraft.payments.bank-credit-request.v1';
const ORIGINS=new Set(['fabric.systemiacommandcenters.com','pay.systemiacommandcenters.com']);
const OFFER_KEY=/^[a-z0-9][a-z0-9._:-]{2,119}$/i;
const REQUEST_KEY=/^[a-zA-Z0-9._:-]{16,128}$/;
const REF_RE=/^EC-[A-F0-9]{12}$/;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const eq=(a,b)=>{
 const A=Buffer.from(String(a??'')),B=Buffer.from(String(b??''));
 return A.length===B.length&&crypto.timingSafeEqual(A,B);
};
const now=()=>Date.now();
function approvedOrigin(value){
 let u;
 try{u=new URL(value)}catch{throw Error('owned_public_https_origin_required')}
 if(u.protocol!=='https:'||!ORIGINS.has(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/')
   throw Error('owned_public_https_origin_required');
 return u.origin;
}
function abaRoutingValid(value){
 const s=String(value??'');
 if(!/^\d{9}$/.test(s))return false;
 const w=[3,7,1,3,7,1,3,7,1];
 return [...s].reduce((a,c,i)=>a+Number(c)*w[i],0)%10===0;
}
export function validBankCreditPayee(p){
 return Boolean(p?.receiving_account_confirmed===true&&
   /^[\w .,()&'-]{3,120}$/.test(String(p.legal_name||''))&&
   /^[\w .,&'-]{2,120}$/.test(String(p.bank_name||''))&&
   abaRoutingValid(p.routing_number)&&
   /^\d{4,17}$/.test(String(p.account_number||''))&&
   p.account_type==='business_checking'&&
   typeof p.bank_confirmation_ref==='string'&&p.bank_confirmation_ref.length>=8);
}
function cleanOffer(offer){
 if(!offer||!OFFER_KEY.test(offer.offer_key)||!OFFER_KEY.test(offer.product_key)||
   typeof offer.name!=='string'||offer.name.trim().length<4||offer.name.length>160||
   !Number.isSafeInteger(offer.amount_cents)||offer.amount_cents<100||
   offer.amount_cents>10_000_000||offer.currency!=='usd'||
   offer.owner_approved!==true)throw Error('approved_offer_required');
 return {offer_key:offer.offer_key,product_key:offer.product_key,
   name:offer.name,amount_cents:offer.amount_cents,currency:'usd'};
}
function guards(){
 return {
  'cache-control':'no-store, no-cache, private',
  'referrer-policy':'no-referrer',
  'x-content-type-options':'nosniff',
  'x-robots-tag':'noindex, nofollow, noarchive',
  'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
 };
}
function json(res,code,data){
 res.writeHead(code,{...guards(),'content-type':'application/json; charset=utf-8'});
 res.end(JSON.stringify(data));
}
function html(res,code,body){
 res.writeHead(code,{...guards(),'content-type':'text/html; charset=utf-8'});
 res.end(body);
}
function hashFor(key){return sha('evercraft.bank-credit-request.v1:'+key)}
function requestId(key){return 'bpr_'+hashFor(key).slice(0,32)}
function transferReference(key){return 'EC-'+hashFor(key).slice(0,12).toUpperCase()}
function signature(secret,id){
 return crypto.createHmac('sha256',secret).update('bank-credit-link-v1:'+id).digest('base64url');
}
function orderFile(root,id){return path.join(root,id+'.json')}
function receivingAccountKey(signingKey,payee){
 return 'recv_'+crypto.createHmac('sha256',signingKey)
  .update('bank-receiver-v1:'+payee.routing_number+':'+payee.account_number+':'+payee.account_type)
  .digest('hex').slice(0,48);
}
async function readJson(req){
 let parts=[],size=0;
 for await (const c of req){size+=c.length;if(size>8192)throw Error('request_too_large');parts.push(c)}
 try{const o=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!o||typeof o!=='object'||Array.isArray(o))throw Error();return o}
 catch{throw Error('request_json_invalid')}
}
function safePublic(order,origin,secret){
 return {
  ok:true,schema:SCHEMA,request_id:order.request_id,
  offer_key:order.offer_key,amount_cents:order.amount_cents,currency:'usd',
  payment_request_url:origin+'/pay/bank/'+order.request_id+'.'+signature(secret,order.request_id),
  reference:order.reference,expires_at:order.expires_at,
  method:'buyer_initiated_ach_credit',state:'awaiting_bank_transfer',
  paid_verified:false,bank_deposit_verified:false,fulfillment_release:false,
  next_step:'Buyer uses their own bank to initiate the transfer; merchant independently reconciles bank credit before delivery.',
 };
}
function paymentPage(order,payee){
 const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(order.amount_cents/100);
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<meta name="referrer" content="no-referrer"><title>Evercraft Payments | Bank transfer request</title>'+
 '<style>body{font-family:system-ui;background:#f7f9fc;color:#142035;margin:0;padding:24px}main{max-width:650px;margin:35px auto;padding:28px;background:#fff;border:1px solid #d8e0eb;border-radius:18px}h1{font-size:28px}dt{color:#546578;margin-top:15px}dd{font-weight:650;margin:4px 0 0;overflow-wrap:anywhere}.warning{padding:14px;background:#f1f5fa;border-radius:10px;margin:20px 0}small{color:#546578}</style></head><body><main>'+
 '<small>EVERCRAFT PAYMENTS · BANK CREDIT REQUEST</small><h1>'+esc(order.offer_name)+'</h1>'+
 '<p><strong>Amount to send: '+esc(money)+'</strong></p><p>Use your own bank or business banking app to send an <strong>ACH credit</strong> to the business below. This page does not take money or access your bank account.</p>'+
 '<dl><dt>Recipient business</dt><dd>'+esc(payee.legal_name)+'</dd>'+
 '<dt>Receiving bank</dt><dd>'+esc(payee.bank_name)+'</dd>'+
 '<dt>ACH routing number</dt><dd>'+esc(payee.routing_number)+'</dd>'+
 '<dt>Receiving account number</dt><dd>'+esc(payee.account_number)+'</dd>'+
 '<dt>Account type</dt><dd>Business checking</dd>'+
 '<dt>Invoice / reference (include in transfer memo)</dt><dd>'+esc(order.reference)+'</dd></dl>'+
 '<div class="warning"><strong>Payment has not been received or verified.</strong> The bank transfer must be initiated separately in your bank, and Evercraft must confirm the matching deposit before work is released. Confirm the recipient through a trusted channel before transferring money. Do not send twice if you are uncertain.</div>'+
 '<small>Expires: '+esc(new Date(order.expires_at).toISOString())+'. For assistance, use your existing Evercraft contact channel. No card details or bank login are collected here.</small></main></body></html>';
}
export async function startBankCreditRequestRuntime({
 host='127.0.0.1',port=0,storeDir,
 publicOrigin='https://fabric.systemiacommandcenters.com',
 operatorToken,linkSigningKey,approvedOffers=[],bankPayee=null,
 clock=now,
}={}){
 if(host!=='127.0.0.1'&&host!=='::1')throw Error('bank_credit_runtime_loopback_only');
 if(!storeDir||typeof storeDir!=='string')throw Error('bank_credit_private_store_required');
 if(typeof operatorToken!=='string'||Buffer.byteLength(operatorToken)<32||
   typeof linkSigningKey!=='string'||Buffer.byteLength(linkSigningKey)<32)throw Error('private_operator_keys_required');
 const origin=approvedOrigin(publicOrigin);
 const offers=new Map();
 for(const raw of approvedOffers){
  const offer=cleanOffer(raw);
  if(offers.has(offer.offer_key))throw Error('duplicate_approved_offer');
  offers.set(offer.offer_key,offer);
 }
 const payeeReady=validBankCreditPayee(bankPayee);
 const accountKey=payeeReady?receivingAccountKey(linkSigningKey,bankPayee):null;
 const dir=path.resolve(storeDir);
 await fs.mkdir(dir,{recursive:true,mode:0o700});
 // Only the application may create private order records.
 await fs.chmod(dir,0o700);
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url||'/','http://local.invalid');
   if(req.method==='GET'&&url.pathname==='/health'){
    return json(res,200,{ok:true,schema:'evercraft.bank-credit-runtime-health.v1',
     owned_origin:true,bank_credit_configured:payeeReady,
     approved_offer_count:offers.size,live_payment_verified:false,
     automatic_bank_reconciliation:false,fulfillment_release:false});
   }
   const m=url.pathname.match(/^\/pay\/bank\/(bpr_[a-f0-9]{32})\.([A-Za-z0-9_-]{43})$/);
   if(req.method==='GET'&&m){
    const [_,id,mac]=m;
    if(!eq(signature(linkSigningKey,id),mac))return json(res,404,{ok:false,error:'request_not_found'});
    let order;
    try{order=JSON.parse(await fs.readFile(orderFile(dir,id),'utf8'))}
    catch{return json(res,404,{ok:false,error:'request_not_found'})}
    if(order.schema!==SCHEMA||order.request_id!==id||
      order.state!=='awaiting_bank_transfer'||clock()>Date.parse(order.expires_at)||
      !payeeReady||order.receiving_account_key!==accountKey||!offers.has(order.offer_key))
      return json(res,410,{ok:false,error:'request_unavailable_or_expired'});
    const allowed=offers.get(order.offer_key);
    if(order.amount_cents!==allowed.amount_cents||order.offer_name!==allowed.name||
      order.product_key!==allowed.product_key)
      return json(res,410,{ok:false,error:'offer_terms_changed'});
    return html(res,200,paymentPage(order,bankPayee));
   }
   // Internal, read-only reconciliation diagnostic. Supplied bank observations
   // are NOT authenticated by this endpoint and can never set paid=true.
   if(req.method==='POST'&&url.pathname==='/v1/operator/bank-credit/reconcile'){
     const auth=String(req.headers.authorization||'');
     if(!auth.startsWith('Bearer ')||!eq(auth.slice(7),operatorToken))
       return json(res,401,{ok:false,error:'operator_authority_required'});
     if(!payeeReady)return json(res,503,{ok:false,error:'bank_receiving_account_not_confirmed'});
     const b=await readJson(req);
     const ids=b.request_ids;
     if(!Array.isArray(ids)||ids.length<1||ids.length>25||
       new Set(ids).size!==ids.length||
       ids.some(id=>typeof id!=='string'||!/^bpr_[a-f0-9]{32}$/.test(id))||
       !Array.isArray(b.observations)||b.observations.length>25)
       return json(res,422,{ok:false,error:'reconciliation_request_invalid'});
     const orders=[];
     for(const id of ids){
       let order;
       try{order=JSON.parse(await fs.readFile(orderFile(dir,id),'utf8'))}
       catch{return json(res,404,{ok:false,error:'payment_request_not_found'})}
       if(order.receiving_account_key!==accountKey)
         return json(res,409,{ok:false,error:'receiving_bank_account_changed'});
       orders.push(order);
     }
     try{
       const report=inspectBankCreditMatches({orders,observations:b.observations});
       return json(res,200,{ok:true,...report});
     }catch{
       return json(res,422,{ok:false,error:'bank_reconciliation_evidence_invalid',
         paid_verified:false,fulfillment_release:false});
     }
   }
   if(req.method==='POST'&&url.pathname==='/v1/operator/bank-requests'){
    const auth=String(req.headers.authorization||'');
    if(!auth.startsWith('Bearer ')||!eq(auth.slice(7),operatorToken))
      return json(res,401,{ok:false,error:'operator_authority_required'});
    if(!payeeReady)return json(res,503,{ok:false,error:'bank_receiving_account_not_confirmed'});
    const b=await readJson(req);
    if(b.scope_approved!==true||b.capacity_approved!==true||b.buyer_confirmed!==true)
      return json(res,409,{ok:false,error:'scope_capacity_and_buyer_confirmation_required'});
    const key=String(b.idempotency_key??'');
    if(!REQUEST_KEY.test(key))return json(res,422,{ok:false,error:'idempotency_key_invalid'});
    const offer=offers.get(String(b.offer_key||''));
    if(!offer)return json(res,404,{ok:false,error:'offer_not_approved_for_bank_credit'});
    if(Object.hasOwn(b,'amount_cents')&&b.amount_cents!==offer.amount_cents)
      return json(res,409,{ok:false,error:'client_amount_override_rejected'});
    const id=requestId(key);
    const created=new Date(clock());
    const expires=new Date(created.getTime()+7*24*3600*1000);
    const order={
      schema:SCHEMA,request_id:id,product_key:offer.product_key,offer_key:offer.offer_key,
      offer_name:offer.name,amount_cents:offer.amount_cents,currency:'usd',
      state:'awaiting_bank_transfer',reference:transferReference(key),
      receiving_account_key:accountKey,
      created_at:created.toISOString(),expires_at:expires.toISOString(),
      idempotency_fingerprint:sha(offer.offer_key+':'+offer.amount_cents),
      payment_verified:false,fulfillment_release:false,
    };
    const file=orderFile(dir,id);
    try{await fs.writeFile(file,JSON.stringify(order)+'\n',{encoding:'utf8',flag:'wx',mode:0o600})}
    catch(e){
      if(e?.code!=='EEXIST')throw e;
      const previous=JSON.parse(await fs.readFile(file,'utf8'));
      if(previous.idempotency_fingerprint!==order.idempotency_fingerprint||
         previous.offer_key!==order.offer_key||
         previous.receiving_account_key!==accountKey)
        return json(res,409,{ok:false,error:'idempotency_conflict'});
      if(clock()>Date.parse(previous.expires_at))
        return json(res,410,{ok:false,error:'bank_request_expired'});
      return json(res,200,{...safePublic(previous,origin,linkSigningKey),replayed:true});
    }
    return json(res,201,{...safePublic(order,origin,linkSigningKey),replayed:false});
   }
   return json(res,404,{ok:false,error:'not_found'});
  }catch(error){
   const expected=['request_too_large','request_json_invalid'].includes(error?.message);
   return json(res,expected?400:500,{ok:false,error:expected?error.message:'internal_error'});
  }
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve)});
 return {url:'http://'+host+':'+server.address().port,
   health:()=>({bank_credit_configured:payeeReady,approved_offer_count:offers.size}),
   close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
