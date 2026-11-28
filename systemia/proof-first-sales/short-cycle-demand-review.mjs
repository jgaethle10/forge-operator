// Bounded public Ask HN demand scout. Reuses the existing Systemia matcher.
// Official search API: https://hn.algolia.com/api . No login, posting, contacts,
// private identity enrichment, new scheduler, or claim that a post is open.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {buildScopedPortfolio} from '../saban/revenue-swarm.mjs';
import {qualifyClientSignal} from './client-qualifier.mjs';
import {reviewDemandBatch} from './demand-portfolio-review.mjs';
const queries=['looking to hire','looking for a freelancer','paid project','looking for a consultant'];
const endpoint='https://hn.algolia.com/api/v1/search_by_date';
const strip=s=>String(s??'').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,' ').replace(/\s+/g,' ').trim();
const intent=/\b(?:looking to hire|looking for (?:a |an )?(?:freelancer|consultant|contractor|developer|agency)|seeking (?:a |an )?(?:freelancer|consultant|contractor|developer|agency)|paid (?:project|gig|contract|work|trial)|(?:we|i) (?:will|can|would) pay|(?:we|i) have a budget)\b/i;
const closed=/\b(?:not hiring|no budget|unpaid|volunteer only|position filled|already hired|no longer looking|looking for work|seeking employment|for hire)\b/i;
const excluded=/^(?:ask hn:\s*)?(?:who is hiring|who wants to be hired|freelancer\? seeking freelancer)/i;
export function normalizeAskHits(hits,now=new Date()){
 if(!Array.isArray(hits)||hits.length>100||!Number.isFinite(+now))throw Error('invalid_ask_hits');
 const rows=[],seen=new Set();
 for(const h of hits){
   const id=String(h?.objectID??''),title=strip(h?.title).slice(0,300),body=strip(h?.story_text).slice(0,6000);
   const date=typeof h?.created_at==='string'?Date.parse(h.created_at):NaN;
   const text=title+' '+body;
   if(!/^\d{1,20}$/.test(id)||seen.has(id)||!Array.isArray(h._tags)||!h._tags.includes('ask_hn')||
      h.url||!Number.isFinite(date)||date>+now||+now-date>7*86400000||
      !intent.test(text)||closed.test(text)||excluded.test(title)||body.length<20)continue;
   seen.add(id);
   const ref='https://news.ycombinator.com/item?id='+id;
   rows.push({prospect_key:'hn:'+id,business:'Unverified public request '+id,source_kind:'public_hiring',
      observed_at:new Date(date).toISOString(),evidence_refs:[ref],demand_evidence_ref:ref,demand_text:text});
 }
 return rows;
}
export async function scoutAskDemand({now=new Date(),fetchFn=fetch,portfolio,painIndex}={}){
 if(!Number.isFinite(+now))throw Error('invalid_clock');
 const all=[],sources=[];
 for(const query of queries){
   const u=new URL(endpoint);
   u.search=new URLSearchParams({query,tags:'ask_hn',numericFilters:'created_at_i>'+Math.floor((+now-7*86400000)/1000),hitsPerPage:'20',page:'0'});
   try{
     const res=await fetchFn(u,{redirect:'error',signal:AbortSignal.timeout(12000)});
     if(!res.ok)throw Error('provider_http');
     const reader=res.body.getReader();const chunks=[];let size=0;
     try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1000000)throw Error('response_too_large');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
     const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
     if(!Array.isArray(data.hits)||data.hits.length>20)throw Error('invalid_page');
     const candidates=normalizeAskHits(data.hits,now);all.push(...candidates);
     sources.push({query,state:'observed',records:data.hits.length,candidates:candidates.length,coverage_complete:false});
   }catch{sources.push({query,state:'held',records:null,candidates:null,coverage_complete:false});}
 }
 // Same immutable post ID may recur across searches. Conflicting text holds.
 const byId=new Map(),conflicts=new Set();
 for(const s of all){const old=byId.get(s.prospect_key);if(old&&JSON.stringify(old)!==JSON.stringify(s))conflicts.add(s.prospect_key);else if(!old)byId.set(s.prospect_key,s);}
 const signals=[...byId.values()].filter(s=>!conflicts.has(s.prospect_key));
 const review=reviewDemandBatch(signals,{portfolio,painIndex,now,qualify:qualifyClientSignal});
 return {schema:'evercraft.systemia.short-cycle-demand-review.v1',observed_at:now.toISOString(),sources,
    counts:{records_seen:sources.reduce((n,x)=>n+(x.records??0),0),distinct_research_signals:signals.length,conflicting_posts:conflicts.size,matched:review.rows.filter(r=>r.hypotheses.length>0).length},
    review_only:true,coverage_complete:false,external_effects_authorized:false,rows:review.rows.map(r=>({prospect_key:r.prospect_key,source_ref:r.qualification?.evidence_refs?.[0]??null,hypotheses:r.hypotheses,state:'verify_original_post_open_scope_and_buyer',contact_authorized:false,paid_order_confirmed:false}))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==2)throw Error('no_arguments_expected');
 const read=p=>JSON.parse(fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
 const portfolio=buildScopedPortfolio({catalog:read('public/.well-known/evercraft-machine-catalog.json'),registry:read('registry/catalog.json')});
 const r=await scoutAskDemand({portfolio,painIndex:read('public/.well-known/evercraft-pain-index.json')});
 process.stdout.write(JSON.stringify(r,null,2)+'\n');
 if(!r.sources.some(x=>x.state==='observed'))process.exitCode=2;
}
