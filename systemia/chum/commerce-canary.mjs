import fs from 'node:fs';

const catalog=JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json','utf8'));
const gateway='https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway';
const timeoutMs=15000;

function containsId(value,expected,depth=0){
  if(depth>8||value==null) return false;
  if(typeof value==='string') return value===expected;
  if(Array.isArray(value)) return value.some(v=>containsId(v,expected,depth+1));
  if(typeof value==='object') return Object.values(value).some(v=>containsId(v,expected,depth+1));
  return false;
}

async function getJson(url){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(url,{
      method:'GET',
      redirect:'follow',
      headers:{accept:'application/json','user-agent':'Evercraft-CHUM-CommerceCanary/1.0'},
      signal:controller.signal
    });
    const text=await r.text();
    let json=null;
    let parse_error=null;
    try{json=JSON.parse(text);}catch(error){parse_error=error instanceof Error?error.message:String(error);}
    return {
      ok:r.ok,
      status:r.status,
      final_url:r.url,
      content_type:r.headers.get('content-type')||'',
      bytes:Buffer.byteLength(text),
      json,
      parse_error
    };
  }catch(error){
    return {ok:false,status:0,final_url:url,content_type:'',bytes:0,json:null,parse_error:error instanceof Error?error.message:String(error)};
  }finally{
    clearTimeout(timer);
  }
}

const offers=(catalog.offers||[]).filter(o=>o?.public_id&&o?.commercial_state==='sell_now');
const results=[];

for(const offer of offers){
  const url=new URL(gateway);
  url.searchParams.set('action','offer');
  url.searchParams.set('public_id',offer.public_id);
  const probe=await getJson(url);
  const id_present=probe.json?containsId(probe.json,offer.public_id):false;
  const explicit_error=Boolean(probe.json&&typeof probe.json==='object'&&(probe.json.ok===false||probe.json.error));
  const valid=probe.ok&&!probe.parse_error&&id_present&&!explicit_error;
  results.push({
    public_id:offer.public_id,
    name:offer.name,
    machine_state:offer.machine_state,
    pricing:offer.pricing,
    endpoint:url.toString(),
    status:probe.status,
    final_url:probe.final_url,
    content_type:probe.content_type,
    bytes:probe.bytes,
    id_present,
    explicit_error,
    parse_error:probe.parse_error,
    valid,
    reason:valid?'offer_readable':!probe.ok?`http_${probe.status}`:probe.parse_error?'invalid_json':!id_present?'public_id_missing':'error_payload'
  });
}

const failures=results.filter(r=>!r.valid);
const receipt={
  schema:'evercraft.chum.commerce-canary.v1',
  generated_at:new Date().toISOString(),
  doctrine:{
    read_only:true,
    checkout_created:false,
    payment_attempted:false,
    payment_state_not_inferred:true,
    explicit_human_confirmation_preserved:true
  },
  source_catalog:{
    generated_at:catalog.generated_at||null,
    source_schema_version:catalog.source_schema_version||null,
    gateway_version:catalog.gateway_version||null
  },
  summary:{
    sell_now_offers:offers.length,
    readable_offer_doors:results.length-failures.length,
    failed_offer_doors:failures.length
  },
  results
};

fs.mkdirSync('artifacts/chum',{recursive:true});
fs.writeFileSync('artifacts/chum/commerce-canary-latest.json',JSON.stringify(receipt,null,2)+'\n');
const md=[
  '# CHUM Sell-Now Commerce Canary','',
  `Generated: ${receipt.generated_at}`,
  `Sell-now offers: ${receipt.summary.sell_now_offers}`,
  `Readable machine-offer doors: ${receipt.summary.readable_offer_doors}`,
  `Failed machine-offer doors: ${receipt.summary.failed_offer_doors}`,'',
  '> This is a read-only offer inspection canary. It never creates checkout, attempts payment, or treats an offer URL as proof of payment.','',
  '| Offer | Public ID | State | HTTP | Result |','|---|---|---|---:|---|',
  ...results.map(r=>`| ${r.name} | ${r.public_id} | ${r.machine_state||''} | ${r.status} | ${r.valid?'readable':r.reason} |`),
  '','## Repair queue','',
  ...(failures.length?failures.map(r=>`- ${r.public_id}: ${r.reason} (HTTP ${r.status})`):['- All current sell-now machine-offer doors are readable.']),
  ''
];
fs.writeFileSync('artifacts/chum/commerce-canary-latest.md',md.join('\n'));
console.log(JSON.stringify(receipt.summary));

if(failures.length) throw new Error(`CHUM commerce canary found ${failures.length} broken sell-now offer door(s)`);
