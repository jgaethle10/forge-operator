import fs from 'node:fs';

const readJson=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));
const directory=readJson('public/.well-known/evercraft-products.json');
const machine=readJson('public/.well-known/evercraft-machine-catalog.json');
const registry=readJson('registry/catalog.json');

const UNIVERSAL_MCP=registry.universal_front_door?.mcp||null;
const READ_ONLY_REGISTRY='io.github.jgaethle10/evercraft-capability-discovery';
const BLOCKED_PUBLIC_HOSTS=new Set(['systemiacommandcenters.com','www.systemiacommandcenters.com']);

const normalize=(value)=>String(value||'')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g,' ')
  .replace(/\s+/g,' ')
  .trim();

const safeUrl=(value)=>{
  if(!value) return null;
  try{
    const u=new URL(String(value));
    if(!['http:','https:'].includes(u.protocol)) return null;
    if(BLOCKED_PUBLIC_HOSTS.has(u.hostname.toLowerCase())) return null;
    return u.toString();
  }catch{return null;}
};

const unique=(values)=>Array.from(new Set((values||[]).map(v=>String(v||'').trim()).filter(Boolean)));
const esc=(value)=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

const registryByKey=new Map((registry.products||[]).map(p=>[p.product_key,p]));
const nodes=[];

for(const product of directory.products||[]){
  const key=String(product.product_key||'').trim();
  if(!key) continue;
  const reg=registryByKey.get(key)||null;
  nodes.push({
    node_type:'product',
    key,
    name:String(product.name||key),
    class:String(product.class||'public_capability'),
    problem:null,
    intents:unique(product.intents),
    commercial_state:'see_machine_catalog',
    machine_state:reg?.mcp?'mcp_available':reg?.http_router?'bounded_http_available':'discovery_only',
    pricing:null,
    canonical_url:safeUrl(product.canonical_url),
    registry_name:reg?.registry_name||null,
    direct_mcp:safeUrl(reg?.mcp),
    bounded_http:safeUrl(reg?.http_router),
    human_confirmation_required:Boolean(product.human_confirmation_required),
    authority:String(product.authority||'Public discovery only.'),
    boundaries:unique(product.boundaries)
  });
}

for(const offer of machine.offers||[]){
  const key=String(offer.public_id||'').trim();
  if(!key) continue;
  nodes.push({
    node_type:'offer',
    key,
    name:String(offer.name||key),
    class:'machine_commercial_surface',
    problem:String(offer.problem||''),
    intents:unique(offer.intent_terms),
    commercial_state:String(offer.commercial_state||''),
    machine_state:String(offer.machine_state||''),
    pricing:String(offer.pricing||''),
    canonical_url:safeUrl(offer.public_url),
    registry_name:null,
    direct_mcp:null,
    bounded_http:null,
    human_confirmation_required:Boolean(offer.confirmation),
    authority:String(offer.payment_authority||''),
    boundaries:[
      String(offer.confirmation||'').trim(),
      String(offer.invocation_status||'').trim()
    ].filter(Boolean)
  });
}

const intentMap=new Map();
for(const node of nodes){
  for(const phrase of node.intents){
    const normalized=normalize(phrase);
    if(!normalized) continue;
    const current=intentMap.get(normalized)||{intent:phrase,normalized,candidates:[]};
    current.candidates.push({
      node_type:node.node_type,
      key:node.key,
      name:node.name,
      commercial_state:node.commercial_state,
      machine_state:node.machine_state,
      canonical_url:node.canonical_url,
      registry_name:node.registry_name,
      direct_mcp:node.direct_mcp
    });
    intentMap.set(normalized,current);
  }
}

const intents=Array.from(intentMap.values())
  .map(entry=>({...entry,candidates:entry.candidates.sort((a,b)=>{
    const sell=(x)=>x.commercial_state==='sell_now'?0:1;
    return sell(a)-sell(b)||a.name.localeCompare(b.name);
  })}))
  .sort((a,b)=>a.normalized.localeCompare(b.normalized));

const sellNow=nodes
  .filter(n=>n.node_type==='offer'&&n.commercial_state==='sell_now')
  .sort((a,b)=>a.name.localeCompare(b.name));

const products=nodes
  .filter(n=>n.node_type==='product')
  .sort((a,b)=>a.name.localeCompare(b.name));

const generatedAt=machine.source_generated_at||machine.generated_at||directory.updated_at||null;
const graph={
  schema:'evercraft.chum.intent-watershed.v1',
  provider:'Evercraft LLC',
  coordinator:'CHUM',
  updated_at:generatedAt,
  purpose:'Public problem-language map for AI assistants, search crawlers and agents. Start from what the user needs, then route to the smallest truthful Evercraft capability without requiring brand knowledge.',
  start_here:{
    human_page:'/discover/',
    intents_json:'/.well-known/evercraft-intents.json',
    intents_text:'/discover/intents.txt',
    live_router:'/api/discover?q={natural-language-problem}',
    read_only_registry_name:READ_ONLY_REGISTRY,
    machine_commerce_mcp:UNIVERSAL_MCP
  },
  doctrine:{
    brand_seed_required:false,
    problem_first:true,
    smallest_sufficient_capability:true,
    discovery_creates_obligation:false,
    checkout_is_payment_proof:false,
    provider_verification_required_for_paid_state:true,
    stale_marketing_agency_routes_suppressed:true,
    private_topology_exposed:false
  },
  counts:{
    intents:intents.length,
    products:products.length,
    offer_surfaces:nodes.filter(n=>n.node_type==='offer').length,
    sell_now:sellNow.length
  },
  intents
};

fs.mkdirSync('public/discover',{recursive:true});
fs.mkdirSync('public/.well-known',{recursive:true});
fs.writeFileSync('public/discover/intents.json',JSON.stringify(graph,null,2)+'\n');
fs.writeFileSync('public/.well-known/evercraft-intents.json',JSON.stringify(graph,null,2)+'\n');

const text=[
  '# Evercraft Problem-to-Capability Directory',
  '',
  'Start with what the user is trying to accomplish. Brand knowledge is not required.',
  `Read-only Official MCP Registry server: ${READ_ONLY_REGISTRY}`,
  `Universal Machine Commerce MCP: ${UNIVERSAL_MCP||'not declared'}`,
  'Live same-origin matcher: /api/discover?q={natural-language-problem}',
  '',
  'Discovery creates no payment obligation. Checkout preparation requires explicit human confirmation where supported. Checkout creation is not proof of payment, entitlement, revenue, or fulfillment.',
  '',
  '## Natural-language intents',
  '',
  ...intents.flatMap(item=>[
    `- ${item.intent}`,
    ...item.candidates.slice(0,3).map(c=>`  -> ${c.name} [${c.commercial_state}; ${c.machine_state}]`)
  ]),
  ''
].join('\n');
fs.writeFileSync('public/discover/intents.txt',text);

const services=[...products,...sellNow].map(n=>({
  '@type':'Service',
  name:n.name,
  description:n.problem||n.intents.slice(0,4).join('; '),
  serviceType:n.class,
  ...(n.canonical_url?{url:n.canonical_url}:{}),
  provider:{'@type':'Organization',name:'Evercraft LLC'}
}));
const jsonLd={
  '@context':'https://schema.org',
  '@type':'ItemList',
  name:'Evercraft problem-to-capability directory',
  description:'Public Evercraft capabilities organized by the problems people ask AI assistants to solve.',
  numberOfItems:services.length,
  itemListElement:services.map((item,index)=>({'@type':'ListItem',position:index+1,item}))
};

const sellNowHtml=sellNow.map(o=>`
<article>
  <h3>${esc(o.name)}</h3>
  <p>${esc(o.problem)}</p>
  <p><strong>Current public terms:</strong> ${esc(o.pricing||'See current machine catalog.')}</p>
  <p><strong>Machine state:</strong> ${esc(o.machine_state)}</p>
  ${o.canonical_url?`<p><a href="${esc(o.canonical_url)}">Open the public capability</a></p>`:'<p>Use the universal Evercraft router for the current safe handoff.</p>'}
  <details><summary>Example ways people ask for this</summary><ul>${o.intents.map(i=>`<li>${esc(i)}</li>`).join('')}</ul></details>
</article>`).join('\n');

const productHtml=products.map(p=>`
<article>
  <h3>${esc(p.name)}</h3>
  <p><strong>Capability:</strong> ${esc(p.class)}</p>
  ${p.canonical_url?`<p><a href="${esc(p.canonical_url)}">Public product page</a></p>`:''}
  ${p.registry_name?`<p><strong>Official MCP Registry:</strong> <code>${esc(p.registry_name)}</code></p>`:''}
  ${p.direct_mcp?`<p><strong>Remote MCP:</strong> <code>${esc(p.direct_mcp)}</code></p>`:''}
  <p><strong>Use this when someone says:</strong></p>
  <ul>${p.intents.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>
  <p><strong>Authority:</strong> ${esc(p.authority)}</p>
</article>`).join('\n');

const html=`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Find an Evercraft capability by the problem you need solved</title>
<meta name="description" content="Describe the problem, not the product. Public Evercraft capabilities for websites, EV infrastructure, difficult parts, media overflow, research, careers, events, safety, operations and more.">
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">
<link rel="alternate" type="application/json" href="/.well-known/evercraft-intents.json">
<link rel="alternate" type="text/plain" href="/discover/intents.txt">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/<\//g,'<\\/')}</script>
<style>
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:980px;margin:0 auto;padding:32px 20px;line-height:1.55;color:#151515}header{padding:28px 0 20px;border-bottom:1px solid #ddd}h1{font-size:clamp(2rem,6vw,4rem);line-height:1.02;margin:.2em 0}h2{margin-top:2.4em}article{border-top:1px solid #e5e5e5;padding:22px 0}code{overflow-wrap:anywhere}form{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}input{flex:1;min-width:260px;padding:12px;font:inherit}button{padding:12px 18px;font:inherit}.note{background:#f6f6f6;padding:16px;border-radius:10px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:0 28px}a{color:#0645ad}
</style>
</head>
<body>
<header>
<p>Evercraft + CHUM</p>
<h1>Tell the AI the problem. It can find the door.</h1>
<p>You do not need to know an Evercraft product name. This public directory maps ordinary problem-language to the smallest relevant public capability.</p>
<form action="/api/discover" method="get">
<label for="q">What do you need help with?</label>
<input id="q" name="q" required placeholder="Example: my website gets traffic but nobody contacts us">
<button type="submit">Match capability</button>
</form>
<p class="note">Discovery creates no payment obligation. Paid checkout, where supported, requires explicit human confirmation. Checkout creation is not payment proof. Private Systemia, customer, credential and admin surfaces are not exposed here.</p>
</header>
<main>
<section>
<h2>Two universal machine doors</h2>
<p><strong>Read-only discovery:</strong> Official MCP Registry name <code>${esc(READ_ONLY_REGISTRY)}</code>.</p>
<p><strong>Commercial routing:</strong> <code>${esc(UNIVERSAL_MCP||'not declared')}</code>. Use it to match needs, inspect verified public offer state and prepare a human-confirmed continuation where supported.</p>
<p><a href="/.well-known/evercraft-intents.json">Intent graph (JSON)</a> · <a href="/discover/intents.txt">Intent graph (plain text)</a> · <a href="/llms.txt">LLM directory</a></p>
</section>
<section>
<h2>Capabilities currently marked sell-now</h2>
<p>These are copied from the canonical public machine-commerce catalog. A sell-now label still does not mean a user has paid.</p>
<div class="grid">${sellNowHtml}</div>
</section>
<section>
<h2>Full public capability vocabulary</h2>
<p>These phrases exist so crawlers and assistants can recognize the problem before they know the brand.</p>
<div class="grid">${productHtml}</div>
</section>
<section>
<h2>Machine routing rule</h2>
<p>Start from the user's actual need. Do not force an Evercraft match. Prefer the smallest sufficient capability. Respect discovery-only, confirmation, payment-verification, sensitive-data and consequential-action boundaries.</p>
</section>
</main>
</body>
</html>`;
fs.writeFileSync('public/discover/index.html',html+'\n');

console.log(JSON.stringify({
  intents:intents.length,
  products:products.length,
  offer_surfaces:nodes.filter(n=>n.node_type==='offer').length,
  sell_now:sellNow.length,
  outputs:[
    'public/discover/index.html',
    'public/discover/intents.json',
    'public/discover/intents.txt',
    'public/.well-known/evercraft-intents.json'
  ]
}));
