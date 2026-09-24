import fs from 'node:fs';

const assert=(condition,message)=>{if(!condition)throw new Error('CHUM_INTENT_WATERSHED_FAIL: '+message);};
const graph=JSON.parse(fs.readFileSync('public/.well-known/evercraft-intents.json','utf8'));
const html=fs.readFileSync('public/discover/index.html','utf8');
const text=fs.readFileSync('public/discover/intents.txt','utf8');

assert(graph.schema==='evercraft.chum.intent-watershed.v1','schema mismatch');
assert(graph.coordinator==='CHUM','coordinator mismatch');
assert(graph.doctrine?.brand_seed_required===false,'brand seed must not be required');
assert(graph.doctrine?.problem_first===true,'problem-first doctrine missing');
assert(graph.doctrine?.discovery_creates_obligation===false,'discovery must create no obligation');
assert(graph.doctrine?.checkout_is_payment_proof===false,'checkout must not be payment proof');
assert(graph.doctrine?.private_topology_exposed===false,'private topology must remain closed');
assert(graph.start_here?.read_only_registry_name==='io.github.jgaethle10/evercraft-capability-discovery','read-only registry door missing');
assert(typeof graph.start_here?.machine_commerce_mcp==='string'&&graph.start_here.machine_commerce_mcp.startsWith('https://'),'machine commerce MCP missing');
assert(Number(graph.counts?.intents)>=50,'intent vocabulary unexpectedly small');
assert(Number(graph.counts?.sell_now)>=1,'sell-now vocabulary missing');
assert(Array.isArray(graph.intents)&&graph.intents.length===graph.counts.intents,'intent count mismatch');

const seen=new Set();
for(const item of graph.intents){
  assert(item.intent&&item.normalized,'intent record incomplete');
  assert(!seen.has(item.normalized),'duplicate normalized intent: '+item.normalized);
  seen.add(item.normalized);
  assert(Array.isArray(item.candidates)&&item.candidates.length>0,'intent has no candidates: '+item.intent);
}
const all=JSON.stringify(graph);
assert(!all.includes('systemiacommandcenters.com'),'stale Marketing Agency route leaked into intent graph');
for(const forbidden of ['access_token','refresh_token','api_key','password','cookie','session_secret']){
  assert(!new RegExp('"'+forbidden+'"\\s*:','i').test(all),'private credential-shaped field leaked: '+forbidden);
}
assert(html.includes('<meta name="robots" content="index,follow'),'crawlability meta missing');
assert(html.includes('Tell the AI the problem. It can find the door.'),'problem-language H1 missing');
assert(html.includes('/.well-known/evercraft-intents.json'),'HTML does not advertise intent graph');
assert(text.includes('Start with what the user is trying to accomplish.'),'plain-text problem-first instruction missing');

console.log('CHUM_INTENT_WATERSHED_PASS',JSON.stringify({
  intents:graph.counts.intents,
  products:graph.counts.products,
  offer_surfaces:graph.counts.offer_surfaces,
  sell_now:graph.counts.sell_now,
  stale_marketing_routes_suppressed:true
}));
