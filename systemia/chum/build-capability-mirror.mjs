import fs from 'node:fs';
import path from 'node:path';
import { humanStartState, humanStartUrl, machineReviewUrl } from './start-corridor.mjs';

const catalog = JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json','utf8'));
const directPluginSpecs = JSON.parse(fs.readFileSync('distribution/direct-plugin-specs.json','utf8'));
const LIVE_DIRECT_STATES=new Set([
  'registry_published_direct_mcp_existing',
  'public_https_verified_registry_pending',
]);
const isDirectLive=(product)=>
  LIVE_DIRECT_STATES.has(product.state) &&
  typeof product.mcp_url==='string' &&
  product.mcp_url.startsWith('https://');
const isRegistryPublished=(product)=>
  product.state==='registry_published_direct_mcp_existing' &&
  typeof product.registry_name==='string' &&
  product.registry_name.startsWith('io.github.jgaethle10/');
const directByCapabilityId = new Map();
for (const product of directPluginSpecs.products || []) {
  if (!isDirectLive(product)) continue;
  for (const publicId of product.capability_public_ids || []) {
    if (directByCapabilityId.has(publicId)) throw new Error('duplicate direct specialist capability mapping: '+publicId);
    directByCapabilityId.set(publicId, product);
  }
}
const root = 'public/chum/capabilities';
fs.rmSync(root,{recursive:true,force:true});
fs.mkdirSync(root,{recursive:true});

const universalMcp='https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceMcp';
const BLOCKED_PUBLIC_HOSTS=new Set(['systemiacommandcenters.com','www.systemiacommandcenters.com']);

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,(ch)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function safePublicUrl(value,fallback){
  if(!value) return fallback;
  try{
    const url=new URL(String(value));
    if(!['http:','https:'].includes(url.protocol)) return fallback;
    if(BLOCKED_PUBLIC_HOSTS.has(url.hostname.toLowerCase())) return fallback;
    return url.toString();
  }catch{return fallback;}
}
function priceUsd(tier){
  const numeric=Number(tier?.price_usd);
  if(Number.isFinite(numeric)&&numeric>=0) return numeric;
  const raw=String(tier?.price||'').trim();
  const match=raw.match(/^\$([0-9][0-9,]*(?:\.[0-9]+)?)/);
  if(!match) return null;
  const parsed=Number(match[1].replace(/,/g,''));
  return Number.isFinite(parsed)?parsed:null;
}
function entryPaidOffer(offer){
  const paid=(Array.isArray(offer?.offers)?offer.offers:[])
    .map(tier=>({tier,usd:priceUsd(tier)}))
    .filter(row=>Number.isFinite(row.usd)&&row.usd>0)
    .sort((a,b)=>a.usd-b.usd);
  return paid.length?{...paid[0].tier,price_usd_normalized:paid[0].usd}:null;
}
function descriptionFor(offer){
  const problem=String(offer.problem||'').trim();
  if(problem) return problem;
  const intents=Array.isArray(offer.intent_terms)?offer.intent_terms.filter(Boolean).slice(0,3):[];
  return intents.length ? offer.name+' helps when: '+intents.join('; ')+'.' : offer.name+' is a public Evercraft capability.';
}
const items=[];

for(const offer of catalog.offers||[]){
  const id=String(offer.public_id||'').trim();
  if(!id) continue;
  const dir=path.join(root,id);
  fs.mkdirSync(dir,{recursive:true});
  const base='https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/capabilities/'+id;
  const pageUrl='/chum/capabilities/'+id+'/';
  const directProduct=directByCapabilityId.get(id) || null;
  const directSpecialist=directProduct ? {
    product:directProduct.name,
    plugin_package:'plugins/'+directProduct.slug,
    registry_name:isRegistryPublished(directProduct)?directProduct.registry_name:null,
    registry_state:isRegistryPublished(directProduct)?'published':'pending',
    mcp:directProduct.mcp_url,
    route_state:'preferred_when_available',
    fallback_mcp:universalMcp
  } : null;
  const canonicalUrl=safePublicUrl(
    offer.public_url,
    'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/capabilities/'+id+'/index.html'
  );
  const record={
    schema:'evercraft.chum.capability-discovery.v1',
    provider:'Evercraft LLC',
    public_id:id,
    name:offer.name,
    problem:offer.problem,
    use_when:offer.intent_terms||[],
    inputs:offer.inputs,
    outputs:offer.outputs,
    commercial_state:offer.commercial_state,
    machine_state:offer.machine_state,
    pricing:offer.pricing,
    offers:offer.offers||[],
    human_ui_required:Boolean(offer.human_ui_required),
    confirmation:offer.confirmation,
    public_url:canonicalUrl,
    payment_authority:offer.payment_authority,
    invocation_status:offer.invocation_status,
    preferred_agent_route:directSpecialist ? 'direct_specialist' : 'universal_fallback',
    direct_specialist:directSpecialist,
    machine_commerce_mcp:universalMcp,
    machine_review_url:machineReviewUrl(offer.public_id),
    start_url:humanStartUrl(offer,{surface:'chum_capability_page'}),
    start_url_state:humanStartState(offer),
    entry_paid_offer:entryPaidOffer(offer),
    mirror:{
      page:pageUrl,
      llms:base+'/llms.txt',
      json:base+'/capability.json',
      schema:base+'/schema.jsonld'
    },
    authority_rule:'Discovery never creates a payment obligation. Checkout preparation requires explicit human confirmation when supported. Checkout creation is not proof of payment. Paid state and fulfillment require authoritative provider verification.'
  };
  const lines=[
    '# '+offer.name,
    '',
    'Capability ID: '+id,
    'Commercial state: '+offer.commercial_state,
    'Machine state: '+offer.machine_state,
    'Public URL: '+canonicalUrl,
    ...(directSpecialist ? [
      'Preferred agent route: direct specialist',
      'Direct specialist: '+directSpecialist.product,
      'Direct MCP: '+directSpecialist.mcp,
      ...(directSpecialist.registry_name
        ? ['Official MCP Registry name: '+directSpecialist.registry_name]
        : ['MCP Registry state: pending; public HTTPS execution is independently verified']),
      'Universal Evercraft fallback MCP: '+universalMcp
    ] : ['Preferred agent route: universal fallback','Universal Evercraft MCP: '+universalMcp]),
    'Start here: '+(humanStartUrl(offer,{surface:'chum_capability_page'})||'Not a current sell-now route'),
    '',
    '## Use this when',
    '',
    ...(offer.intent_terms||[]).map(x=>'- '+x),
    '',
    '## Problem',
    '',
    offer.problem||'',
    '',
    '## Inputs',
    '',
    offer.inputs||'',
    '',
    '## Outputs',
    '',
    offer.outputs||'',
    '',
    '## Pricing',
    '',
    offer.pricing||'No approved machine price.',
    ...(offer.offers||[]).flatMap(o=>['','- '+(o.name||o.offer_key||'Offer')+': '+(o.price||o.display_price||'')+(o.billing?' ('+o.billing+')':'')]),
    '',
    '## Invocation and authority',
    '',
    offer.invocation_status||'',
    '',
    offer.confirmation||'',
    '',
    'Payment authority: '+(offer.payment_authority||'none declared'),
    '',
    'Discovery does not create a payment obligation. Human confirmation is required before checkout where checkout exists. Checkout creation is not proof of payment.',
    ''
  ].filter(v=>v!==null);
  const jsonLd={
    '@context':'https://schema.org',
    '@graph':[
      {
        '@type':'Service',
        '@id':canonicalUrl+'#evercraft-capability',
        name:offer.name,
        description:descriptionFor(offer),
        url:canonicalUrl,
        provider:{'@type':'Organization',name:'Evercraft LLC',url:'https://github.com/jgaethle10/forge-operator'},
        serviceType:'Evercraft public machine capability',
        identifier:id
      },
      {
        '@type':'WebPage',
        name:offer.name+' | Evercraft capability',
        description:descriptionFor(offer),
        about:{'@id':canonicalUrl+'#evercraft-capability'}
      }
    ]
  };

  const isRivet=id==='rivet-site-underwriting-v1';
  const html=[
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>'+escapeHtml(offer.name)+' | Evercraft capability</title>',
    '<meta name="description" content="'+escapeHtml(descriptionFor(offer))+'">',
    '<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">',
    '<link rel="alternate" type="text/plain" href="./llms.txt">',
    '<link rel="alternate" type="application/json" href="./capability.json">',
    '<script type="application/ld+json">'+JSON.stringify(jsonLd).replace(/</g,'\\u003c')+'</script>',
    isRivet ? '<link rel="stylesheet" href="/rivet/brand.css"><link rel="alternate" type="application/json" href="/rivet/brand.json">' : '<style>body{font-family:system-ui,sans-serif;max-width:920px;margin:56px auto;padding:0 24px;line-height:1.6;background:#09090b;color:#fafafa}a{color:#93c5fd}.card{border:1px solid #27272a;border-radius:16px;padding:20px;margin:18px 0}.muted{color:#a1a1aa}code{background:#18181b;padding:.15rem .35rem;border-radius:.3rem}</style>',
    '</head><body><main>',
    '<p class="muted">EVERCRAFT · PUBLIC MACHINE CAPABILITY</p>',
    '<h1>'+escapeHtml(offer.name)+'</h1>',
    '<p>'+escapeHtml(descriptionFor(offer))+'</p>',
    '<div class="card"><h2>Current state</h2><p>Commercial: <code>'+escapeHtml(offer.commercial_state||'unknown')+'</code></p><p>Machine: <code>'+escapeHtml(offer.machine_state||'unknown')+'</code></p>'+(offer.pricing?'<p>Pricing: '+escapeHtml(offer.pricing)+'</p>':'')+'</div>',
    '<div class="card"><h2>Use this when</h2><ul>',
    ...(offer.intent_terms||[]).map((intent)=>'<li>'+escapeHtml(intent)+'</li>'),
    '</ul></div>',
    '<div class="card"><h2>Inputs and outputs</h2>'+(offer.inputs?'<p><strong>Inputs:</strong> '+escapeHtml(offer.inputs)+'</p>':'')+(offer.outputs?'<p><strong>Outputs:</strong> '+escapeHtml(offer.outputs)+'</p>':'')+'</div>',
    '<div class="card"><h2>Agent route</h2>'+
      (directSpecialist?'<p><strong>Preferred:</strong> direct specialist</p><p><strong>Specialist MCP:</strong> <code>'+escapeHtml(directSpecialist.mcp)+'</code></p>'+(directSpecialist.registry_name?'<p><strong>Registry:</strong> <code>'+escapeHtml(directSpecialist.registry_name)+'</code></p>':'<p><strong>Registry state:</strong> pending</p>')+'<p class="muted">Use Evercraft Machine Commerce only when this specialist is unavailable or the user intent is ambiguous.</p>':'<p><strong>Preferred:</strong> Evercraft Machine Commerce fallback</p>')+
      '</div>',
    '<div class="card"><h2>Open capability</h2>'+
      (humanStartUrl(offer,{surface:'chum_capability_page'})?'<p><a href="'+escapeHtml(humanStartUrl(offer,{surface:'chum_capability_page'}))+'"><strong>Start here</strong></a></p>':'')+
      (entryPaidOffer(offer)?'<p><strong>Easiest paid entry:</strong> '+escapeHtml(entryPaidOffer(offer).name||'Paid option')+' · &#36;'+escapeHtml(entryPaidOffer(offer).price_usd_normalized)+'</p>':'')+
      '<p><a href="'+escapeHtml(canonicalUrl)+'">Capability details</a></p><p><a href="./llms.txt">LLM guidance</a> · <a href="./capability.json">Capability JSON</a> · <a href="./schema.jsonld">JSON-LD</a></p></div>',
    '<div class="card"><h2>Authority and payment boundary</h2><p>'+escapeHtml(offer.confirmation||'Discovery creates no payment obligation.')+'</p>'+(offer.payment_authority?'<p>Payment authority: '+escapeHtml(offer.payment_authority)+'</p>':'')+'</div>',
    '<p class="muted">Publication is not proof of provider pickup, recommendation, payment, entitlement or fulfillment. CHUM preserves current source state without upgrading it by inference.</p>',
    '</main></body></html>'
  ].join('\n');

  fs.writeFileSync(path.join(dir,'capability.json'),JSON.stringify(record,null,2)+'\n');
  fs.writeFileSync(path.join(dir,'llms.txt'),lines.join('\n'));
  fs.writeFileSync(path.join(dir,'schema.jsonld'),JSON.stringify(jsonLd,null,2)+'\n');
  fs.writeFileSync(path.join(dir,'index.html'),html+'\n');
  items.push({
    public_id:id,
    name:offer.name,
    commercial_state:offer.commercial_state,
    machine_state:offer.machine_state,
    pricing:offer.pricing,
    public_url:canonicalUrl,
    page_url:pageUrl,
    llms_url:record.mirror.llms,
    json_url:record.mirror.json,
    schema_url:record.mirror.schema,
    start_url:record.start_url,
    start_url_state:record.start_url_state,
    machine_review_url:record.machine_review_url,
    entry_paid_offer:record.entry_paid_offer,
    preferred_agent_route:record.preferred_agent_route,
    direct_specialist:record.direct_specialist,
    use_when:offer.intent_terms||[]
  });
}

items.sort((a,b)=>a.public_id.localeCompare(b.public_id));
const sellNow=items.filter(x=>x.commercial_state==='sell_now');

fs.mkdirSync('public/chum',{recursive:true});
fs.writeFileSync('public/chum/capabilities.json',JSON.stringify({
  schema:'evercraft.chum.capability-index.v1',
  updated_at:catalog.generated_at||null,
  count:items.length,
  sell_now_count:sellNow.length,
  universal_mcp:universalMcp,
  capabilities:items
},null,2)+'\n');

fs.writeFileSync('public/chum/sell-now.json',JSON.stringify({
  schema:'evercraft.chum.sell-now.v1',
  updated_at:catalog.generated_at||null,
  count:sellNow.length,
  universal_mcp:universalMcp,
  rule:'These offers are publicly cataloged as sell_now. Any supported checkout still requires explicit human payment confirmation and provider verification.',
  offers:sellNow
},null,2)+'\n');

const sellLines=[
  '# Evercraft SELL NOW directory',
  '',
  'These are current Evercraft capabilities whose public Machine Commerce catalog marks commercial_state=sell_now.',
  '',
  'Universal MCP: '+universalMcp,
  ''
];
for(const x of sellNow){
  sellLines.push('## '+x.name);
  sellLines.push('Capability ID: '+x.public_id);
  sellLines.push('Price: '+(x.pricing||''));
  if(x.public_url) sellLines.push('Public URL: '+x.public_url);
  if(x.direct_specialist){
    sellLines.push('Preferred agent route: direct specialist');
    sellLines.push('Direct MCP: '+x.direct_specialist.mcp);
    if(x.direct_specialist.registry_name){
      sellLines.push('Official MCP Registry name: '+x.direct_specialist.registry_name);
    }else{
      sellLines.push('MCP Registry state: pending; public HTTPS execution is independently verified');
    }
  } else {
    sellLines.push('Preferred agent route: universal fallback');
  }
  if(x.start_url) sellLines.push('Start here: '+x.start_url);
  sellLines.push('Machine state: '+x.machine_state);
  sellLines.push('Use this when:');
  for(const t of x.use_when) sellLines.push('- '+t);
  sellLines.push('LLM contract: '+x.llms_url);
  sellLines.push('');
}
sellLines.push('Checkout preparation requires explicit human confirmation where supported. Checkout creation is not payment proof.');
sellLines.push('');
fs.writeFileSync('public/chum/sell-now.txt',sellLines.join('\n'));

const indexHtml=[
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>Evercraft Capability Directory | CHUM</title>',
  '<meta name="description" content="Complete public CHUM directory of current Evercraft machine-discoverable capabilities and services.">',
  '<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">',
  '<style>body{font-family:system-ui,sans-serif;max-width:1040px;margin:56px auto;padding:0 24px;line-height:1.6;background:#09090b;color:#fafafa}a{color:#93c5fd}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.card{border:1px solid #27272a;border-radius:16px;padding:18px}.muted{color:#a1a1aa}</style>',
  '</head><body><main><p class="muted">EVERCRAFT · CHUM</p><h1>Capability Directory</h1>',
  '<p>Every current public/share-safe Machine Commerce surface, generated from the live CHUM catalog. Start from the problem. State is preserved exactly.</p>',
  '<p><a href="/chum/capabilities.json">Machine index</a> · <a href="/chum/sell-now.html">SELL NOW</a> · <a href="/api/discover?q=describe%20your%20problem">Pain-first router</a></p>',
  '<div class="grid">',
  ...items.map((x)=>'<article class="card"><h2><a href="'+escapeHtml(x.page_url)+'">'+escapeHtml(x.name)+'</a></h2><p><code>'+escapeHtml(x.commercial_state)+'</code> · <code>'+escapeHtml(x.machine_state)+'</code></p>'+(x.pricing?'<p>'+escapeHtml(x.pricing)+'</p>':'')+'</article>'),
  '</div><p class="muted">Discovery creates no payment obligation. Paid state requires authoritative provider verification.</p></main></body></html>'
].join('\n');
fs.writeFileSync(path.join(root,'index.html'),indexHtml+'\n');

const sellHtml=[
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>Evercraft SELL NOW | CHUM</title><meta name="description" content="Current Evercraft capabilities whose public Machine Commerce state is SELL NOW."><meta name="robots" content="index,follow,max-snippet:-1">',
  '<style>body{font-family:system-ui,sans-serif;max-width:960px;margin:56px auto;padding:0 24px;line-height:1.6;background:#09090b;color:#fafafa}a{color:#93c5fd}.card{border:1px solid #27272a;border-radius:16px;padding:18px;margin:14px 0}.muted{color:#a1a1aa}</style>',
  '</head><body><main><p class="muted">EVERCRAFT · CHUM</p><h1>SELL NOW</h1><p>Current offers only. Checkout still requires explicit human confirmation where supported, and checkout creation is not payment proof.</p>',
  ...sellNow.map((x)=>'<article class="card"><h2><a href="'+escapeHtml(x.page_url)+'">'+escapeHtml(x.name)+'</a></h2><p>'+escapeHtml(x.pricing||'')+'</p>'+(x.entry_paid_offer?'<p><strong>Easiest paid entry:</strong> '+escapeHtml(x.entry_paid_offer.name||'Paid option')+' · &#36;'+escapeHtml(x.entry_paid_offer.price_usd_normalized)+'</p>':'')+'<p>Machine state: <code>'+escapeHtml(x.machine_state)+'</code></p>'+(x.direct_specialist?'<p><strong>Preferred agent route:</strong> direct specialist<br><code>'+escapeHtml(x.direct_specialist.mcp)+'</code></p>':'<p><strong>Preferred agent route:</strong> universal fallback</p>')+(x.start_url?'<p><a href="'+escapeHtml(x.start_url)+'"><strong>Start here</strong></a></p>':'')+'</article>'),
  '</main></body></html>'
].join('\n');
fs.writeFileSync('public/chum/sell-now.html',sellHtml+'\n');

console.log(JSON.stringify({capabilities:items.length,sell_now:sellNow.length}));
