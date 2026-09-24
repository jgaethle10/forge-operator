import fs from 'node:fs';

const catalog=JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json','utf8'));
const gateway='https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway';
const offers=(catalog.offers||[]).filter(o=>o.commercial_state==='sell_now');
const cases=[];
for(const offer of offers){
  for(const phrase of offer.intent_terms||[]){
    const p=String(phrase||'').trim();
    if(p.length>=3) cases.push({expected_id:offer.public_id,expected_name:offer.name,intent:p});
  }
}

const results=[];
for(const test of cases){
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
      http_status:r.status,
      top_ids:ids,
      top1:ids[0]===test.expected_id,
      top3:ids.includes(test.expected_id),
      top_matches:matches.map(m=>({public_id:m?.offer?.public_id,name:m?.offer?.name,score:m?.score,matched_terms:m?.matched_terms}))
    });
  }catch(error){
    results.push({...test,error:error instanceof Error?error.message:String(error),top_ids:[],top1:false,top3:false});
  }
}

const total=results.length;
const top1=results.filter(r=>r.top1).length;
const top3=results.filter(r=>r.top3).length;
const receipt={
  schema:'evercraft.chum.router-recall.v1',
  checked_at:new Date().toISOString(),
  scope:'sell_now_exact_intent_terms',
  sell_now_offers:offers.length,
  cases:total,
  top1,
  top3,
  top1_rate:total?top1/total:0,
  top3_rate:total?top3/total:0,
  misses:results.filter(r=>!r.top3),
  top1_collisions:results.filter(r=>!r.top1),
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
  'Top-1: '+receipt.top1+'/'+receipt.cases+' ('+(receipt.top1_rate*100).toFixed(1)+'%)',
  'Top-3: '+receipt.top3+'/'+receipt.cases+' ('+(receipt.top3_rate*100).toFixed(1)+'%)',
  '',
  '## Top-3 misses',
  '',
  ...(receipt.misses.length?receipt.misses.map(r=>'- '+r.expected_name+' <- "'+r.intent+'" ; got '+(r.top_ids.join(', ')||'no match')):['- none']),
  '',
  '## Top-1 collisions',
  '',
  ...(receipt.top1_collisions.length?receipt.top1_collisions.map(r=>'- '+r.expected_name+' <- "'+r.intent+'" ; top '+(r.top_ids[0]||'no match')):['- none'])
];
fs.writeFileSync('artifacts/chum/router-recall-latest.md',md.join('\n')+'\n');
console.log(JSON.stringify({sell_now_offers:receipt.sell_now_offers,cases:receipt.cases,top1:receipt.top1,top3:receipt.top3,top1_rate:receipt.top1_rate,top3_rate:receipt.top3_rate,misses:receipt.misses.length}));
if(receipt.misses.length) throw new Error('CHUM router recall has '+receipt.misses.length+' top-3 miss(es)');
