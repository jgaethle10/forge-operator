// One-shot adapter from the existing Kaidance research checkpoint to the
// existing demand matcher. Official notice titles are research clues only.
// No network, state mutation, contact authority, or assumption of procurement eligibility.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildScopedPortfolio} from '../saban/revenue-swarm.mjs';
import {qualifyClientSignal} from './client-qualifier.mjs';
import {reviewDemandBatch} from './demand-portfolio-review.mjs';
const validDate=v=>typeof v==='string'&&/(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
const host={uk:'www.find-tender.service.gov.uk',sam:'sam.gov',nyc:'data.cityofnewyork.us',ca:'canadabuys.canada.ca'};
function validSource(c){
 const m=/^(uk|sam|nyc|ca):([a-z0-9]{1,40})$/.exec(c.candidate_ref||'');
 if(!m)return false;
 try{
   const u=new URL(c.source_url);
   if(u.protocol!=='https:'||u.hostname!==host[m[1]]||u.username||u.password||u.port||u.hash)return false;
   if(m[1]==='uk')return /^\/Notice\/\d{6}-\d{4}$/.test(u.pathname);
   if(m[1]==='sam')return /^[a-f0-9]{32}$/.test(m[2])&&u.pathname==='/opp/'+m[2]+'/view';
   if(m[1]==='nyc')return /^\d+$/.test(m[2])&&u.pathname==='/resource/3khw-qi8f.json'&&u.searchParams.get('request_id')===m[2];
   return u.pathname.startsWith('/en/tender-opportunities/tender-notice/')||u.pathname.startsWith('/fr/occasions-de-marche/avis-appel-offres/');
 }catch{return false;}
}
export function reviewCheckpoint(checkpoint,{portfolio,painIndex,now=new Date()}={}){
 const at=+now;
 if(checkpoint?.schema!=='evercraft.kaidance.discovery-checkpoint.v1'||!Array.isArray(checkpoint.records)||checkpoint.records.length>20000||
    !Number.isFinite(at)||!validDate(checkpoint.last_cycle_at)||Date.parse(checkpoint.last_cycle_at)>at||
    at-Date.parse(checkpoint.last_cycle_at)>3600000||checkpoint.receipt?.schema!=='evercraft.kaidance.discovery-checkpoint-receipt.v1'||
    checkpoint.receipt.observed_at!==checkpoint.last_cycle_at||checkpoint.receipt.qualified_count!==0||
    checkpoint.receipt.send_performed!==false||checkpoint.receipt.crm_write_performed!==false||
    !Array.isArray(checkpoint.receipt.sources))throw Error('invalid_or_stale_checkpoint');
 const observed=new Set(checkpoint.receipt.sources.filter(s=>s.state==='observed').map(s=>s.source));
 const counts={records_seen:checkpoint.records.length,held:0,eligible:0,processed:0,matched:0};
 const signals=[],seen=new Set();
 for(const c of checkpoint.records){
   if(typeof c?.candidate_ref!=='string'||seen.has(c.candidate_ref))throw Error('duplicate_or_invalid_checkpoint_identity');
   seen.add(c.candidate_ref);
   if(c.stage!=='research_required'||c.qualified!==false||c.contact_authorized!==false||
     !observed.has(c.candidate_ref.split(':')[0])||c.last_seen_at!==checkpoint.last_cycle_at||
     !validSource(c)||c.deadline_timezone!==null||!validDate(c.deadline)||Date.parse(c.deadline)<=at||
     typeof c.title!=='string'||c.title.trim().length<12||c.title.length>300||
     typeof c.buyer!=='string'||!c.buyer.trim()||c.buyer.length>300){counts.held++;continue;}
   signals.push({prospect_key:c.candidate_ref,business:c.buyer,source_kind:'public_hiring',
      observed_at:c.last_seen_at,deadline_at:c.deadline,evidence_refs:[c.source_url],
      demand_evidence_ref:c.source_url,demand_text:c.title});
 }
 signals.sort((a,b)=>Date.parse(a.deadline_at)-Date.parse(b.deadline_at)||a.prospect_key.localeCompare(b.prospect_key));
 counts.eligible=signals.length;
 const selected=signals.slice(0,1000);counts.processed=selected.length;
 const review=reviewDemandBatch(selected,{portfolio,painIndex,now,qualify:qualifyClientSignal});
 const dates=new Map(selected.map(s=>[s.prospect_key,s.deadline_at]));
 const rows=review.rows.map(r=>({prospect_key:r.prospect_key,deadline_at:dates.get(r.prospect_key),
   state:r.hypotheses.length?'review_original_notice_and_scope':'research_only',hypotheses:r.hypotheses,
   buyer:r.qualification?.business??null,source_ref:r.qualification?.evidence_refs?.[0]??null,
   required_review:['original_notice_and_amendments','buyer_eligibility','exact_scope_and_capacity','payment_terms','approved_response_channel','interaction_history'],
   contact_authorized:false,checkout_authorized:false,paid_order_confirmed:false}));
 counts.matched=rows.filter(r=>r.hypotheses.length>0).length;
 return {schema:'evercraft.systemia.checkpoint-portfolio-review.v1',observed_at:now.toISOString(),counts,
    sources:checkpoint.receipt.sources.map(s=>({source:s.source,state:s.state,candidates:s.candidates,coverage_complete:s.coverage_complete===true})),
    coverage_complete:false,review_only:true,external_effects_authorized:false,rows};
}
function privateRead(file){
 if(!path.isAbsolute(file))throw Error('absolute_checkpoint_required');
 const dir=fs.lstatSync(path.dirname(file));
 if(!dir.isDirectory()||dir.uid!==process.getuid()||(dir.mode&0o077))throw Error('unsafe_checkpoint_directory');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>16000000)throw Error('unsafe_checkpoint');return JSON.parse(fs.readFileSync(fd,'utf8'));}
 finally{fs.closeSync(fd);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==3)throw Error('usage: absolute_private_checkpoint');
 const read=p=>JSON.parse(fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8'));
 const portfolio=buildScopedPortfolio({catalog:read('public/.well-known/evercraft-machine-catalog.json'),registry:read('registry/catalog.json')});
 const report=reviewCheckpoint(privateRead(process.argv[2]),{portfolio,painIndex:read('public/.well-known/evercraft-pain-index.json')});
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
}
