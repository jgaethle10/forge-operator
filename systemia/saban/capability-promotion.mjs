#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=process.cwd();
const readJson=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const clean=(v)=>String(v??'').trim();
const normUrl=(v)=>{
  try{
    const u=new URL(clean(v));
    u.hash='';
    return u.toString().replace(/\/$/,'');
  }catch{return clean(v).replace(/\/$/,'');}
};
const published=(state)=>clean(state).toLowerCase().startsWith('published');
const callableMachineState=(state)=>{
  const s=clean(state).toLowerCase();
  if(!s || s==='discovery_only' || s==='public_discovery_only') return false;
  return /(mcp|bounded_http|payment_ready|direct_checkout_ready|human_handoff_ready|read_only_mcp|http_preview|checkout_ready)/.test(s);
};
const severityRank={P0:0,P1:1,P2:2,P3:3};

export function buildCapabilityPromotionQueue({
  publicIndex,
  conformance,
  registryCatalog,
  machineCatalog,
  links
}){
  const products=Array.isArray(publicIndex?.products)?publicIndex.products:[];
  const confByKey=new Map((conformance?.products||[]).map(p=>[p.product_key,p]));
  const registryByKey=new Map((registryCatalog?.products||[]).map(p=>[p.product_key,p]));
  const offers=Array.isArray(machineCatalog?.offers)?machineCatalog.offers:[];
  const offersById=new Map(offers.map(o=>[o.public_id,o]));
  const explicit=new Map((links?.links||[]).map(row=>[row.product_key,row]));

  const offerByExactUrl=new Map();
  for(const offer of offers){
    const url=normUrl(offer.public_url);
    if(!url) continue;
    if(!offerByExactUrl.has(url)) offerByExactUrl.set(url,[]);
    offerByExactUrl.get(url).push(offer);
  }

  const rows=[];
  for(const product of products){
    const key=clean(product.product_key);
    const mode=clean(product?.invocation?.mode)||'discovery_only';
    const conf=confByKey.get(key)||null;
    const registry=registryByKey.get(key)||null;

    let offer=null;
    let match_basis=null;
    const linked=explicit.get(key);
    if(linked?.machine_public_id && offersById.has(linked.machine_public_id)){
      offer=offersById.get(linked.machine_public_id);
      match_basis='explicit_public_link';
    }else if(conf?.machine_commerce_public_id && offersById.has(conf.machine_commerce_public_id)){
      offer=offersById.get(conf.machine_commerce_public_id);
      match_basis='conformance_public_id';
    }else{
      const exact=offerByExactUrl.get(normUrl(product.canonical_url))||[];
      if(exact.length===1){
        offer=exact[0];
        match_basis='exact_public_url';
      }
    }

    const confRegistryPublished=published(conf?.mcp_registry?.publication_state);

    let state='discovery_only_no_machine_offer';
    let priority='P3';
    let next_action='Keep discovery-only until a bounded public execution contract is proven.';

    if(mode==='mcp'){
      state='mcp_live';
      priority='P3';
      next_action='Maintain canary, registry, conformance and truth-boundary coverage.';
    }else if(mode==='bounded_http'){
      state='bounded_http_live';
      priority='P3';
      next_action='Maintain bounded HTTP canary and consider MCP only when it improves routing without expanding authority.';
    }else{
      const registryMcp=clean(registry?.mcp);
      if(registryMcp || confRegistryPublished){
        state='repairable_binding_drift';
        priority='P0';
        next_action='Reconcile the public product index from current registry/conformance truth. Do not invent a new endpoint.';
      }else if(offer && callableMachineState(offer.machine_state)){
        state='callable_evidence_needs_binding_or_conformance';
        priority='P1';
        next_action='Verify product-specific tool execution and authority boundary, record conformance, then bind to an existing published MCP or approved bounded HTTP route.';
      }else if(offer){
        state='machine_discovery_only';
        priority='P2';
        next_action='Build or prove one genuinely useful bounded execution primitive before promotion. Machine discovery alone is not callable authority.';
      }
    }

    rows.push({
      product_key:key,
      name:product.name,
      current_mode:mode,
      state,
      priority,
      canonical_url:product.canonical_url,
      machine_public_id:offer?.public_id||null,
      machine_state:offer?.machine_state||null,
      machine_public_url:offer?.public_url||null,
      match_basis,
      promotion_evidence: linked?.evidence || null,
      required_next_primitive: linked?.required_next_primitive || null,
      conformance_present:Boolean(conf),
      registry_binding_present:Boolean(clean(registry?.mcp)),
      published_shared_or_direct_registry:Boolean(confRegistryPublished || mode==='mcp'),
      next_action
    });
  }

  rows.sort((a,b)=>
    severityRank[a.priority]-severityRank[b.priority] ||
    a.state.localeCompare(b.state) ||
    a.product_key.localeCompare(b.product_key)
  );

  const counts=rows.reduce((acc,row)=>{
    acc[row.state]=(acc[row.state]||0)+1;
    return acc;
  },{});

  return {
    schema:'evercraft.capability-promotion-queue.v1',
    generated_at:new Date().toISOString(),
    doctrine:{
      inventory_is_not_publication:true,
      machine_discovery_is_not_execution:true,
      never_invent_endpoints:true,
      public_execution_requires_conformance:true,
      private_or_admin_functions_never_become_public_by_inference:true,
      payment_and_production_authority_never_expand_during_promotion:true
    },
    summary:{
      public_products:products.length,
      mcp_live:counts.mcp_live||0,
      bounded_http_live:counts.bounded_http_live||0,
      repairable_binding_drift:counts.repairable_binding_drift||0,
      callable_evidence_needs_binding_or_conformance:counts.callable_evidence_needs_binding_or_conformance||0,
      machine_discovery_only:counts.machine_discovery_only||0,
      discovery_only_no_machine_offer:counts.discovery_only_no_machine_offer||0
    },
    queue:rows
  };
}

const isCli=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isCli){
  const outArg=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'artifacts/capability-promotion/latest.json';
  const report=buildCapabilityPromotionQueue({
    publicIndex:readJson('registry/public-products.json'),
    conformance:readJson('conformance/products.json'),
    registryCatalog:readJson('registry/catalog.json'),
    machineCatalog:readJson('public/.well-known/evercraft-machine-catalog.json'),
    links:readJson('systemia/saban/capability-promotion-links.json')
  });
  const out=path.resolve(outArg);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report.summary));
  if(process.argv.includes('--fail-drift') && report.summary.repairable_binding_drift>0){
    throw new Error('capability_promotion_binding_drift:'+report.summary.repairable_binding_drift);
  }
}
