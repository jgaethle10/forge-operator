import { createHash } from 'node:crypto';

function text(value,max=1000){
  return String(value||'').trim().slice(0,max);
}

function sha256(value){
  return 'sha256:'+createHash('sha256').update(String(value)).digest('hex');
}

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  }
  return value;
}

export function normalizeEpsQuote(payload={}){
  const quote={
    name:text(payload.name,160),
    phone:text(payload.phone,80),
    location:text(payload.location||payload.address,300),
    service:text(payload.service||payload.service_type,300),
    details:text(payload.details,2000),
    referral_code:text(payload.referral_code,80),
  };
  if(!quote.name) throw new Error('eps_quote_name_required');
  if(!quote.phone) throw new Error('eps_quote_phone_required');
  if(!quote.location) throw new Error('eps_quote_location_required');
  if(!quote.service) throw new Error('eps_quote_service_required');
  return quote;
}

export function buildEpsQuoteIntakeRequest(payload,{
  adapterActorRef,
  receivedAt=new Date().toISOString(),
  externalEventId='',
}={}){
  const quote=normalizeEpsQuote(payload);
  const canonical=JSON.stringify(stable(quote));
  const fingerprint=sha256(canonical);
  const eventId=text(externalEventId,200)||fingerprint;
  return {
    idempotency_key:'eps-quote:'+eventId,
    source_type:'form',
    adapter_actor_ref:text(adapterActorRef,300),
    received_at:new Date(receivedAt).toISOString(),
    source_ref:'eps-public-quote-form',
    external_event_id:eventId,
    source_trust_state:'untrusted_external',
    claimed_source_identity_ref:quote.phone,
    verified_source_identity_ref:null,
    identity_evidence_ref:null,
    content_ref:'inline:'+fingerprint,
    content_fingerprint:fingerprint,
    intent_excerpt:[
      'EPS quote request',
      'service='+quote.service,
      'location='+quote.location,
      quote.details?'details='+quote.details:''
    ].filter(Boolean).join(' | ').slice(0,2000),
    requested_capability_hints:[
      'evercraft-property-services',
      'property-service-estimate-intake',
      'quote-request'
    ],
    claimed_priority:'normal',
    attachments:[],
    adapter_risk_flags:[],
    payload:{
      schema:'evercraft.eps.public-quote.v1',
      quote,
      execution_authority_granted:false,
      customer_obligation_created:false,
    },
  };
}

export function buildEpsQuoteReceipt(request){
  const body={
    schema:'evercraft.eps.public-quote-receipt.v1',
    accepted_for_intake:true,
    content_fingerprint:request.content_fingerprint,
    external_event_id:request.external_event_id,
    execution_authority_granted:false,
    customer_obligation_created:false,
    payment_created:false,
  };
  return {...body,receipt_hash:sha256(JSON.stringify(stable(body)))};
}
