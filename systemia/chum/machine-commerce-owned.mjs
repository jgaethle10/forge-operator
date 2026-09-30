import { rankOffers } from './discovery-router.mjs';

function clean(value,max=4000){
  return String(value ?? '').trim().slice(0,max);
}
function ownedUrl(origin,path){
  const base=clean(origin,1800).replace(/\/$/,'');
  if(!base) return path;
  try{ return new URL(path,base).toString(); }catch{ return path; }
}
function legacyBase44(value){
  try{ return /(^|\.)base44\.app$/i.test(new URL(String(value||'')).hostname); }
  catch{ return false; }
}

export function sanitizeMachineOffer(offer,{origin=''}={}){
  if(!offer || typeof offer!=='object') return null;
  const publicId=clean(offer.public_id,200);
  if(!publicId) return null;
  const publicUrl=clean(offer.public_url,1800);
  return {
    public_id:publicId,
    product_key:offer.product_key || null,
    name:offer.name || publicId,
    problem:offer.problem || '',
    intent_terms:Array.isArray(offer.intent_terms)?offer.intent_terms:[],
    commercial_state:offer.commercial_state || 'discovery_only',
    machine_state:offer.machine_state || 'unknown',
    pricing:offer.pricing || null,
    offers:Array.isArray(offer.offers)?offer.offers:[],
    human_ui_required:Boolean(offer.human_ui_required),
    confirmation:offer.confirmation || null,
    payment_authority:offer.payment_authority || null,
    invocation_status:offer.invocation_status || null,
    catalog_version:offer.catalog_version || null,
    owned_review_url:ownedUrl(origin,'/buy/'+encodeURIComponent(publicId)),
    owned_machine_offer_url:ownedUrl(origin,'/api/machine-commerce?action=offer&public_id='+encodeURIComponent(publicId)),
    legacy_public_url_present:Boolean(publicUrl && legacyBase44(publicUrl)),
    public_url:publicUrl && !legacyBase44(publicUrl) ? publicUrl : null,
    migration_boundary:'Discovery and human-review preparation are owned. Payment, paid execution, and product-runtime authority require separately verified first-party routes.'
  };
}

export function matchOwnedMachineOffers(catalog,intent,{limit=5,origin=''}={}){
  const q=clean(intent,4000);
  if(q.length<3) throw new Error('machine_commerce_intent_required');
  return rankOffers(catalog,q,{limit,minimumScore:8})
    .map((row)=>sanitizeMachineOffer(row,{origin}))
    .filter(Boolean);
}

export function getOwnedMachineOffer(catalog,publicId,{origin=''}={}){
  const id=clean(publicId,200);
  const rows=Array.isArray(catalog?.offers)?catalog.offers:[];
  return sanitizeMachineOffer(rows.find((row)=>String(row?.public_id||'')===id),{origin});
}

export function prepareOwnedMachineHandoff(catalog,publicId,{origin=''}={}){
  const offer=getOwnedMachineOffer(catalog,publicId,{origin});
  if(!offer) throw new Error('machine_commerce_offer_not_found');
  return {
    ok:true,
    state:'human_review_ready',
    runtime:'yard_evercraft_compute',
    offer,
    handoff:{
      review_url:offer.owned_review_url,
      human_confirmation_required:true,
      checkout_created:false,
      payment_created:false,
      payment_obligation_created:false,
      paid_work_started:false,
      provider_execution_started:false
    },
    truth_boundary:'This owned handoff prepares human review only. It does not create checkout, payment, obligation, entitlement, product access, provider execution, or revenue.'
  };
}

export function resolveOwnedMachineCommerceAction(action,publicId,catalog,{origin='',intent='',limit=5}={}){
  const key=clean(action,80).toLowerCase();
  if(key==='offer'){
    const offer=getOwnedMachineOffer(catalog,publicId,{origin});
    if(!offer) throw new Error('machine_commerce_offer_not_found');
    return {ok:true,state:'offer',runtime:'yard_evercraft_compute',offer};
  }
  if(key==='service_handoff') return prepareOwnedMachineHandoff(catalog,publicId,{origin});
  if(key==='match_offer'){
    return {
      ok:true,
      state:'matched',
      runtime:'yard_evercraft_compute',
      matches:matchOwnedMachineOffers(catalog,intent,{limit,origin}),
      checkout_created:false,
      payment_created:false
    };
  }
  throw new Error('machine_commerce_action_unsupported');
}

function rpcResult(id,result){ return {jsonrpc:'2.0',id:id??null,result}; }
function rpcError(id,code,message){ return {jsonrpc:'2.0',id:id??null,error:{code,message}}; }
function toolResult(payload){
  return {
    content:[{type:'text',text:JSON.stringify(payload,null,2)}],
    structuredContent:payload,
    isError:false
  };
}

export async function executeOwnedMachineCommerceRpc(rpc,catalog,{origin=''}={}){
  const method=clean(rpc?.method,120);
  const id=rpc?.id ?? null;
  if(method==='initialize'){
    return rpcResult(id,{
      protocolVersion:'2025-03-26',
      capabilities:{tools:{}},
      serverInfo:{name:'evercraft-machine-commerce-owned',version:'2.0.0-yard'},
      instructions:'Owned read-only problem-to-offer matching and human-review preparation. No checkout, payment, paid work, or provider execution authority.'
    });
  }
  if(method==='tools/list'){
    const safe={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
    return rpcResult(id,{tools:[
      {
        name:'match_offer',
        title:'Match an Evercraft offer',
        description:'Match a user problem to current Evercraft offers. Read-only. Creates no checkout, payment, obligation, entitlement, or work.',
        inputSchema:{type:'object',properties:{intent:{type:'string',minLength:3,maxLength:4000},limit:{type:'integer',minimum:1,maximum:10}},required:['intent'],additionalProperties:false},
        annotations:safe
      },
      {
        name:'get_offer',
        title:'Get an Evercraft offer',
        description:'Read one published Evercraft offer and its current migration/commercial boundary.',
        inputSchema:{type:'object',properties:{public_id:{type:'string',minLength:1,maxLength:200}},required:['public_id'],additionalProperties:false},
        annotations:safe
      },
      {
        name:'prepare_human_handoff',
        title:'Prepare a human review handoff',
        description:'Prepare the owned human-review URL for one Evercraft offer. Does not create checkout, payment, obligation, entitlement, access, or paid work.',
        inputSchema:{type:'object',properties:{public_id:{type:'string',minLength:1,maxLength:200}},required:['public_id'],additionalProperties:false},
        annotations:safe
      }
    ]});
  }
  if(method==='tools/call'){
    const name=clean(rpc?.params?.name,120);
    const args=rpc?.params?.arguments || {};
    try{
      if(name==='match_offer'){
        return rpcResult(id,toolResult(resolveOwnedMachineCommerceAction('match_offer','',catalog,{origin,intent:args.intent,limit:args.limit})));
      }
      if(name==='get_offer'){
        return rpcResult(id,toolResult(resolveOwnedMachineCommerceAction('offer',args.public_id,catalog,{origin})));
      }
      if(name==='prepare_human_handoff'){
        return rpcResult(id,toolResult(resolveOwnedMachineCommerceAction('service_handoff',args.public_id,catalog,{origin})));
      }
      return rpcError(id,-32602,'Unknown or unsupported Machine Commerce tool.');
    }catch(error){
      return rpcResult(id,{
        content:[{type:'text',text:error instanceof Error?error.message:String(error)}],
        isError:true
      });
    }
  }
  if(method==='notifications/initialized') return null;
  return rpcError(id,-32601,'Method not found.');
}
