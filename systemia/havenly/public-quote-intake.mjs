import { createHash } from 'node:crypto';

// This is an inert adapter contract. It is not a public HTTP endpoint,
// lead database, customer notification, booking confirmation, or payment API.
const SERVICES=new Set(['Recurring cleaning','Deep cleaning','Move-in or move-out','Rental turnover','Post-construction','Other']);
const FREQUENCIES=new Set(['One-time','Weekly','Bi-weekly','Monthly','Not sure yet']);
const COLLECTIONS=new Set(['','Personal plan','Welcome Haven','Deep Haven','Haven Reset']);
const ADDONS=new Set(['Inside refrigerator','Inside oven','Interior windows','Interior cabinets','Laundry or folding','Custom request']);

const safe=(v,max)=>String(v??'').replace(/\u0000/g,'').trim().slice(0,max);
const hash=v=>'sha256:'+createHash('sha256').update(v).digest('hex');
const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
const checked=(value,allowed,field)=>{if(!allowed.has(value))throw new Error('havenly_'+field+'_invalid');return value;};

export function normalizeHavenlyQuote(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('havenly_quote_object_required');
  const name=safe(input.name,120),phone=safe(input.phone,50),area=safe(input.area||input.location,150);
  if(!name)throw new Error('havenly_name_required');
  if(!/^[+()\d.\s-]{7,50}$/.test(phone)||phone.replace(/\D/g,'').length<7)throw new Error('havenly_phone_invalid');
  if(!area)throw new Error('havenly_area_required');
  const service=checked(safe(input.service,50),SERVICES,'service');
  const frequency=checked(safe(input.frequency||'Not sure yet',30),FREQUENCIES,'frequency');
  const collection=checked(safe(input.collection||'Personal plan',40),COLLECTIONS,'collection');
  const addons=input.addons??[];
  if(!Array.isArray(addons)||addons.length>20)throw new Error('havenly_addons_invalid');
  const selected=[...new Set(addons.map(a=>safe(a,60)))];
  selected.forEach(a=>checked(a,ADDONS,'addon'));
  selected.sort();
  const bedrooms=safe(input.bedrooms,25),bathrooms=safe(input.bathrooms,25);
  const homeSize=safe(input.home_size||input.homeSize,60);
  const preferences=safe(input.preferences,300),details=safe(input.details,1600);
  return {name,phone,area,service,frequency,collection,bedrooms,bathrooms,home_size:homeSize,addons:selected,preferences,details};
}

export function buildHavenlyIntakeCandidate(input,{adapterActorRef,receivedAt='2026-10-28T00:00:00.000Z',externalEventId}={}){
  const actor=safe(adapterActorRef,200);
  if(!actor)throw new Error('havenly_adapter_actor_required');
  const when=new Date(receivedAt);
  if(!Number.isFinite(when.getTime()))throw new Error('havenly_received_at_invalid');
  const quote=normalizeHavenlyQuote(input);
  const fingerprint=hash(JSON.stringify(sorted(quote)));
  const providedId=safe(externalEventId,128);
  if(providedId&&!/^[A-Za-z0-9:_-]+$/.test(providedId))throw new Error('havenly_external_event_id_invalid');
  const eventId=providedId||fingerprint;
  return {
    idempotency_key:'havenly-quote:'+eventId,
    source_type:'form',
    adapter_actor_ref:actor,
    received_at:when.toISOString(),
    source_ref:'havenly-public-quote-form',
    external_event_id:eventId,
    source_trust_state:'untrusted_external',
    claimed_source_identity_ref:null,
    verified_source_identity_ref:null,
    identity_evidence_ref:null,
    content_ref:'private-havenly-quote:'+fingerprint,
    content_fingerprint:fingerprint,
    // No direct customer name, phone, area, or free-text details in routing excerpts.
    intent_excerpt:'HAVENLY cleaning quote request | service='+quote.service+' | cadence='+quote.frequency,
    requested_capability_hints:['havenly-cleaning','cleaning-service-quote-request'],
    claimed_priority:'normal',
    attachments:[],
    adapter_risk_flags:[],
    payload:{
      schema:'evercraft.havenly.public-quote.v1',
      quote,
      execution_authority_granted:false,
      customer_obligation_created:false,
      booking_confirmed:false,
      payment_created:false
    }
  };
}

export function previewHavenlyHandoffReceipt(candidate){
  if(candidate?.payload?.schema!=='evercraft.havenly.public-quote.v1')throw new Error('havenly_candidate_invalid');
  const body={
    schema:'evercraft.havenly.quote-handoff-preview.v1',
    prepared_for_private_intake:true,
    accepted_for_intake:false,
    delivery_verified:false,
    customer_notified:false,
    booking_confirmed:false,
    payment_created:false,
    customer_obligation_created:false,
    content_fingerprint:candidate.content_fingerprint
  };
  return {...body,receipt_hash:hash(JSON.stringify(sorted(body)))};
}
