import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {getEvercraftPaymentOffer,listEvercraftPaymentOffers} from './offer-registry.mjs';
import {resolveStripeSettlementSecret,stripeSettlementSecretStatus} from './stripe-secret-boundary.mjs';
import {createStripeCheckoutSession} from './stripe-adapter.mjs';

const clean=(value)=>String(value??'').trim();

function safeEqual(a,b){
  const aa=Buffer.from(String(a||''));
  const bb=Buffer.from(String(b||''));
  return aa.length===bb.length&&timingSafeEqual(aa,bb);
}

function hash(value){
  return createHash('sha256').update(String(value)).digest('hex');
}

function json(res,status,body){
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
  });
  res.end(JSON.stringify(body));
}

async function readJson(req,limit=32768){
  const chunks=[];
  let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>limit) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString('utf8').trim();
  if(!raw) return {};
  try{return JSON.parse(raw);}catch{throw new Error('request_body_invalid_json');}
}

function bearer(req){
  const header=String(req.headers.authorization||'');
  return header.startsWith('Bearer ')?header.slice(7).trim():'';
}

function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
  fs.renameSync(tmp,file);
}

function orderFile(stateDir,idempotencyKey){
  return path.join(stateDir,'orders',hash(idempotencyKey)+'.json');
}

function orderKeyFor(offer,idempotencyKey){
  return 'EC-'+hash(offer.purchase_key+':'+idempotencyKey).slice(0,20).toUpperCase();
}

function loadOrder(stateDir,idempotencyKey){
  const file=orderFile(stateDir,idempotencyKey);
  if(!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file,'utf8'));
}

function saveOrder(stateDir,idempotencyKey,order){
  atomicJson(orderFile(stateDir,idempotencyKey),order);
}

function publicOrder(order){
  return {
    ok:order.checkout_ready===true,
    schema:'evercraft.payments.purchase-intent-response.v1',
    authority:'Evercraft Payments',
    provider_boundary:'Raven Nexus',
    settlement_adapter:order.settlement_adapter,
    order_key:order.order_key,
    purchase_key:order.purchase_key,
    product_key:order.product_key,
    amount_cents:order.amount_cents,
    currency:order.currency,
    checkout_ready:order.checkout_ready===true,
    checkout_url:order.checkout_url||null,
    payment_state:order.payment_state||'unpaid',
    fulfillment_release:false,
    gate_key:'authoritative_settlement_receipt_required',
    duplicate_prevented:order.replayed===true,
  };
}

export async function startRavenPaymentRuntime({
  host='127.0.0.1',
  port=0,
  stateDir,
  controlToken,
  credentialStateDir='',
  publicOrigin='https://fabric.systemiacommandcenters.com',
  env=process.env,
  settlementExecutor=null,
  fetchImpl=fetch,
}={}){
  if(!['127.0.0.1','localhost','::1'].includes(host)){
    throw new Error('raven_payment_runtime_must_bind_loopback');
  }
  const token=clean(controlToken);
  if(Buffer.byteLength(token,'utf8')<32) throw new Error('raven_payment_control_token_too_short');
  const resolvedState=path.resolve(clean(stateDir)||'');
  if(!clean(stateDir)) throw new Error('raven_payment_state_dir_required');
  fs.mkdirSync(path.join(resolvedState,'orders'),{recursive:true,mode:0o700});

  let origin;
  try{origin=new URL(clean(publicOrigin));}catch{throw new Error('raven_payment_public_origin_invalid');}
  if(origin.protocol!=='https:') throw new Error('raven_payment_public_origin_requires_https');
  const canonicalOrigin=origin.origin;

  const secretEnv={
    ...env,
    EVERCRAFT_CREDENTIAL_STATE_DIR:clean(credentialStateDir)||clean(env?.EVERCRAFT_CREDENTIAL_STATE_DIR),
  };
  const resolveStripeSecret=()=>resolveStripeSettlementSecret(secretEnv);
  const secretStatus=()=>stripeSettlementSecretStatus(resolveStripeSecret());

  const execute=typeof settlementExecutor==='function'
    ? settlementExecutor
    : async({offer,orderKey,idempotencyKey})=>{
        const stripeSecret=resolveStripeSecret();
        if(!stripeSecret) throw new Error('stripe_adapter_not_configured');
        return createStripeCheckoutSession({
          secret:stripeSecret,
          offer,
          orderKey,
          idempotencyKey,
          successUrl:canonicalOrigin+'/offers',
          cancelUrl:canonicalOrigin+'/offers',
          fetchImpl,
        });
      };

  function health(){
    const stripe=secretStatus();
    return {
      ok:true,
      service:'evercraft-raven-payments',
      schema:'evercraft.raven.payment-runtime-health.v1',
      loopback_only:true,
      canonical_order_owner:'evercraft_payments',
      provider_boundary:'raven_nexus',
      settlement_adapter:'stripe',
      settlement_adapter_configured:stripe.configured||typeof settlementExecutor==='function',
      provider_secret_boundary:'raven_nexus',
      provider_secret_values_exposed:false,
      direct_provider_checkout_allowed:false,
      base44_required:false,
      offer_count:listEvercraftPaymentOffers().length,
      persistent_order_ledger:true,
      payment_verification_required_before_fulfillment:true,
    };
  }

  function authorized(req){
    return safeEqual(bearer(req),token);
  }

  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url||'/','http://localhost');
    if(req.method==='GET'&&url.pathname==='/health'){
      return json(res,200,health());
    }

    if(!authorized(req)){
      return json(res,401,{
        ok:false,
        error:'raven_payment_authority_required',
        checkout_ready:false,
        fulfillment_release:false,
      });
    }

    if(req.method==='POST'&&url.pathname==='/v1/purchase-intents'){
      let body;
      try{body=await readJson(req);}catch(error){
        return json(res,400,{ok:false,error:error.message,checkout_ready:false,fulfillment_release:false});
      }
      const confirmed=body?.user_confirmed===true;
      if(!confirmed){
        return json(res,409,{
          ok:false,
          error:'explicit_user_confirmation_required',
          checkout_ready:false,
          fulfillment_release:false,
        });
      }
      const purchaseKey=clean(body?.capability_key);
      const offer=getEvercraftPaymentOffer(purchaseKey);
      if(!offer){
        return json(res,404,{
          ok:false,
          error:'purchase_key_not_authorized',
          checkout_ready:false,
          fulfillment_release:false,
        });
      }
      const idempotencyKey=clean(body?.idempotency_key);
      if(!/^[A-Za-z0-9._:-]{8,120}$/.test(idempotencyKey)){
        return json(res,400,{
          ok:false,
          error:'idempotency_key_invalid',
          checkout_ready:false,
          fulfillment_release:false,
        });
      }

      let order=loadOrder(resolvedState,idempotencyKey);
      if(order&&order.purchase_key!==offer.purchase_key){
        return json(res,409,{
          ok:false,
          error:'idempotency_key_offer_conflict',
          order_key:order.order_key,
          checkout_ready:false,
          fulfillment_release:false,
        });
      }
      if(order?.checkout_ready===true&&order?.checkout_url){
        order={...order,replayed:true,last_seen_at:new Date().toISOString()};
        saveOrder(resolvedState,idempotencyKey,order);
        return json(res,200,publicOrder(order));
      }

      const now=new Date().toISOString();
      order=order||{
        schema:'evercraft.payments.order.v1',
        order_key:orderKeyFor(offer,idempotencyKey),
        purchase_key:offer.purchase_key,
        product_key:offer.product_key,
        offer_name:offer.offer_name,
        amount_cents:offer.amount_cents,
        currency:offer.currency,
        state:'intent_accepted',
        payment_state:'unpaid',
        checkout_ready:false,
        checkout_url:null,
        fulfillment_release:false,
        settlement_adapter:'stripe',
        provider_boundary:'raven_nexus',
        customer_ref:clean(body?.customer_ref).slice(0,200)||null,
        idempotency_hash:'sha256:'+hash(idempotencyKey),
        created_at:now,
        updated_at:now,
        replayed:false,
      };
      saveOrder(resolvedState,idempotencyKey,order);

      try{
        const settlement=await execute({
          offer,
          orderKey:order.order_key,
          idempotencyKey,
          customerRef:order.customer_ref,
        });
        order={
          ...order,
          state:'checkout_ready',
          payment_state:clean(settlement?.payment_state)||'unpaid',
          checkout_ready:true,
          checkout_url:String(settlement?.checkout_url||''),
          settlement_adapter:clean(settlement?.adapter)||'stripe',
          provider_checkout_ref:clean(settlement?.checkout_session_id)||null,
          fulfillment_release:false,
          updated_at:new Date().toISOString(),
          replayed:false,
        };
        let checkout;
        try{checkout=new URL(order.checkout_url);}catch{throw new Error('settlement_checkout_url_invalid');}
        if(checkout.protocol!=='https:') throw new Error('settlement_checkout_url_requires_https');
        saveOrder(resolvedState,idempotencyKey,order);
        return json(res,200,publicOrder(order));
      }catch(error){
        order={
          ...order,
          state:'settlement_unavailable',
          checkout_ready:false,
          checkout_url:null,
          payment_state:'unpaid',
          fulfillment_release:false,
          last_error:clean(error?.message)||'settlement_unavailable',
          updated_at:new Date().toISOString(),
        };
        saveOrder(resolvedState,idempotencyKey,order);
        return json(res,503,{
          ok:false,
          error:order.last_error,
          authority:'Evercraft Payments',
          provider_boundary:'Raven Nexus',
          order_key:order.order_key,
          amount_cents:order.amount_cents,
          currency:order.currency,
          checkout_ready:false,
          payment_state:'unpaid',
          fulfillment_release:false,
          gate_key:'authoritative_settlement_receipt_required',
        });
      }
    }

    return json(res,404,{ok:false,error:'not_found',checkout_ready:false,fulfillment_release:false});
  });

  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,host,resolve);
  });
  const address=server.address();
  const actualPort=typeof address==='object'&&address?address.port:port;
  const url='http://'+host+':'+actualPort;
  return {
    schema:'evercraft.raven.payment-runtime.v1',
    url,
    health,
    close:()=>new Promise((resolve,reject)=>server.close((error)=>error?reject(error):resolve())),
  };
}

function readToken(file){
  const resolved=path.resolve(clean(file)||'');
  if(!clean(file)||!fs.existsSync(resolved)) throw new Error('raven_payment_token_file_required');
  const stat=fs.statSync(resolved);
  if(!stat.isFile()) throw new Error('raven_payment_token_path_not_file');
  if((stat.mode&0o077)!==0) throw new Error('raven_payment_token_file_permissions_too_open');
  const token=fs.readFileSync(resolved,'utf8').trim();
  if(Buffer.byteLength(token,'utf8')<32) throw new Error('raven_payment_control_token_too_short');
  return token;
}

const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  const runtime=await startRavenPaymentRuntime({
    host:process.env.EVERCRAFT_RAVEN_PAYMENTS_HOST||'127.0.0.1',
    port:Number(process.env.EVERCRAFT_RAVEN_PAYMENTS_PORT||8791),
    stateDir:process.env.EVERCRAFT_PAYMENT_STATE_DIR||'/var/lib/evercraft/payments',
    controlToken:readToken(process.env.EVERCRAFT_RAVEN_PAYMENTS_TOKEN_FILE||''),
    credentialStateDir:process.env.EVERCRAFT_CREDENTIAL_STATE_DIR||'/var/lib/evercraft/home/credentials',
    publicOrigin:process.env.EVERCRAFT_PAYMENT_PUBLIC_ORIGIN||'https://fabric.systemiacommandcenters.com',
  });
  process.stdout.write(JSON.stringify({ok:true,url:runtime.url,...runtime.health()},null,2)+'\n');
  const shutdown=async()=>{await runtime.close();process.exit(0);};
  process.on('SIGINT',shutdown);
  process.on('SIGTERM',shutdown);
}
