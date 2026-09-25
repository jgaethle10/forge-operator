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

async function getResponse(url,{requireJson=false}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(url,{
      method:'GET',
      redirect:'follow',
      headers:{
        accept:requireJson?'application/json':'text/html,application/json,text/plain;q=0.8,*/*;q=0.2',
        'user-agent':'Evercraft-CHUM-CommerceCanary/1.1'
      },
      signal:controller.signal
    });
    const text=await r.text();
    let json=null;
    let parse_error=null;
    if(requireJson){
      try{json=JSON.parse(text);}catch(error){parse_error=error instanceof Error?error.message:String(error);}
    }else{
      try{json=JSON.parse(text);}catch{}
    }
    return {
      ok:r.ok,
      status:r.status,
      final_url:r.url,
      content_type:r.headers.get('content-type')||'',
      bytes:Buffer.byteLength(text),
      json,
      parse_error,
      nonempty:Buffer.byteLength(text)>0
    };
  }catch(error){
    return {ok:false,status:0,final_url:String(url),content_type:'',bytes:0,json:null,parse_error:error instanceof Error?error.message:String(error),nonempty:false};
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
  const probe=await getResponse(url,{requireJson:true});
  const id_present=probe.json?containsId(probe.json,offer.public_id):false;
  const explicit_error=Boolean(probe.json&&typeof probe.json==='object'&&(probe.json.ok===false||probe.json.error));
  const offer_door_valid=probe.ok&&!probe.parse_error&&id_present&&!explicit_error;

  const reviewUrl=new URL(gateway);
  reviewUrl.searchParams.set('view','service');
  reviewUrl.searchParams.set('public_id',offer.public_id);
  const review=await getResponse(reviewUrl);
  const review_explicit_error=Boolean(review.json&&typeof review.json==='object'&&(review.json.ok===false||review.json.error));
  const review_door_valid=review.ok&&review.nonempty&&!review_explicit_error;
  const valid=offer_door_valid&&review_door_valid;

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
    offer_door_valid,
    review_endpoint:reviewUrl.toString(),
    review_status:review.status,
    review_final_url:review.final_url,
    review_content_type:review.content_type,
    review_bytes:review.bytes,
    review_explicit_error,
    review_door_valid,
    valid,
    reason:valid
      ?'money_path_readable'
      :!offer_door_valid
        ?(!probe.ok?`offer_http_${probe.status}`:probe.parse_error?'offer_invalid_json':!id_present?'offer_public_id_missing':'offer_error_payload')
        :!review.ok
          ?`review_http_${review.status}`
          :!review.nonempty
            ?'review_empty'
            :'review_error_payload'
  });
}

const failures=results.filter(r=>!r.valid);
const offerFailures=results.filter(r=>!r.offer_door_valid);
const reviewFailures=results.filter(r=>!r.review_door_valid);
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
    readable_offer_doors:results.length-offerFailures.length,
    failed_offer_doors:offerFailures.length,
    readable_review_doors:results.length-reviewFailures.length,
    failed_review_doors:reviewFailures.length,
    healthy_money_paths:results.length-failures.length,
    failed_money_paths:failures.length
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
  `Readable human-review doors: ${receipt.summary.readable_review_doors}`,
  `Healthy money paths: ${receipt.summary.healthy_money_paths}`,
  `Failed money paths: ${receipt.summary.failed_money_paths}`,'',
  '> This is a read-only money-path canary. It verifies offer discovery and the human review door, but never creates checkout, attempts payment, or treats a review URL as payment proof.','',
  '| Offer | Public ID | State | Offer HTTP | Review HTTP | Result |','|---|---|---|---:|---:|---|',
  ...results.map(r=>`| ${r.name} | ${r.public_id} | ${r.machine_state||''} | ${r.status} | ${r.review_status} | ${r.valid?'money path readable':r.reason} |`),
  '','## Repair queue','',
  ...(failures.length?failures.map(r=>`- ${r.public_id}: ${r.reason} (offer HTTP ${r.status}; review HTTP ${r.review_status})`):['- All current sell-now offer and human-review doors are readable.']),
  ''
];
fs.writeFileSync('artifacts/chum/commerce-canary-latest.md',md.join('\n'));
console.log(JSON.stringify(receipt.summary));

if(failures.length) throw new Error(`CHUM commerce canary found ${failures.length} broken sell-now money path(s)`);
