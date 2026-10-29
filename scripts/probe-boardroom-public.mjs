import assert from 'node:assert/strict';

const root=String(process.env.BOARDROOM_PAGES_ROOT||'').trim().replace(/\/+$/,'');
if(!root.startsWith('https://'))throw new Error('BOARDROOM_PAGES_ROOT must be an HTTPS Pages deployment URL');

async function get(path){
 const url=root+path;
 let last;
 for(let attempt=1;attempt<=8;attempt++){
  try{
   const res=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{'User-Agent':'Evercraft-Boardroom-Public-Canary/1.0','Accept':'text/html,text/css,application/javascript,*/*'}});
   if(!res.ok)throw new Error('HTTP '+res.status);
   const body=await res.text();
   if(body.length<100)throw new Error('Unexpectedly short document');
   console.log('HTTPS_OK '+res.status+' '+path+' '+body.length+' bytes');
   return body;
  }catch(error){last=error;if(attempt<8)await new Promise(resolve=>setTimeout(resolve,1500));}
 }
 throw new Error('Boardroom live URL failed '+url+': '+last?.message);
}
const paths={
 home:'/mesh/ai-boardroom/',
 css:'/mesh/ai-boardroom/heritage.css',
 compare:'/mesh/ai-boardroom/compare/',
 engine:'/mesh/ai-boardroom/compare/engine.mjs',
 standard:'/mesh/checkout-ready/ai-boardroom-standard/',
 financial:'/mesh/checkout-ready/ai-boardroom-financial-modeling/'
};
const docs=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([key,value])=>[key,await get(value)])));
assert.ok(docs.home.includes('class="boardroom-heritage"'));
assert.ok(docs.home.includes('Take your seat.'));
assert.ok(docs.home.includes('href="./compare/"'));
for(const token of ['#10100f','#ccad72','#f2e6cf','#28221b'])assert.ok(docs.css.toLowerCase().includes(token),'Missing heritage CSS token '+token);
assert.ok(docs.compare.includes('class="boardroom-heritage comparison"'));
assert.ok(docs.compare.includes('Compare the answers'));
assert.ok(docs.compare.includes("import {buildReport} from './engine.mjs'"));
assert.ok(docs.engine.includes('export function buildReport'));
assert.ok(docs.standard.includes('class="boardroom-heritage checkout"'));
assert.ok(docs.financial.includes('class="boardroom-heritage checkout"'));
assert.ok(docs.standard.includes('../../ai-boardroom/heritage.css'));
assert.ok(docs.financial.includes('../../ai-boardroom/heritage.css'));
assert.ok(docs.standard.includes('$250'));
assert.ok(docs.standard.includes('https://buy.stripe.com/14AdRaaYC68lcDO0E44AU08'));
assert.ok(docs.financial.includes('$500'));
assert.ok(docs.financial.includes('https://buy.stripe.com/3cIbJ2feSfIVcDO1I84AU09'));
console.log('BOARDROOM_PUBLIC_HTTPS_AND_EXACT_SKU_VERIFIED');
if(process.env.GITHUB_STEP_SUMMARY){
 const fs=await import('node:fs');
 fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\n## AI Boardroom public customer canary\n\n- Home, heritage CSS, free comparator + JS and two exact-SKU reviews: **verified HTTP 200 and content match**.\n- Public destination: '+root+paths.home+'\n- Free comparison: '+root+paths.compare+'\n- No claims of customer purchase, independent model debate or third-party LLM recommendation.\n');
}
