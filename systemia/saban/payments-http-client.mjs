#!/usr/bin/env node
/**
 * Independent Saban HTTP test client. Requests are restricted to synthetic
 * 127.0.0.1 invoice server; no financial provider or other network hosts.
 */
import {pathToFileURL} from 'node:url';
import path from 'node:path';
function endpoint(port,suffix){
  const p=Number(port);
  if(!Number.isInteger(p)||p<1||p>65535)throw Error('local_http_port_invalid');
  if(!/^\/v1\/orders(?:\/[A-Za-z0-9_-]+)*(?:\/(?:invoice|select|claim|paid))?$/.test(suffix)){
    throw Error('local_http_path_invalid');
  }
  return 'http://127.0.0.1:'+p+suffix;
}
async function call(port,secret,method,suffix,data,authenticated=true){
  const url=endpoint(port,suffix);
  const headers={'content-type':'application/json'};
  if(authenticated)headers.authorization='Bearer '+secret;
  let response;
  try{
    response=await fetch(url,{method,headers,
      ...(data?{body:JSON.stringify(data)}:{}),
      redirect:'error',signal:AbortSignal.timeout(4000)
    });
  }catch{throw Error('synthetic_loopback_http_unavailable')}
  let body;
  try{body=await response.json()}catch{throw Error('invalid_synthetic_http_reply')}
  return {status:response.status,body};
}
const assert=(cond,reason)=>{if(!cond)throw Error(reason)};
export async function runSyntheticHttpRole({role,port,key,orderId,rail,token}={}){
  if(typeof token!=='string'||!/^[0-9a-f]{64}$/.test(token))throw Error('client_auth_missing');
  if(!['create','invoice','select','claim','audit','attack','replay','unauthorized'].includes(role)){
    throw Error('unregistered_synthetic_http_role');
  }
  let x;
  if(role==='create'){
    x=await call(port,token,'POST','/v1/orders',{
      idempotency_key:key,offer_key:'findmypart.quick_hunt_19.v1',
      customer_ref:'synthetic-customer-001'
    });
    assert([200,201].includes(x.status),'create_failed');
    assert(x.body.payment_state==='unpaid'&&x.body.fulfillment_state==='held','create_claimed_money');
    return {order_id:x.body.order_id,version:x.body.version,created:x.status===201};
  }
  if(role==='replay'){
    x=await call(port,token,'POST','/v1/orders',{
      idempotency_key:key,offer_key:'findmypart.quick_hunt_19.v1',
      customer_ref:'synthetic-customer-001'
    });
    assert(x.status===200&&x.body.order_id===orderId&&x.body.replayed===true,'idempotency_replay_failed');
    const conflict=await call(port,token,'POST','/v1/orders',{
      idempotency_key:key,offer_key:'findmypart.quick_hunt_19.v1',
      customer_ref:'DIFFERENT_CUSTOMER'
    });
    assert(conflict.status===409,'idempotency_mismatch_accepted');
    return {replayed:true,duplicate_orders_created:false};
  }
  const orderUrl='/v1/orders/'+orderId;
  if(role==='invoice'){
    x=await call(port,token,'GET',orderUrl+'/invoice');
    assert(x.status===200&&x.body.amount_cents===1900,'invoice_missing_or_wrong_price');
    assert(x.body.merchant_payment_destination===null,'real_payment_destination_leaked');
    assert(x.body.money_transmission_enabled===false,'money_transmission_enabled');
    assert(x.body.payment_verified===false,'false_paid_invoice');
    return {invoice_id:x.body.invoice_id,amount_cents:1900,
      payment_destination:null,synthetic_only:true};
  }
  if(role==='select'){
    x=await call(port,token,'POST',orderUrl+'/select',{
      expected_version:1,rail,buyer_confirmed:true
    });
    if(x.status===409)return {selected:false,rejected_conflict:true};
    assert(x.status===200&&x.body.version===2&&x.body.payment_state==='unpaid',
      'rail_selection_wrong');
    assert(x.body.payment_destination===null,'rail_unsafe_destination');
    return {selected:true,version:2,rail:x.body.rail,
      settlement_tested:false};
  }
  if(role==='claim'){
    x=await call(port,token,'POST',orderUrl+'/claim',{
      expected_version:2,claim_ref:'synthetic-claimed-sent'
    });
    assert(x.status===200&&x.body.version===3&&x.body.payment_state==='unpaid',
      'customer_claim_misreported_paid');
    assert(x.body.payment_verified===false,'claim_caused_payment');
    return {claim_noted:true,paid:false,version:3};
  }
  if(role==='audit'){
    x=await call(port,token,'GET',orderUrl);
    assert(x.status===200,'audit_get_failed');
    assert(x.body.payment_state==='unpaid'&&x.body.entitlement_state==='held'&&
      x.body.fulfillment_state==='held'&&x.body.payment_verified===false,
      'audit_detected_unverified_paid');
    const invoice=await call(port,token,'GET',orderUrl+'/invoice');
    assert(invoice.status===200 && invoice.body.merchant_payment_destination===null &&
      invoice.body.money_transmission_enabled===false &&
      invoice.body.paid_receipt===null,'invoice_paid_or_destination_leak');
    return {version:x.body.version,rail:x.body.rail,amount_cents:x.body.amount_cents,
      payment_state:x.body.payment_state,receipt_verified:false,
      fulfilled:false,live_payment_destination:false};
  }
  if(role==='attack'){
    const attack=await call(port,token,'POST',orderUrl+'/paid',{paid:true});
    assert([404,405].includes(attack.status),'money_mutation_endpoint_exposed');
    const claim=await call(port,token,'POST',orderUrl+'/claim',{
      expected_version:1,claim_ref:'fake_payment_claim'
    });
    assert(claim.status===409||claim.status===400,'stale_claim_not_blocked');
    const overcharge=await call(port,token,'POST','/v1/orders',{
      idempotency_key:'another-synthetic-httptest-key',
      offer_key:'findmypart.quick_hunt_19.v1',
      customer_ref:'synthetic-customer-001',
      amount_cents:1
    });
    assert(overcharge.status===400,'buyer_price_override_accepted');
    return {money_mutation_rejected:true,stale_claim_rejected:true,
      price_override_rejected:true};
  }
  if(role==='unauthorized'){
    x=await call(port,token,'GET',orderUrl,undefined,false);
    assert(x.status===401,'unauthed_order_exposed');
    const bad=await call(port,token,'POST','/v1/orders',{
      idempotency_key:'synthetic-unauthed-12345',
      offer_key:'findmypart.quick_hunt_19.v1',
      customer_ref:'synthetic-customer-001'
    },false);
    assert(bad.status===401,'unauthed_create_accepted');
    return {unauthorized_order_reads_blocked:true,
      unauthorized_order_creates_blocked:true};
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const [role,port,key,orderId,rail]=process.argv.slice(2);
    const result=await runSyntheticHttpRole({
      role,port,key,orderId,rail,
      token:process.env.EVERCRAFT_SYNTHETIC_HTTP_TOKEN
    });
    console.log(JSON.stringify({
      schema:'evercraft.saban.synthetic-http-client.v1',role,
      status:'completed',synthetic:true,
      provider_calls:0,money_moved:false,result
    }));
  }catch(error){
    console.error(JSON.stringify({
      schema:'evercraft.saban.synthetic-http-client.v1',
      role:process.argv[2]||'unknown',status:'blocked',
      synthetic:true,provider_calls:0,money_moved:false,
      reason:String(error?.message||'client_error').slice(0,90)
    }));
    process.exitCode=1;
  }
}
