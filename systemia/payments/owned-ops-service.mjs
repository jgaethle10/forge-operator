/**
 * Evercraft Payments: native exact-offer checkout operations (candidate, not deployed).
 * Canonical order truth stays here; Stripe is a replaceable settlement adapter.
 * Run on loopback behind an authenticated owned service boundary. No Base44 calls.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PUBLIC_PAYMENT_OFFERS} from '../mcp/public-payment-offers.mjs';

const PUBLIC_ORIGIN='https://fabric.systemiacommandcenters.com';
const ORDER_PATTERN=/^buyer-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SESSION_PATTERN=/^cs_(test|live)_[A-Za-z0-9]+$/;
const allowedCheckout=(value)=>{
  try{
    const u=new URL(value);
    return u.protocol==='https:' && !u.username && !u.password &&
      (u.hostname==='checkout.stripe.com'||u.hostname==='buy.stripe.com');
  }catch{return false;}
};
const sameSecret=(actual,expected)=>{
  if(!expected || !actual)return false;
  const a=crypto.createHash('sha256').update(actual).digest();
  const b=crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a,b);
};
const fail=(status,error)=>({status,body:{ok:false,error,checkout_ready:false,fulfillment_release:false}});

export function exactNativeOffer(offerKey){
  const entry=Object.entries(PUBLIC_PAYMENT_OFFERS).find(([_,offer])=>offer.offer_key===offerKey);
  if(!entry)return null;
  const [slug,offer]=entry;
  if(offer.native_order_enabled===false||offer.requires_scope_approval===true)return null;
  if(!Number.isSafeInteger(offer.amount_cents)||offer.amount_cents<=0||offer.currency!=='usd')return null;
  return {slug,...offer};
}

// Stripe API through HTTPS, never expose key or response errors to buyer.
export function stripeAdapter({secretKey,fetchImpl=fetch}={}){
  if(!/^sk_(test|live)_[A-Za-z0-9]+$/.test(secretKey||''))throw Error('stripe_secret_key_required');
  const live=secretKey.startsWith('sk_live_');
  async function request(endpoint,{form,idempotencyKey}={}){
    const headers={authorization:'Bearer '+secretKey,accept:'application/json'};
    const options={method:form?'POST':'GET',headers,redirect:'error',signal:AbortSignal.timeout(15000)};
    if(form){
      headers['content-type']='application/x-www-form-urlencoded';
      headers['Idempotency-Key']=idempotencyKey;
      options.body=new URLSearchParams(form).toString();
    }
    const res=await fetchImpl('https://api.stripe.com'+endpoint,options);
    if(!res.ok)throw Error('stripe_upstream_http_'+res.status);
    return res.json();
  }
  return {
    live,
    async create({orderKey,offer,email}){
      const returnParams=new URLSearchParams({
        payment:'processing',offer_key:offer.offer_key,evercraft_order_key:orderKey,
      });
      const success=PUBLIC_ORIGIN+'/offers/'+offer.slug+'?'+returnParams+'&stripe_session_id={CHECKOUT_SESSION_ID}';
      const cancel=PUBLIC_ORIGIN+'/offers/'+offer.slug+'?payment=cancelled';
      return request('/v1/checkout/sessions',{
        idempotencyKey:'evercraft-'+orderKey,
        form:{
          mode:'payment',customer_email:email,client_reference_id:orderKey,
          success_url:success,cancel_url:cancel,
          'line_items[0][price_data][currency]':'usd',
          'line_items[0][price_data][unit_amount]':String(offer.amount_cents),
          'line_items[0][price_data][product_data][name]':offer.title,
          'line_items[0][quantity]':'1',
          'metadata[offer_key]':offer.offer_key,
          'metadata[order_key]':orderKey,
          'payment_intent_data[metadata][offer_key]':offer.offer_key,
          'payment_intent_data[metadata][order_key]':orderKey,
        },
      });
    },
    async retrieve(sessionId){
      if(!SESSION_PATTERN.test(sessionId))throw Error('invalid_provider_session_id');
      return request('/v1/checkout/sessions/'+encodeURIComponent(sessionId));
    }
  };
}

export function openPaymentJournal(journalFile){
  fs.mkdirSync(path.dirname(journalFile),{recursive:true,mode:0o700});
  // No truncate, no silent self-healing: malformed journal must prevent service start.
  const fd=fs.openSync(journalFile,fs.constants.O_CREAT|fs.constants.O_RDWR|fs.constants.O_APPEND,0o600);
  const records=new Map();
  try{
    const lines=fs.readFileSync(journalFile,'utf8').split('\n').filter(Boolean);
    for(const line of lines){
      const event=JSON.parse(line);
      if(!ORDER_PATTERN.test(event.order_key)||!['prepared','checkout','paid'].includes(event.event))
        throw Error('invalid_payment_journal');
      const old=records.get(event.order_key)||{};
      if(old.offer_key&&old.offer_key!==event.offer_key)throw Error('payment_journal_order_collision');
      records.set(event.order_key,{...old,...event});
    }
  }catch(err){fs.closeSync(fd);throw Error('payment_journal_corrupt_fail_closed');}
  return {
    get(orderKey){return records.get(orderKey)||null;},
    append(event){
      if(!ORDER_PATTERN.test(event.order_key))throw Error('invalid_order_key');
      const old=records.get(event.order_key)||{};
      if(old.offer_key&&old.offer_key!==event.offer_key)throw Error('payment_journal_order_collision');
      const row={...event,at:new Date().toISOString()};
      fs.writeSync(fd,JSON.stringify(row)+'\n');
      fs.fsyncSync(fd);
      records.set(event.order_key,{...old,...row});
      return records.get(event.order_key);
    },
    close(){fs.closeSync(fd);}
  };
}

export function createPaymentOperations({provider,journal,allowLive=false}={}){
  if(!provider||!journal)throw Error('provider_and_journal_required');
  let tail=Promise.resolve();
  const serialize=(fn)=>{
    const next=tail.then(fn);
    tail=next.catch(()=>{});
    return next;
  };
  return async function operate(input={}){
    return serialize(async()=>{
      if(input.action==='create_checkout'){
        const offer=exactNativeOffer(input.offer_key);
        const orderKey=String(input.order_key||'');
        if(!offer)return fail(409,'exact_offer_not_released');
        if(!ORDER_PATTERN.test(orderKey))return fail(422,'invalid_order_key');
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customer_email||'')||String(input.customer_email).length>254)
          return fail(422,'valid_customer_email_required');
        if(input.return_origin!==PUBLIC_ORIGIN||
           input.success_path!=='/offers/'+offer.slug+'?payment=processing'||
           input.cancel_path!=='/offers/'+offer.slug+'?payment=cancelled')
          return fail(422,'unapproved_return_route');
        if(provider.live && !allowLive)return fail(503,'live_payments_not_authorized');
        const previous=journal.get(orderKey);
        if(previous&&previous.offer_key!==offer.offer_key)return fail(409,'order_key_conflict');
        if(previous?.event==='paid')return fail(409,'order_already_paid');
        if(previous?.checkout_url){
          if(previous.expires_at && previous.expires_at*1000<Date.now())return fail(409,'checkout_expired_new_intent_required');
          return {status:200,body:{ok:true,checkout_ready:true,order_key:orderKey,offer_key:offer.offer_key,amount_cents:offer.amount_cents,currency:'usd',checkout_url:previous.checkout_url,payment_state:'unpaid'}};
        }
        if(!previous)journal.append({event:'prepared',order_key:orderKey,offer_key:offer.offer_key,amount_cents:offer.amount_cents,currency:'usd'});
        let session;
        try{session=await provider.create({orderKey,offer,email:input.customer_email});}
        catch{return fail(503,'processor_unavailable_order_pending');}
        if(!SESSION_PATTERN.test(session?.id||'')||!allowedCheckout(session.url)||
            session.amount_total!==offer.amount_cents||session.currency!=='usd'||
            session.mode!=='payment'||session.client_reference_id!==orderKey||
            session.metadata?.offer_key!==offer.offer_key||
            session.metadata?.order_key!==orderKey||session.livemode!==provider.live)
          return fail(503,'processor_checkout_mismatch');
        journal.append({event:'checkout',order_key:orderKey,offer_key:offer.offer_key,
          checkout_url:session.url,checkout_session_id:session.id,expires_at:session.expires_at||null});
        return {status:200,body:{ok:true,checkout_ready:true,order_key:orderKey,offer_key:offer.offer_key,
          amount_cents:offer.amount_cents,currency:'usd',checkout_url:session.url,payment_state:'unpaid'}};
      }
      if(input.action==='verify_checkout'){
        const orderKey=String(input.order_key||'');
        const sessionId=String(input.provider_session_id||'');
        const prior=journal.get(orderKey);
        if(!ORDER_PATTERN.test(orderKey)||!SESSION_PATTERN.test(sessionId)||!prior||
           prior.offer_key!==input.offer_key||prior.checkout_session_id!==sessionId)
          return fail(400,'order_session_mismatch');
        const offer=exactNativeOffer(prior.offer_key);
        if(!offer)return fail(409,'offer_not_released');
        let session;
        try{session=await provider.retrieve(sessionId);}
        catch{return fail(503,'processor_verification_unavailable');}
        const valid=session?.id===sessionId && session.client_reference_id===orderKey &&
          session.metadata?.offer_key===offer.offer_key && session.metadata?.order_key===orderKey &&
          session.amount_total===offer.amount_cents && session.currency==='usd' &&
          session.livemode===provider.live && session.mode==='payment' &&
          session.status==='complete' && session.payment_status==='paid' &&
          Boolean(session.payment_intent);
        if(!valid)return {status:200,body:{ok:true,payment_confirmed:false,order_key:orderKey,offer_key:offer.offer_key,fulfillment_state:'held'}};
        if(prior.event!=='paid')journal.append({event:'paid',order_key:orderKey,offer_key:offer.offer_key,
          receipt_key:'stripe:'+sessionId,payment_intent_id:String(session.payment_intent)});
        return {status:200,body:{ok:true,payment_confirmed:true,synthetic:false,order_key:orderKey,
          offer_key:offer.offer_key,receipt_key:'stripe:'+sessionId,
          fulfillment_state:'awaiting_human_review',fulfillment_released:false}};
      }
      return fail(400,'unsupported_action');
    });
  };
}

export async function startOwnedPaymentServer({host='127.0.0.1',port=0,authToken,operate,providerLive=false}={}){
  if(typeof authToken!=='string'||authToken.length<32||typeof operate!=='function')
    throw Error('private_service_token_and_operations_required');
  const server=http.createServer(async(req,res)=>{
    const write=(status,body)=>{
      res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});
      res.end(JSON.stringify(body));
    };
    if(req.method==='GET'&&req.url==='/health'){
      return write(200,{schema:'evercraft.payments.owned-ops-health.v1',commerce_layer:'evercraft_payments',
        provider_boundary:'raven_nexus',processor:'stripe',processor_livemode:providerLive,
        payment_authority:'private_only',commercial_release_attested:false});
    }
    if(req.url!=='/api/payments/ops'||req.method!=='POST')return write(404,{ok:false,error:'not_found'});
    const authorization=String(req.headers.authorization||'');
    if(!authorization.startsWith('Bearer ')||!sameSecret(authorization.slice(7),authToken))
      return write(401,{ok:false,error:'unauthorized'});
    let raw='';
    try{
      for await(const chunk of req){
        raw+=chunk.toString('utf8');
        if(Buffer.byteLength(raw)>8192)return write(413,{ok:false,error:'payload_too_large'});
      }
      const payload=JSON.parse(raw);
      const result=await operate(payload);
      write(result.status,result.body);
    }catch{write(400,{ok:false,error:'request_failed'});}
  });
  await new Promise((resolve,reject)=>server.once('error',reject).listen(port,host,resolve));
  return {url:'http://'+host+':'+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const token=process.env.EVERCRAFT_PAYMENTS_SERVICE_TOKEN||'';
  const secret=process.env.STRIPE_SECRET_KEY||'';
  const ledgerPath=process.env.EVERCRAFT_PAYMENTS_JOURNAL_PATH||
    path.join(os.homedir(),'.local/state/evercraft/payments/owned-ops.jsonl');
  try{
    const provider=stripeAdapter({secretKey:secret});
    const journal=openPaymentJournal(ledgerPath);
    const operate=createPaymentOperations({provider,journal,allowLive:process.env.EVERCRAFT_PAYMENTS_ENABLE_LIVE==='true'});
    const srv=await startOwnedPaymentServer({port:Number(process.env.EVERCRAFT_PAYMENTS_PORT||36096),
      authToken:token,operate,providerLive:provider.live});
    console.log(JSON.stringify({state:'private_only_not_released',listening:srv.url,
      processor_mode:provider.live?'live':'test',public_checkout_ready:false}));
  }catch(e){console.error('owned_payments_start_blocked:'+String(e.message).slice(0,80));process.exitCode=1;}
}
