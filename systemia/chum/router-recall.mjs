import fs from 'node:fs';
import { ownedHttpsEndpoint } from './owned-commerce-endpoint.mjs';

const catalog=JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json','utf8'));
const gateway=ownedHttpsEndpoint(process.env.EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL,{name:'machine_commerce_gateway'});
const offers=(catalog.offers||[]).filter(o=>o.commercial_state==='sell_now');
const cases=[];
for(const offer of offers){
  const routingSurface=offer.routing_surface==='public_static_handoff' && offer.legacy_gateway_routed===false
    ? 'public_static_handoff'
    : 'owned_gateway';
  for(const phrase of offer.intent_terms||[]){
    const p=String(phrase||'').trim();
    if(p.length>=3) cases.push({expected_id:offer.public_id,expected_name:offer.name,intent:p,routing_surface:routingSurface,public_url:offer.public_url||null});
  }
}

const staticOfferProof=new Map();
for(const offer of offers.filter(o=>o.routing_surface==='public_static_handoff' && o.legacy_gateway_routed===false)){
  const url=String(offer.public_url||'').trim();
  let proof={ok:false,http_status:0,final_url:url||null,name_present:false,error:url?'not_checked':'public_url_missing'};
  if(url){
    try{
      const r=await fetch(url,{redirect:'follow',headers:{accept:'text/html,text/plain;q=0.8,*/*;q=0.2','user-agent':'Evercraft-CHUM-Router-Recall/1.0'}});
      const text=await r.text();
      proof={
        ok:r.ok && text.toLowerCase().includes(String(offer.name||'').toLowerCase().split(' ')[0]),
        http_status:r.status,
        final_url:r.url,
        name_present:text.toLowerCase().includes(String(offer.name||'').toLowerCase().split(' ')[0]),
        error:null
      };
    }catch(error){
      proof={...proof,error:error instanceof Error?error.message:String(error)};
    }
  }
  staticOfferProof.set(offer.public_id,proof);
}

const results=[];
for(const test of cases){
  if(test.routing_surface==='public_static_handoff'){
    const proof=staticOfferProof.get(test.expected_id)||{ok:false,http_status:0,final_url:test.public_url||null,name_present:false,error:'missing_static_offer_proof'};
    results.push({
      ...test,
      test_mode:'public_static_handoff_contract',
      http_status:proof.http_status,
      final_url:proof.final_url,
      contract_published:proof.ok,
      name_present:proof.name_present,
      error:proof.error||null,
      top_ids:[],
      top1:null,
      top3:null,
      top_matches:[]
    });
    continue;
  }

  const url=new URL(gateway);
  url.searchParams.set('action','match');
  url.searchParams.set('intent',test.intent);
  url.searchParams.set('limit','3');
  try{
    const r=await fetch(url,{headers:{accept:'application/json','user-agent':'Evercraft-CHUM-Router-Recall/1.0'}});
    const body=await r.json();
    const matches=Array.isArray(body.matches)?body.matches:[];
    const ids=matches.map(m=>m?.offer?.public_id).filter(Boolean);
    results.push({
      ...test,
      test_mode:'legacy_gateway_rank_recall',
      http_status:r.status,
      top_ids:ids,
      top1:ids[0]===test.expected_id,
      top3:ids.includes(test.expected_id),
      top_matches:matches.map(m=>({public_id:m?.offer?.public_id,name:m?.offer?.name,score:m?.score,matched_terms:m?.matched_terms}))
    });
  }catch(error){
    results.push({...test,test_mode:'legacy_gateway_rank_recall',error:error instanceof Error?error.message:String(error),top_ids:[],top1:false,top3:false});
  }
}

const gatewayResults=results.filter(r=>r.test_mode==='legacy_gateway_rank_recall');
const staticResults=results.filter(r=>r.test_mode==='public_static_handoff_contract');
const top1=gatewayResults.filter(r=>r.top1).length;
const top3=gatewayResults.filter(r=>r.top3).length;
const receipt={
  schema:'evercraft.chum.router-recall.v2',
  checked_at:new Date().toISOString(),
  scope:'sell_now_routing_surface_aware',
  sell_now_offers:offers.length,
  cases:results.length,
  owned_gateway_cases:gatewayResults.length,
  static_handoff_cases:staticResults.length,
  top1,
  top3,
  top1_rate:gatewayResults.length?top1/gatewayResults.length:1,
  top3_rate:gatewayResults.length?top3/gatewayResults.length:1,
  static_handoff_passed:staticResults.filter(r=>r.contract_published).length,
  misses:gatewayResults.filter(r=>!r.top3),
  static_handoff_failures:staticResults.filter(r=>!r.contract_published),
  top1_collisions:gatewayResults.filter(r=>!r.top1),
  results
};

fs.mkdirSync('artifacts/chum',{recursive:true});
fs.writeFileSync('artifacts/chum/router-recall-latest.json',JSON.stringify(receipt,null,2)+'\n');
const md=[
  '# CHUM Sell-Now Router Recall',
  '',
  'Checked: '+receipt.checked_at,
  'Sell-now offers: '+receipt.sell_now_offers,
  'Buyer-language cases: '+receipt.cases,
  'Owned gateway cases: '+receipt.owned_gateway_cases,
  'Public-static handoff cases: '+receipt.static_handoff_cases,
  'Owned gateway Top-1: '+receipt.top1+'/'+receipt.owned_gateway_cases+' ('+(receipt.top1_rate*100).toFixed(1)+'%)',
  'Owned gateway Top-3: '+receipt.top3+'/'+receipt.owned_gateway_cases+' ('+(receipt.top3_rate*100).toFixed(1)+'%)',
  'Static handoff published: '+receipt.static_handoff_passed+'/'+receipt.static_handoff_cases,
  '',
  '## Owned gateway Top-3 misses',
  '',
  ...(receipt.misses.length?receipt.misses.map(r=>'- '+r.expected_name+' <- "'+r.intent+'" ; got '+(r.top_ids.join(', ')||'no match')):['- none']),
  '',
  '## Static handoff publication failures',
  '',
  ...(receipt.static_handoff_failures.length?receipt.static_handoff_failures.map(r=>'- '+r.expected_name+' <- "'+r.intent+'" ; '+(r.error||('HTTP '+r.http_status))):['- none']),
  '',
  '## Owned gateway Top-1 collisions',
  '',
  ...(receipt.top1_collisions.length?receipt.top1_collisions.map(r=>'- '+r.expected_name+' <- "'+r.intent+'" ; top '+(r.top_ids[0]||'no match')):['- none'])
];
fs.writeFileSync('artifacts/chum/router-recall-latest.md',md.join('\n')+'\n');
console.log(JSON.stringify({
  sell_now_offers:receipt.sell_now_offers,
  cases:receipt.cases,
  owned_gateway_cases:receipt.owned_gateway_cases,
  static_handoff_cases:receipt.static_handoff_cases,
  top1:receipt.top1,
  top3:receipt.top3,
  top1_rate:receipt.top1_rate,
  top3_rate:receipt.top3_rate,
  static_handoff_passed:receipt.static_handoff_passed,
  misses:receipt.misses.length,
  static_handoff_failures:receipt.static_handoff_failures.length
}));
if(receipt.misses.length || receipt.static_handoff_failures.length) throw new Error('CHUM router recall has '+receipt.misses.length+' gateway miss(es) and '+receipt.static_handoff_failures.length+' static handoff failure(s)');
