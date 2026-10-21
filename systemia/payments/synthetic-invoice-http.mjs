#!/usr/bin/env node
/**
 * LOCAL SYNTHETIC TEST SERVER ONLY.
 * Not a payment processor, not a public service and never a live buyer API.
 * Requires temporary isolated Saban ledger and a random bearer token.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createSovereignOrder,persistSovereignOrder,readSovereignOrder,transitionSovereignOrder} from './sovereign-order-ledger.mjs';

const PREFIX='evercraft-saban-http-';
const RAILS=new Set(['cash','check','bank_transfer','zelle_business','paypal_business','venmo_business','cash_app_business']);
const ORDER=/^buyer-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OFFER='findmypart.quick_hunt_19.v1';
const PRODUCT='findmypart';
const EXPECTED_AMOUNT=1900;
function syntheticDir(dir){
  if(process.env.EVERCRAFT_PAYMENTS_TEST_ONLY!=='1')throw Error('saban_http_test_authority_missing');
  if(typeof dir!=='string'||!path.isAbsolute(dir)||path.normalize(dir)!==dir)throw Error('saban_http_tmp_path_required');
  const root=fs.realpathSync(os.tmpdir());
  if(!dir.startsWith(root+path.sep+PREFIX))throw Error('saban_http_tmp_path_required');
  const st=fs.lstatSync(dir);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)throw Error('saban_http_private_synthetic_dir_required');
}
function secureToken(token){
  if(typeof token!=='string'||!/^[0-9a-f]{64}$/.test(token))throw Error('saban_http_random_auth_token_required');
}
function allowedAuth(request,secret){
  const bearer=String(request.headers.authorization||'');
  const expected='Bearer '+secret;
  const left=Buffer.from(bearer),right=Buffer.from(expected);
  return left.length===right.length && timingSafeEqual(left,right);
}
function clientId(key){
  if(!/^[a-zA-Z0-9._:-]{8,100}$/.test(String(key||'')))throw Error('invalid_idempotency_key');
  const h=createHash('sha256').update('evercraft.synthetic.http.order.v1:'+key).digest('hex');
  return 'buyer-'+[h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20,32)].join('-');
}
function json(res,status,body){
  const payload=JSON.stringify(body);
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store','x-content-type-options':'nosniff',
    'content-length':Buffer.byteLength(payload)
  });
  res.end(payload);
}
async function bodyJson(req){
  if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))throw Error('json_content_type_required');
  let buffer='';
  for await (const part of req){
    buffer+=String(part);
    if(Buffer.byteLength(buffer)>4096)throw Error('oversized_json_body');
  }
  const value=JSON.parse(buffer||'{}');
  if(!value||Array.isArray(value)||typeof value!=='object')throw Error('json_object_required');
  return value;
}
function publicOrder(row){
  return {
    schema:'evercraft.payments.synthetic-public-order.v1',
    order_id:row.order_id,product_key:row.product_key,
    offer_key:row.offer_key,amount_cents:row.amount_cents,
    currency:row.currency,version:row.version,rail:row.rail,
    payment_state:'unpaid',collection_state:row.collection_state,
    entitlement_state:'held',fulfillment_state:'held',
    payment_verified:false,synthetic:true
  };
}
function syntheticInvoice(row){
  return {
    schema:'evercraft.payments.synthetic-invoice.v1',
    invoice_id:'synthetic-invoice-'+row.order_id,
    ...publicOrder(row),
    merchant_payment_destination:null,
    money_transmission_enabled:false,
    payment_instructions:'TEST ONLY: No payment destination; do not send funds.',
    paid_receipt:null,
  };
}
export function createSyntheticInvoiceServer({dir,token}={}){
  syntheticDir(dir);
  secureToken(token);
  return http.createServer(async(req,res)=>{
    try{
      if(req.socket.remoteAddress!=='127.0.0.1' && req.socket.remoteAddress!=='::ffff:127.0.0.1'){
        return json(res,403,{state:'loopback_only'});
      }
      if(!allowedAuth(req,token))return json(res,401,{state:'unauthorized'});
      const u=new URL(req.url,'http://127.0.0.1');
      if(u.search||u.hash)return json(res,400,{state:'no_query_parameters'});
      if(req.method==='GET'&&u.pathname==='/health'){
        return json(res,200,{state:'synthetic_loopback_ready',payments_enabled:false,live_checkout:false});
      }
      if(req.method==='POST'&&u.pathname==='/v1/orders'){
        const data=await bodyJson(req);
        if(Object.keys(data).sort().join(',')!==['customer_ref','idempotency_key','offer_key'].join(',')||
           data.offer_key!==OFFER||typeof data.customer_ref!=='string'||
           !/^[a-zA-Z0-9._:-]{3,130}$/.test(data.customer_ref)){
          return json(res,400,{state:'invalid_approved_offer_or_fields'});
        }
        const id=clientId(data.idempotency_key);
        let row,status=201;
        try{row=readSovereignOrder(id,{dir});status=200}
        catch(err){
          if(err?.code!=='ENOENT')throw err;
          const newOrder=createSovereignOrder({
            orderId:id,productKey:PRODUCT,offerKey:OFFER,
            amountCents:EXPECTED_AMOUNT,customerRef:data.customer_ref
          });
          try{persistSovereignOrder(newOrder,{dir});row=newOrder}
          catch(e){
            if(e?.code!=='EEXIST')throw e;
            row=readSovereignOrder(id,{dir});status=200;
          }
        }
        if(row.customer_ref!==data.customer_ref||row.offer_key!==data.offer_key){
          return json(res,409,{state:'idempotency_key_conflict'});
        }
        return json(res,status,{...publicOrder(row),replayed:status===200});
      }
      // Explicitly deny money-state mutations even if a future route parser
      // changes. The synthetic invoice service has no paid transition.
      if(req.method==='POST' && /^\/v1\/orders\/buyer-[0-9a-f-]{36}\/paid$/.test(u.pathname)){
        return json(res,405,{state:'money_or_unsupported_method_denied',
          payment_verified:false,fulfillment_released:false});
      }
      const match=u.pathname.match(/^\/v1\/orders\/(buyer-[0-9a-f-]{36})(?:\/(invoice|select|claim))?$/);
      if(!match||!ORDER.test(match[1]))return json(res,404,{state:'route_unavailable'});
      const id=match[1],action=match[2]||'';
      if(req.method==='GET'&&!action)return json(res,200,publicOrder(readSovereignOrder(id,{dir})));
      if(req.method==='GET'&&action==='invoice')return json(res,200,syntheticInvoice(readSovereignOrder(id,{dir})));
      if(req.method==='POST'&&action==='select'){
        const d=await bodyJson(req);
        if(Object.keys(d).sort().join(',')!==
          ['buyer_confirmed','expected_version','rail'].join(',')||
          !Number.isSafeInteger(d.expected_version)||d.buyer_confirmed!==true||
          !RAILS.has(d.rail)){
          return json(res,400,{state:'invalid_method_selection_or_consent'});
        }
        const r=transitionSovereignOrder(id,{
          expectedVersion:d.expected_version,
          action:'select_external_rail',rail:d.rail,
          merchantRailConfigured:true,buyerConfirmed:true
        },{dir});
        return json(res,200,{...r,synthetic:true,payment_destination:null});
      }
      if(req.method==='POST'&&action==='claim'){
        const d=await bodyJson(req);
        if(Object.keys(d).sort().join(',')!==
           ['claim_ref','expected_version'].join(',')||
           !Number.isSafeInteger(d.expected_version)){
          return json(res,400,{state:'invalid_claim'});
        }
        const r=transitionSovereignOrder(id,{
          expectedVersion:d.expected_version,action:'note_unverified_claim',
          claimRef:d.claim_ref
        },{dir});
        return json(res,200,{...r,synthetic:true,payment_verified:false});
      }
      return json(res,405,{state:'money_or_unsupported_method_denied',payment_verified:false});
    }catch(err){
      if(err?.code==='ENOENT')return json(res,404,{state:'synthetic_order_not_found'});
      if(err?.code==='EEXIST'||[
        'order_version_conflict','order_payment_rail_already_selected','customer_payment_claim_ineligible'
      ].includes(err?.message))return json(res,409,{state:'order_conflict_or_replay_blocked'});
      if(['invalid_idempotency_key','invalid_claim','json_content_type_required',
        'oversized_json_body','json_object_required'].includes(err?.message)||
        err instanceof SyntaxError)return json(res,400,{state:'invalid_request'});
      return json(res,400,{state:'request_rejected'});
    }
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    if(process.argv.length!==2)throw Error('synthetic_invoice_server_takes_no_args');
    const dir=process.env.EVERCRAFT_SYNTHETIC_LEDGER_DIR;
    const token=process.env.EVERCRAFT_SYNTHETIC_HTTP_TOKEN;
    const server=createSyntheticInvoiceServer({dir,token});
    server.listen(0,'127.0.0.1',()=>{
      console.log(JSON.stringify({schema:'evercraft.payments.synthetic-loopback-server.v1',
        port:server.address().port,host:'127.0.0.1',
        public:false,money_enabled:false,synthetic:true}));
    });
    process.once('SIGTERM',()=>server.close(()=>process.exit(0)));
  }catch(error){
    console.error(JSON.stringify({state:'server_blocked',
      reason:String(error?.message||'unavailable').slice(0,75)}));
    process.exitCode=1;
  }
}
