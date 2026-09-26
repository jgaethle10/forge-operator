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

  const continuation=probe.json?.continuation||null;
  const frontage_url=typeof continuation?.buyer_frontage_url==='string'
    ? continuation.buyer_frontage_url.trim()
    : typeof probe.json?.offer?.buyer_frontage_url==='string'
      ? probe.json.offer.buyer_frontage_url.trim()
      : '';
  const frontage=frontage_url
    ? await getResponse(frontage_url)
    : {ok:false,status:0,final_url:null,content_type:'',bytes:0,json:null,parse_error:null,nonempty:false};
  const frontage_explicit_error=Boolean(frontage.json&&typeof frontage.json==='object'&&(frontage.json.ok===false||frontage.json.error));
  const frontage_valid=Boolean(
    frontage_url &&
    frontage_url.startsWith('https://evercraft-ai-suite-08c4d2b8.base44.app/buy/') &&
    frontage.ok &&
    frontage.nonempty &&
    !frontage_explicit_error
  );

  const buyer_required=continuation?.mode==='direct_checkout_capable';
  const buyer_url=typeof continuation?.buyer_url==='string'?continuation.buyer_url.trim():'';
  const buyer=buyer_required&&buyer_url
    ? await getResponse(buyer_url)
    : {ok:!buyer_required,status:buyer_required?0:null,final_url:buyer_url||null,content_type:'',bytes:0,json:null,parse_error:null,nonempty:!buyer_required};
  const buyer_explicit_error=Boolean(buyer.json&&typeof buyer.json==='object'&&(buyer.json.ok===false||buyer.json.error));
  const buyer_door_valid=!buyer_required||Boolean(buyer_url&&buyer.ok&&buyer.nonempty&&!buyer_explicit_error);
  const valid=offer_door_valid&&review_door_valid&&frontage_valid&&buyer_door_valid;

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
    continuation_mode:continuation?.mode||null,
    buyer_frontage_url:frontage_url||null,
    buyer_frontage_status:frontage.status,
    buyer_frontage_final_url:frontage.final_url,
    buyer_frontage_bytes:frontage.bytes,
    buyer_frontage_valid:frontage_valid,
    buyer_required,
    buyer_url:buyer_url||null,
    buyer_status:buyer.status,
    buyer_final_url:buyer.final_url,
    buyer_content_type:buyer.content_type,
    buyer_bytes:buyer.bytes,
    buyer_explicit_error,
    buyer_door_valid,
    valid,
    reason:valid
      ?'money_path_readable'
      :!offer_door_valid
        ?(!probe.ok?`offer_http_${probe.status}`:probe.parse_error?'offer_invalid_json':!id_present?'offer_public_id_missing':'offer_error_payload')
        :!review_door_valid
          ?(!review.ok?`review_http_${review.status}`:!review.nonempty?'review_empty':'review_error_payload')
          :!frontage_valid
            ?(!frontage_url?'buyer_frontage_url_missing':!frontage.ok?`buyer_frontage_http_${frontage.status}`:!frontage.nonempty?'buyer_frontage_empty':'buyer_frontage_invalid')
          :buyer_required&&!buyer_url
            ?'buyer_url_missing'
            :buyer_required&&!buyer.ok
              ?`buyer_http_${buyer.status}`
              :buyer_required&&!buyer.nonempty
                ?'buyer_empty'
                :'buyer_error_payload'
  });
}

const failures=results.filter(r=>!r.valid);
const offerFailures=results.filter(r=>!r.offer_door_valid);
const reviewFailures=results.filter(r=>!r.review_door_valid);
const frontageFailures=results.filter(r=>!r.buyer_frontage_valid);
const buyerRequired=results.filter(r=>r.buyer_required);
const buyerFailures=buyerRequired.filter(r=>!r.buyer_door_valid);
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
    required_buyer_frontage_doors:results.length,
    readable_buyer_frontage_doors:results.length-frontageFailures.length,
    failed_buyer_frontage_doors:frontageFailures.length,
    required_human_buyer_doors:buyerRequired.length,
    readable_human_buyer_doors:buyerRequired.length-buyerFailures.length,
    failed_human_buyer_doors:buyerFailures.length,
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
  `Required branded buyer-frontage doors: ${receipt.summary.required_buyer_frontage_doors}`,
  `Readable branded buyer-frontage doors: ${receipt.summary.readable_buyer_frontage_doors}`,
  `Required direct-sale downstream buyer doors: ${receipt.summary.required_human_buyer_doors}`,
  `Readable direct-sale buyer doors: ${receipt.summary.readable_human_buyer_doors}`,
  `Healthy money paths: ${receipt.summary.healthy_money_paths}`,
  `Failed money paths: ${receipt.summary.failed_money_paths}`,'',
  '> This is a read-only money-path canary. It verifies offer discovery, the machine review door, the branded buyer frontage for every sell-now offer, and the downstream buyer destination for direct-checkout offers. It never creates checkout, attempts payment, or treats a reachable URL as payment proof.','',
  '| Offer | Public ID | State | Offer HTTP | Review HTTP | Frontage HTTP | Downstream HTTP | Result |','|---|---|---|---:|---:|---:|---:|---|',
  ...results.map(r=>`| ${r.name} | ${r.public_id} | ${r.machine_state||''} | ${r.status} | ${r.review_status} | ${r.buyer_frontage_status} | ${r.buyer_required?r.buyer_status:'n/a'} | ${r.valid?'money path readable':r.reason} |`),
  '','## Repair queue','',
  ...(failures.length?failures.map(r=>`- ${r.public_id}: ${r.reason} (offer HTTP ${r.status}; review HTTP ${r.review_status})`):['- All current sell-now offer and human-review doors are readable.']),
  ''
];
fs.writeFileSync('artifacts/chum/commerce-canary-latest.md',md.join('\n'));
console.log(JSON.stringify(receipt.summary));

if(failures.length) throw new Error(`CHUM commerce canary found ${failures.length} broken sell-now money path(s)`);
