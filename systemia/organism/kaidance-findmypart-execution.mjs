// One bounded FindMyPart research cycle. No second scheduler, CRM, outreach or payments.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runBenchmark} from '../../scripts/findmypart-saban-benchmark.mjs';
const SOURCES=Object.freeze([
 {key:'small-engine-specialties',name:'Small Engine Specialties',sector:'small_engine',url:'https://www.sespecialties.com/parts-and-service',terms:['repair','parts']},
 {key:'integrity-appliance',name:'Integrity Appliance Service',sector:'appliance',url:'https://integrityappliance.net/',terms:['repair','appliance']},
 {key:'all-valley-appliance',name:'All Valley Appliances',sector:'appliance',url:'https://www.allvalleyrepair.com/',terms:['repair','appliance']},
 {key:'avery-home-services',name:'Avery Home Services',sector:'appliance',url:'https://averyhomeservices.net/',terms:['repair','appliance']},
 {key:'spokane-small-engine',name:'Spokane Small Engine',sector:'small_engine',url:'https://www.spokanesmallengine.net/services/',terms:['repair','parts']},
 {key:'outdoor-power-repair',name:'Outdoor Power & Repair',sector:'small_engine',url:'https://www.outdoorpowerandrepair.com/',terms:['repair','parts']}
]);
const hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
const DAY=86400000;
function privateDir(dir){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const s=fs.lstatSync(dir);
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.uid!==process.getuid())throw Error('findmypart_private_directory_required');
}
function readPrivate(file){
 let s;try{s=fs.lstatSync(file)}catch(e){if(e.code==='ENOENT')return null;throw e}
 if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.uid!==process.getuid()||s.size>256000)throw Error('findmypart_private_state_invalid');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
function write(file,obj){
 const t=file+'.'+randomBytes(8).toString('hex')+'.tmp';
 try{fs.writeFileSync(t,JSON.stringify(obj,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(t,file)}
 finally{if(fs.existsSync(t))fs.unlinkSync(t)}
}
async function boundedPage(source,fetchImpl){
 const r=await fetchImpl(source.url,{redirect:'error',signal:AbortSignal.timeout(8000),headers:{accept:'text/html','user-agent':'Evercraft-FindMyPart/1.0 (public business service research)'}});
 if(!r.ok||!String(r.headers.get('content-type')).toLowerCase().includes('text/html'))return {status:'http_or_content_hold',http_status:r.status};
 const reader=r.body.getReader();let n=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>512000){await reader.cancel();return {status:'size_hold',http_status:r.status}}chunks.push(Buffer.from(value))}}
 finally{reader.releaseLock()}
 const bytes=Buffer.concat(chunks);
 const text=bytes.toString('utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,' ').replace(/<[^>]+>/g,' ').toLowerCase();
 const signals=source.terms.filter(term=>new RegExp('\\b'+term+'\\b','i').test(text));
 return {status:signals.length===source.terms.length?'service_fit_observed':'insufficient_service_evidence',http_status:r.status,body_digest:hash(bytes),signals};
}
export async function runFindMyPartCycle({outDir,now=new Date(),fetchImpl=fetch,network=false}={}){
 const at=new Date(now),ms=at.getTime(),tick=Math.floor(ms/300000);
 if(!Number.isFinite(ms)||!outDir)throw Error('findmypart_cycle_input_invalid');
 const dir=path.resolve(outDir);privateDir(dir);
 const stateFile=path.join(dir,'state.json'),latestFile=path.join(dir,'latest.json');
 const old=readPrivate(stateFile);
 if(old&&(old.schema!=='evercraft.findmypart.execution-state.v1'||!Number.isSafeInteger(old.tick)||!old.attempts||typeof old.attempts!=='object'))throw Error('findmypart_state_invalid');
 if(old?.tick>tick)throw Error('findmypart_clock_rollback');
 if(old?.tick===tick){const report=readPrivate(latestFile);if(report?.tick!==tick)throw Error('findmypart_receipt_mismatch');return {...report,duplicate:true,source_poll_performed:false,engineering_benchmark_executed:false}}
 const attempts={...(old?.attempts||{})};
 const observations=Object.fromEntries(SOURCES.filter(s=>old?.observations?.[s.key]).map(s=>[s.key,old.observations[s.key]]));
 const benchmark=runBenchmark();
 let observation=null,sourcePoll=false;
 const due=SOURCES.find(s=>!Number.isFinite(attempts[s.key])||ms-attempts[s.key]>=DAY);
 if(network&&due){
  // One fixed first-party GET maximum, no form submission, no redirects. Attempt is reserved before I/O to bound retries.
  attempts[due.key]=ms;
  write(stateFile,{schema:'evercraft.findmypart.execution-state.v1',tick:old?.tick??-1,attempts,observations});
  sourcePoll=true;
  let result;try{result=await boundedPage(due,fetchImpl)}catch{result={status:'source_unavailable'}}
  observation={source_key:due.key,business_name:due.name,sector:due.sector,source_url:due.url,observed_at:at.toISOString(),...result,buyer_need_confirmed:false,outreach_authorized:false};
  observations[due.key]=observation;
 }
 const report={schema:'evercraft.findmypart.execution-cycle.v1',tick,observed_at:at.toISOString(),duplicate:false,
  engineering_benchmark_executed:true,benchmark_cases:benchmark.dataset_size,real_world_recoveries_verified:benchmark.real_world_recoveries_verified,
  source_poll_performed:sourcePoll,commercial_status:!network?'network_disabled':due?observation.status:'source_cooldown',
  observation,service_fit_candidates:Object.values(observations).filter(x=>x.status==='service_fit_observed'&&ms-Date.parse(x.observed_at)>=0&&ms-Date.parse(x.observed_at)<=DAY).map(x=>({work_key:'findmypart:shop:'+x.source_key,business_name:x.business_name,source_url:x.source_url,sector:x.sector,observed_at:x.observed_at,body_digest:x.body_digest,buyer_need_confirmed:false,outreach_authorized:false})),buyers_qualified:0,worker_dispatched:false,code_changes:0,outreach_authorized:false,payment_verified:false,
  next_action:observation?.status==='service_fit_observed'?'reconcile_existing_revenue_desk_then_confirm_actual_stalled_case':'review_benchmark_gaps_and_due_sources'};
 write(latestFile,report);
 write(stateFile,{schema:'evercraft.findmypart.execution-state.v1',tick,attempts,observations});
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const i=process.argv.indexOf('--out');
 try{if(i<0||!process.argv[i+1])throw Error('out_required');
 const report=await runFindMyPartCycle({outDir:process.argv[i+1],network:process.argv.includes('--network')});
 console.log(JSON.stringify(report,null,2));
 }catch(e){console.error(JSON.stringify({status:'held',reason:String(e.message).slice(0,100)}));process.exitCode=1}
}
