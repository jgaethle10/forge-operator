import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const readJson=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));
const unique=(values)=>[...new Set((values||[]).map((v)=>String(v||'').trim()).filter(Boolean))];

const BLOCKED_PUBLIC_HOSTS=new Set([
  'systemiacommandcenters.com',
  'www.systemiacommandcenters.com'
]);

function safePublicUrl(value){
  if(!value) return null;
  try{
    const url=new URL(String(value));
    if(!['http:','https:'].includes(url.protocol)) return null;
    if(BLOCKED_PUBLIC_HOSTS.has(url.hostname.toLowerCase())) return null;
    return url.toString();
  }catch{
    return null;
  }
}

const PRODUCT_DIR='public/.well-known/evercraft-products.json';
const MACHINE_CATALOG='public/.well-known/evercraft-machine-catalog.json';
const REGISTRY='registry/catalog.json';
const OUTPUT_JSON='public/.well-known/evercraft-pain-index.json';
const OUTPUT_MIRROR='public/chum/pain-index.json';
const OUTPUT_TEXT='public/chum/pain-index.txt';

function safeRead(pathname,fallback){
  try{return readJson(pathname)}catch{return fallback}
}

function machineHumanConfirmation(machineCatalog,offer){
  if(machineCatalog?.safety?.human_confirmation_required_for_checkout===true) return true;
  const text=String(offer?.confirmation||'').toLowerCase();
  return /human|explicit|confirm|confirmation/.test(text);
}

export function buildPainIndex(){
  const directory=safeRead(PRODUCT_DIR,{products:[]});
  const machine=safeRead(MACHINE_CATALOG,{offers:[],safety:{}});
  const registry=safeRead(REGISTRY,{products:[],universal_front_door:null});

  const registryByKey=new Map((registry.products||[]).map((p)=>[p.product_key,p]));
  const declaredFrontDoor=registry.universal_front_door||{};
  const publicUniversalFrontDoor={
    read_only_registry_name:declaredFrontDoor.read_only_registry_name||null,
    read_only_mcp:safePublicUrl(declaredFrontDoor.read_only_mcp),
    registry_name:declaredFrontDoor.registry_name||null,
    mcp:safePublicUrl(declaredFrontDoor.mcp),
    registry_mcp:safePublicUrl(declaredFrontDoor.registry_mcp),
    redundant_edge_mcp:safePublicUrl(declaredFrontDoor.redundant_edge_mcp),
    gateway:safePublicUrl(declaredFrontDoor.gateway),
    pain_index:safePublicUrl(declaredFrontDoor.pain_index),
    a2a_agent_card:safePublicUrl(declaredFrontDoor.a2a_agent_card),
    a2a_endpoint:safePublicUrl(declaredFrontDoor.a2a_endpoint),
    openapi_safe:safePublicUrl(declaredFrontDoor.openapi_safe),
    openapi_full:safePublicUrl(declaredFrontDoor.openapi_full),
    distribution_operator:safePublicUrl(declaredFrontDoor.distribution_operator),
    grok_marketplace:safePublicUrl(declaredFrontDoor.grok_marketplace),
    purpose:declaredFrontDoor.purpose||null,
    read_only_purpose:declaredFrontDoor.read_only_purpose||null
  };
  const entries=[];

  for(const product of directory.products||[]){
    const key=String(product.product_key||'').trim();
    if(!key) continue;
    const reg=registryByKey.get(key)||{};
    const painPhrases=unique([...(product.intents||[]),...(reg.triggers||[])]);
    const productUrl=safePublicUrl(product.canonical_url||reg.canonical_url);
    const specialistMcp=safePublicUrl(reg.mcp);
    entries.push({
      capability_id:`product:${key}`,
      product_key:key,
      kind:'product',
      name:String(product.name||reg.name||key),
      class:String(product.class||'public_capability'),
      pain_phrases:painPhrases,
      problem:null,
      inputs:null,
      outputs:null,
      canonical_url:productUrl,
      registry_name:reg.registry_name||null,
      mcp:specialistMcp,
      routing:{
        preferred:specialistMcp?'specialist_mcp':'universal_machine_commerce',
        target:specialistMcp||safePublicUrl(registry.universal_front_door?.mcp)||null
      },
      legacy_marketing_route_suppressed:Boolean((product.canonical_url||reg.canonical_url)&&!productUrl),
      authority:product.authority||null,
      boundaries:product.boundaries||[],
      commercial_state:'product_contract',
      machine_state:specialistMcp?'specialist_mcp_declared':'discovery_only',
      pricing:null,
      offers:[],
      human_confirmation_required:Boolean(product.human_confirmation_required),
      confirmation:product.human_confirmation_required?'Preserve the product-specific human confirmation boundary before any checkout, payment obligation, external handoff, or consequential action.':'No payment obligation is created by discovery.',
      payment_authority:null,
      invocation_status:specialistMcp?'Specialist MCP declared in the Evercraft registry. Runtime health remains receipt-gated.':'Route through the universal Evercraft discovery surface unless a bounded specialist interface is later verified.',
      source_refs:[
        PRODUCT_DIR,
        reg.registry_name?REGISTRY:null
      ].filter(Boolean)
    });
  }

  for(const offer of machine.offers||[]){
    const publicId=String(offer.public_id||'').trim();
    if(!publicId) continue;
    const painPhrases=unique(offer.intent_terms||[]);
    const offerUrl=safePublicUrl(offer.public_url);
    entries.push({
      capability_id:`offer:${publicId}`,
      product_key:null,
      public_id:publicId,
      kind:'machine_offer',
      name:String(offer.name||publicId),
      class:'machine_commerce_offer',
      pain_phrases:painPhrases,
      problem:String(offer.problem||'')||null,
      inputs:String(offer.inputs||'')||null,
      outputs:String(offer.outputs||'')||null,
      canonical_url:offerUrl,
      legacy_marketing_route_suppressed:Boolean(offer.public_url&&!offerUrl),
      registry_name:null,
      mcp:safePublicUrl(registry.universal_front_door?.mcp)||null,
      routing:{
        preferred:'universal_machine_commerce',
        target:safePublicUrl(registry.universal_front_door?.mcp)||null
      },
      authority:'Machine-commerce contract only. The offer state below is authoritative for public routing and must not be upgraded by inference.',
      boundaries:[],
      commercial_state:String(offer.commercial_state||'unknown'),
      machine_state:String(offer.machine_state||'unknown'),
      pricing:String(offer.pricing||'')||null,
      offers:Array.isArray(offer.offers)?offer.offers:[],
      human_confirmation_required:machineHumanConfirmation(machine,offer),
      confirmation:String(offer.confirmation||'')||null,
      payment_authority:String(offer.payment_authority||'')||null,
      invocation_status:String(offer.invocation_status||'')||null,
      source_refs:[MACHINE_CATALOG]
    });
  }

  entries.sort((a,b)=>String(a.capability_id).localeCompare(String(b.capability_id)));

  const sellNow=entries.filter((e)=>e.kind==='machine_offer'&&e.commercial_state==='sell_now').length;
  const callable=entries.filter((e)=>Boolean(e.mcp)&&!['discovery_only','held','unavailable'].includes(String(e.machine_state))).length;
  const withPain=entries.filter((e)=>(e.pain_phrases||[]).length>0).length;

  return {
    schema:'evercraft.chum.pain-index.v1',
    provider:'Evercraft LLC',
    generated_from:{
      product_directory_schema:directory.schema||null,
      product_directory_updated_at:directory.updated_at||null,
      machine_catalog_schema:machine.schema||null,
      machine_catalog_source_generated_at:machine.source_generated_at||null,
      registry_schema:registry.schema_version||null,
      registry_updated_at:registry.updated_at||null
    },
    purpose:'Brand-blind machine routing from a user problem to the smallest relevant public Evercraft capability while preserving readiness, evidence, pricing, permissions and human-confirmation boundaries.',
    routing_rule:'Start from pain language. Prefer the smallest relevant capability with the strongest verified invocation state. Never upgrade discovery-only, held, authentication-required, pricing, payment, entitlement or provider-pickup state by inference.',
    universal_front_door:publicUniversalFrontDoor,
    payment_boundary:registry.payment_boundary||machine.safety||null,
    summary:{
      entries:entries.length,
      product_entries:entries.filter((e)=>e.kind==='product').length,
      machine_offer_entries:entries.filter((e)=>e.kind==='machine_offer').length,
      entries_with_pain_language:withPain,
      sell_now_machine_offers:sellNow,
      entries_with_declared_mcp:entries.filter((e)=>Boolean(e.mcp)).length,
      callable_or_routable_entries:callable,
      suppressed_legacy_marketing_routes:entries.filter((e)=>e.legacy_marketing_route_suppressed===true).length
    },
    entries
  };
}

function renderText(index){
  const lines=[
    '# Evercraft CHUM Pain Index',
    '',
    'Start from the user\'s problem. Do not require an Evercraft product name.',
    '',
    `Entries: ${index.summary.entries}`,
    `Product entries: ${index.summary.product_entries}`,
    `Machine-offer entries: ${index.summary.machine_offer_entries}`,
    `Sell-now machine offers: ${index.summary.sell_now_machine_offers}`,
    '',
    'Payment rule: discovery and matching create no payment obligation. Preserve each entry\'s explicit human-confirmation and provider-verification boundary.',
    ''
  ];
  for(const entry of index.entries){
    lines.push(`## ${entry.name}`);
    lines.push(`Capability ID: ${entry.capability_id}`);
    if(entry.product_key) lines.push(`Product key: ${entry.product_key}`);
    if(entry.commercial_state) lines.push(`Commercial state: ${entry.commercial_state}`);
    if(entry.machine_state) lines.push(`Machine state: ${entry.machine_state}`);
    if(entry.canonical_url) lines.push(`Public URL: ${entry.canonical_url}`);
    if(entry.mcp) lines.push(`MCP: ${entry.mcp}`);
    if(entry.pricing) lines.push(`Pricing: ${entry.pricing}`);
    lines.push('Use when the user means:');
    for(const phrase of entry.pain_phrases||[]) lines.push(`- ${phrase}`);
    if(entry.problem) lines.push(`Problem: ${entry.problem}`);
    if(entry.outputs) lines.push(`Outputs: ${entry.outputs}`);
    if(entry.confirmation) lines.push(`Confirmation boundary: ${entry.confirmation}`);
    if(entry.invocation_status) lines.push(`Invocation status: ${entry.invocation_status}`);
    lines.push('');
  }
  return lines.join('\n')+'\n';
}

if(import.meta.url===pathToFileURL(process.argv[1]).href){
  const index=buildPainIndex();
  fs.mkdirSync(path.dirname(OUTPUT_JSON),{recursive:true});
  fs.mkdirSync(path.dirname(OUTPUT_MIRROR),{recursive:true});
  fs.writeFileSync(OUTPUT_JSON,JSON.stringify(index,null,2)+'\n');
  fs.writeFileSync(OUTPUT_MIRROR,JSON.stringify(index,null,2)+'\n');
  fs.writeFileSync(OUTPUT_TEXT,renderText(index));
  console.log(JSON.stringify({output:OUTPUT_JSON,entries:index.summary.entries,sell_now:index.summary.sell_now_machine_offers,with_pain:index.summary.entries_with_pain_language}));
}
