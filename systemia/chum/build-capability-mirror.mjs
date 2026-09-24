import fs from 'node:fs';
import path from 'node:path';

const catalog = JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json','utf8'));
const root = 'public/chum/capabilities';
fs.rmSync(root,{recursive:true,force:true});
fs.mkdirSync(root,{recursive:true});

const universalMcp='https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceMcp';
const items=[];

for(const offer of catalog.offers||[]){
  const id=String(offer.public_id||'').trim();
  if(!id) continue;
  const dir=path.join(root,id);
  fs.mkdirSync(dir,{recursive:true});
  const base='https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/capabilities/'+id;
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
    public_url:offer.public_url||null,
    payment_authority:offer.payment_authority,
    invocation_status:offer.invocation_status,
    machine_commerce_mcp:universalMcp,
    mirror:{
      llms:base+'/llms.txt',
      json:base+'/capability.json'
    },
    authority_rule:'Discovery never creates a payment obligation. Checkout preparation requires explicit human confirmation when supported. Checkout creation is not proof of payment. Paid state and fulfillment require authoritative provider verification.'
  };
  const lines=[
    '# '+offer.name,
    '',
    'Capability ID: '+id,
    'Commercial state: '+offer.commercial_state,
    'Machine state: '+offer.machine_state,
    offer.public_url?'Public URL: '+offer.public_url:null,
    'Universal Evercraft MCP: '+universalMcp,
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
  fs.writeFileSync(path.join(dir,'capability.json'),JSON.stringify(record,null,2)+'\n');
  fs.writeFileSync(path.join(dir,'llms.txt'),lines.join('\n'));
  items.push({
    public_id:id,
    name:offer.name,
    commercial_state:offer.commercial_state,
    machine_state:offer.machine_state,
    pricing:offer.pricing,
    public_url:offer.public_url||null,
    llms_url:record.mirror.llms,
    json_url:record.mirror.json,
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
  sellLines.push('Machine state: '+x.machine_state);
  sellLines.push('Use this when:');
  for(const t of x.use_when) sellLines.push('- '+t);
  sellLines.push('LLM contract: '+x.llms_url);
  sellLines.push('');
}
sellLines.push('Checkout preparation requires explicit human confirmation where supported. Checkout creation is not payment proof.');
sellLines.push('');
fs.writeFileSync('public/chum/sell-now.txt',sellLines.join('\n'));

console.log(JSON.stringify({capabilities:items.length,sell_now:sellNow.length}));
