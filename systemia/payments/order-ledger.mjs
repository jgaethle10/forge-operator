import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  assertEvercraftPaymentRoute,
  buildPaymentRoute,
} from './payment-routing.mjs';

const ORDER_SCHEMA='evercraft.payments.order.v1';
const EVENT_SCHEMA='evercraft.payments.order-event.v1';
const RECEIPT_SCHEMA='evercraft.payments.receipt.v1';
const ID_RE=/^[A-Za-z0-9._:-]{1,180}$/;

function stable(value){
  if(Array.isArray(value)) return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object'){
    return '{'+Object.keys(value).sort().map((key)=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
  }
  return JSON.stringify(value);
}

function sha256(value){
  return crypto.createHash('sha256').update(value).digest('hex');
}

function now(){
  return new Date().toISOString();
}

function cleanId(value,label){
  const out=String(value||'').trim();
  if(!ID_RE.test(out)) throw new Error(`${label}_invalid`);
  return out;
}

function assertCurrency(value){
  const currency=String(value||'USD').toUpperCase();
  if(!/^[A-Z]{3}$/.test(currency)) throw new Error('currency_invalid');
  return currency;
}

function assertMinorAmount(value){
  const amount=Number(value);
  if(!Number.isSafeInteger(amount)||amount<=0) throw new Error('amount_minor_invalid');
  return amount;
}

function atomicWrite(file,content){
  const temp=`${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  return (async()=>{
    await fs.mkdir(path.dirname(file),{recursive:true});
    try{
      const handle=await fs.open(temp,'wx',0o600);
      try{
        await handle.writeFile(content,'utf8');
        await handle.sync();
      }finally{
        await handle.close();
      }
      await fs.rename(temp,file);
    }finally{
      await fs.rm(temp,{force:true});
    }
  })();
}

function publicOrder(order){
  return {
    schema:ORDER_SCHEMA,
    order_id:order.order_id,
    product_key:order.product_key,
    offer_key:order.offer_key,
    amount_minor:order.amount_minor,
    currency:order.currency,
    state:order.state,
    buyer_confirmation:order.buyer_confirmation,
    settlement:order.settlement,
    handoff:order.handoff,
    created_at:order.created_at,
    updated_at:order.updated_at,
    receipt_head:order.receipt_head,
    route:order.route,
  };
}

export class EvercraftPaymentOrderStore {
  constructor(root,{ravenReceiptVerifier=null}={}){
    this.root=path.resolve(root);
    this.ravenReceiptVerifier=ravenReceiptVerifier;
    this.ordersDir=path.join(this.root,'orders');
    this.locksDir=path.join(this.root,'locks');
    this.requestsDir=path.join(this.root,'requests');
  }

  async init(){
    await Promise.all([
      fs.mkdir(this.ordersDir,{recursive:true}),
      fs.mkdir(this.locksDir,{recursive:true}),
      fs.mkdir(this.requestsDir,{recursive:true}),
    ]);
    return {
      schema:'evercraft.payments.order-store.v1',
      root:this.root,
      canonical_order_owner:'evercraft_payments',
      provider_boundary:'raven_nexus',
    };
  }

  orderPath(orderId){
    return path.join(this.ordersDir,`${cleanId(orderId,'order_id')}.json`);
  }

  lockPath(orderId){
    return path.join(this.locksDir,`${cleanId(orderId,'order_id')}.lock`);
  }

  requestPath(requestKey){
    return path.join(this.requestsDir,`${sha256(String(requestKey)).slice(0,40)}.json`);
  }

  async withLock(orderId,fn,{timeoutMs=5000,retryMs=10}={}){
    const lockPath=this.lockPath(orderId);
    const started=Date.now();
    await fs.mkdir(path.dirname(lockPath),{recursive:true});
    while(true){
      let handle=null;
      try{
        handle=await fs.open(lockPath,'wx',0o600);
        await handle.writeFile(JSON.stringify({
          schema:'evercraft.payments.order-lock.v1',
          order_id:orderId,
          pid:process.pid,
          created_at:now(),
        })+'\n','utf8');
        await handle.sync();
        try{
          return await fn();
        }finally{
          try{await handle.close();}catch{}
          await fs.rm(lockPath,{force:true});
        }
      }catch(error){
        if(handle){
          try{await handle.close();}catch{}
          await fs.rm(lockPath,{force:true});
        }
        if(error?.code!=='EEXIST') throw error;
        if(Date.now()-started>=timeoutMs){
          const wrapped=new Error('payment_order_lock_timeout');
          wrapped.code='EVERCRAFT_PAYMENT_ORDER_LOCK_TIMEOUT';
          throw wrapped;
        }
        await new Promise((resolve)=>setTimeout(resolve,retryMs));
      }
    }
  }

  async readRaw(orderId){
    const raw=JSON.parse(await fs.readFile(this.orderPath(orderId),'utf8'));
    this.verify(raw);
    return raw;
  }

  verify(order){
    if(order?.schema!==ORDER_SCHEMA) throw new Error('payment_order_schema_invalid');
    if(!Array.isArray(order.events)||order.events.length<1) throw new Error('payment_order_events_missing');
    let previous=null;
    for(let index=0;index<order.events.length;index+=1){
      const event=order.events[index];
      if(event.schema!==EVENT_SCHEMA) throw new Error('payment_order_event_schema_invalid');
      if(event.sequence!==index+1) throw new Error('payment_order_event_sequence_invalid');
      if((event.previous_hash||null)!==previous) throw new Error('payment_order_event_chain_invalid');
      const expected=sha256(stable({
        schema:event.schema,
        order_id:event.order_id,
        sequence:event.sequence,
        type:event.type,
        occurred_at:event.occurred_at,
        actor:event.actor,
        data:event.data,
        previous_hash:event.previous_hash||null,
      }));
      if(event.event_hash!==expected) throw new Error('payment_order_event_hash_invalid');
      previous=event.event_hash;
    }
    if(order.receipt_head!==previous) throw new Error('payment_order_receipt_head_invalid');
    const rebuilt=replay(order.events);
    for(const key of [
      'order_id','product_key','offer_key','amount_minor','currency','state',
      'created_at','updated_at','receipt_head'
    ]){
      if(stable(order[key])!==stable(rebuilt[key])) throw new Error(`payment_order_materialized_${key}_invalid`);
    }
    if(stable(order.buyer_confirmation)!==stable(rebuilt.buyer_confirmation)) throw new Error('payment_order_materialized_confirmation_invalid');
    if(stable(order.handoff)!==stable(rebuilt.handoff)) throw new Error('payment_order_materialized_handoff_invalid');
    if(stable(order.settlement)!==stable(rebuilt.settlement)) throw new Error('payment_order_materialized_settlement_invalid');
    return {ok:true,event_count:order.events.length,receipt_head:previous};
  }

  makeEvent({orderId,events,type,actor,data,occurredAt=now()}){
    const previous=events.length?events[events.length-1].event_hash:null;
    const base={
      schema:EVENT_SCHEMA,
      order_id:orderId,
      sequence:events.length+1,
      type,
      occurred_at:occurredAt,
      actor:actor||{type:'system',id:'evercraft_payments'},
      data:data||{},
      previous_hash:previous,
    };
    return {...base,event_hash:sha256(stable(base))};
  }

  async createOrder({
    productKey,
    offerKey,
    amountMinor,
    currency='USD',
    requestKey,
    actor={type:'system',id:'evercraft_payments'},
    metadata={},
  }={}){
    await this.init();
    const product=cleanId(productKey,'product_key');
    const offer=cleanId(offerKey,'offer_key');
    const amount=assertMinorAmount(amountMinor);
    const normalizedCurrency=assertCurrency(currency);
    const request=cleanId(requestKey,'request_key');
    const route=buildPaymentRoute({
      productKey:product,
      offerKey:offer,
      amount:amount/100,
      currency:normalizedCurrency,
    });
    const routeCheck=assertEvercraftPaymentRoute(route);
    if(!routeCheck.ok) throw new Error('payment_route_invalid');

    const requestFile=this.requestPath(request);
    const fingerprint=sha256(stable({
      product_key:product,
      offer_key:offer,
      amount_minor:amount,
      currency:normalizedCurrency,
    }));

    try{
      const existing=JSON.parse(await fs.readFile(requestFile,'utf8'));
      if(existing.fingerprint!==fingerprint) throw new Error('payment_request_idempotency_conflict');
      return this.getOrder(existing.order_id);
    }catch(error){
      if(error?.code!=='ENOENT' && error?.message!=='payment_request_idempotency_conflict') throw error;
      if(error?.message==='payment_request_idempotency_conflict') throw error;
    }

    const orderId='epo_'+sha256(request).slice(0,32);
    return this.withLock(orderId,async()=>{
      try{
        const existing=JSON.parse(await fs.readFile(requestFile,'utf8'));
        if(existing.fingerprint!==fingerprint) throw new Error('payment_request_idempotency_conflict');
        return this.getOrder(existing.order_id);
      }catch(error){
        if(error?.code!=='ENOENT' && error?.message!=='payment_request_idempotency_conflict') throw error;
        if(error?.message==='payment_request_idempotency_conflict') throw error;
      }

      const event=this.makeEvent({
        orderId,
        events:[],
        type:'order.created',
        actor,
        data:{
          product_key:product,
          offer_key:offer,
          amount_minor:amount,
          currency:normalizedCurrency,
          route,
          metadata,
        },
      });
      const order=replay([event]);
      await atomicWrite(this.orderPath(orderId),JSON.stringify(order,null,2)+'\n');
      try{
        await atomicWrite(requestFile,JSON.stringify({
          schema:'evercraft.payments.request-index.v1',
          request_key_hash:sha256(request),
          fingerprint,
          order_id:orderId,
          created_at:event.occurred_at,
        },null,2)+'\n');
      }catch(error){
        await fs.rm(this.orderPath(orderId),{force:true});
        throw error;
      }
      return publicOrder(order);
    });
  }

  async append(orderId,{type,actor,data}){
    return this.withLock(orderId,async()=>{
      const order=await this.readRaw(orderId);
      const event=this.makeEvent({
        orderId,
        events:order.events,
        type,
        actor,
        data,
      });
      const next=materialize([...order.events,event]);
      await atomicWrite(this.orderPath(orderId),JSON.stringify(next,null,2)+'\n');
      return publicOrder(next);
    });
  }

  async confirmOrder(orderId,{
    buyerRef,
    actor={type:'human',id:'buyer'},
  }={}){
    const current=await this.readRaw(orderId);
    if(current.state!=='confirmation_required') throw new Error('payment_order_not_confirmation_required');
    return this.append(orderId,{
      type:'buyer.confirmed',
      actor,
      data:{buyer_ref:cleanId(buyerRef,'buyer_ref')},
    });
  }

  async verifyRavenReceipt(receipt,{purpose,order}={}){
    if(typeof this.ravenReceiptVerifier!=='function'){
      throw new Error('raven_receipt_verifier_required');
    }
    const result=await this.ravenReceiptVerifier(receipt,{
      purpose,
      order:publicOrder(order),
    });
    if(result?.ok!==true) throw new Error('raven_receipt_verification_failed');
    const hash=String(result.receipt_hash||'').trim().toLowerCase();
    if(!/^[a-f0-9]{64}$/.test(hash)) throw new Error('raven_receipt_hash_invalid');
    if(result.purpose!==purpose) throw new Error('raven_receipt_purpose_mismatch');
    if(String(result.order_id||'')!==order.order_id) throw new Error('raven_receipt_order_mismatch');
    return {...result,receipt_hash:hash};
  }

  async recordRavenHandoff(orderId,{
    checkoutRef,
    ravenReceipt,
    actor={type:'system',id:'raven_nexus'},
  }={}){
    const current=await this.readRaw(orderId);
    if(current.state!=='confirmed') throw new Error('payment_order_not_confirmed');
    const verified=await this.verifyRavenReceipt(ravenReceipt,{
      purpose:'payment_checkout_handoff',
      order:current,
    });
    return this.append(orderId,{
      type:'settlement.handoff_prepared',
      actor,
      data:{
        provider_boundary:'raven_nexus',
        checkout_ref:cleanId(checkoutRef,'checkout_ref'),
        raven_receipt_hash:verified.receipt_hash,
      },
    });
  }

  async recordSettlement(orderId,{
    providerEventId,
    amountMinor,
    currency='USD',
    status,
    ravenReceipt,
    actor={type:'system',id:'raven_nexus'},
  }={}){
    const current=await this.readRaw(orderId);
    if(current.state!=='settlement_pending') throw new Error('payment_order_not_settlement_pending');
    const amount=assertMinorAmount(amountMinor);
    const normalizedCurrency=assertCurrency(currency);
    if(amount!==current.amount_minor) throw new Error('settlement_amount_mismatch');
    if(normalizedCurrency!==current.currency) throw new Error('settlement_currency_mismatch');
    if(status!=='succeeded') throw new Error('settlement_not_succeeded');
    const verified=await this.verifyRavenReceipt(ravenReceipt,{
      purpose:'payment_settlement_succeeded',
      order:current,
    });
    if(Number(verified.amount_minor)!==amount) throw new Error('raven_receipt_amount_mismatch');
    if(String(verified.currency||'').toUpperCase()!==normalizedCurrency) throw new Error('raven_receipt_currency_mismatch');
    if(verified.receipt_hash===current.handoff?.raven_receipt_hash) throw new Error('settlement_receipt_must_be_distinct_from_handoff');
    return this.append(orderId,{
      type:'settlement.succeeded',
      actor,
      data:{
        provider_boundary:'raven_nexus',
        settlement_adapter:'stripe',
        provider_event_id:cleanId(providerEventId,'provider_event_id'),
        amount_minor:amount,
        currency:normalizedCurrency,
        raven_receipt_hash:verified.receipt_hash,
      },
    });
  }

  async getOrder(orderId){
    return publicOrder(await this.readRaw(orderId));
  }
}

function replay(events){
  let state=null;
  for(const event of events){
    if(event.type==='order.created'){
      state={
        schema:ORDER_SCHEMA,
        order_id:event.order_id,
        product_key:event.data.product_key,
        offer_key:event.data.offer_key,
        amount_minor:event.data.amount_minor,
        currency:event.data.currency,
        route:event.data.route,
        state:'confirmation_required',
        buyer_confirmation:null,
        handoff:null,
        settlement:null,
        created_at:event.occurred_at,
        updated_at:event.occurred_at,
        receipt_head:event.event_hash,
        events,
      };
      continue;
    }
    if(!state) throw new Error('payment_order_missing_creation_event');
    if(event.type==='buyer.confirmed'){
      if(state.state!=='confirmation_required') throw new Error('payment_order_event_transition_invalid');
      state.state='confirmed';
      state.buyer_confirmation={
        confirmed:true,
        buyer_ref:event.data.buyer_ref,
        actor:event.actor,
        confirmed_at:event.occurred_at,
      };
    }else if(event.type==='settlement.handoff_prepared'){
      if(state.state!=='confirmed') throw new Error('payment_order_event_transition_invalid');
      if(event.data.provider_boundary!=='raven_nexus') throw new Error('payment_order_provider_boundary_invalid');
      state.state='settlement_pending';
      state.handoff={
        provider_boundary:'raven_nexus',
        checkout_ref:event.data.checkout_ref,
        raven_receipt_hash:event.data.raven_receipt_hash,
        prepared_at:event.occurred_at,
      };
    }else if(event.type==='settlement.succeeded'){
      if(state.state!=='settlement_pending') throw new Error('payment_order_event_transition_invalid');
      if(event.data.provider_boundary!=='raven_nexus') throw new Error('payment_order_provider_boundary_invalid');
      if(event.data.settlement_adapter!=='stripe') throw new Error('payment_order_settlement_adapter_invalid');
      state.state='paid';
      state.settlement={
        provider_boundary:'raven_nexus',
        settlement_adapter:'stripe',
        provider_event_id:event.data.provider_event_id,
        amount_minor:event.data.amount_minor,
        currency:event.data.currency,
        raven_receipt_hash:event.data.raven_receipt_hash,
        settled_at:event.occurred_at,
      };
    }else{
      throw new Error(`payment_order_event_type_unsupported:${event.type}`);
    }
    state.updated_at=event.occurred_at;
    state.receipt_head=event.event_hash;
  }
  return state;
}

export function buildPaymentReceipt(order){
  if(order?.state!=='paid'||!order?.settlement) throw new Error('payment_order_not_paid');
  const body={
    schema:RECEIPT_SCHEMA,
    order_id:order.order_id,
    product_key:order.product_key,
    offer_key:order.offer_key,
    amount_minor:order.amount_minor,
    currency:order.currency,
    paid_at:order.settlement.settled_at,
    provider_boundary:'raven_nexus',
    settlement_adapter:order.settlement.settlement_adapter,
    provider_event_id:order.settlement.provider_event_id,
    raven_receipt_hash:order.settlement.raven_receipt_hash,
    order_receipt_head:order.receipt_head,
  };
  return {...body,receipt_hash:sha256(stable(body))};
}

export const paymentOrderSchemas={
  order:ORDER_SCHEMA,
  event:EVENT_SCHEMA,
  receipt:RECEIPT_SCHEMA,
};
