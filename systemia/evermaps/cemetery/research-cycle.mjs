import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createGoalState,admitGoalPlan} from '../../organism/goal-runtime.mjs';
import {createGoalStateFile,readGoalState} from '../../organism/goal-store.mjs';
import {createCapabilityRegistry} from '../../organism/capability-runtime.mjs';
import {executePersistedGoalWork} from '../../organism/goal-durable-dispatch.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const mission='evermaps-national-cemetery-atlas';
const endpoint='https://www.data.va.gov/api/catalog/v1?search_context=www.data.va.gov&q=cemetery&limit=20';
function save(file,value){const tmp=file+'.'+randomUUID();try{fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file)}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}}
export async function researchCycle({outDir,now=new Date(),fetcher=fetch}={}){
 if(!outDir||!path.isAbsolute(outDir))throw Error('private absolute output required');
 fs.mkdirSync(outDir,{recursive:true,mode:0o700});
 const st=fs.lstatSync(outDir);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077))throw Error('private directory required');
 const day=new Date(now).toISOString().slice(0,10);
 const key='va-catalog-'+day,work='discover-va-cemetery-datasets',file=path.join(outDir,key+'.goal.json'),evidence=path.join(outDir,key+'.evidence.json');
 const desired=admitGoalPlan({state:createGoalState({goalKey:key,missionKey:mission,objective:'Discover federal public cemetery dataset metadata',contextRefs:[endpoint],now}),plan:[{work_key:work,work_type:'cemetery_catalog_read',impact:'read_only_research',dedupe_key:mission+'|'+key}],now});
 if(!fs.existsSync(file))await createGoalStateFile(file,desired,{now});
 const prior=await readGoalState(file);
 if(prior.goal_key!==key||prior.mission_key!==mission||prior.tasks.length!==1||prior.tasks[0].work_key!==work||prior.tasks[0].dedupe_key!==mission+'|'+key)throw Error('goal identity mismatch');
 let executed=false;
 if(prior.next_work_keys.includes(work)){
 const registry=createCapabilityRegistry([{capability_key:'evermaps.cemetery.catalog-read',authority:'read-only',work_types:['cemetery_catalog_read'],execute:async()=>{
 const response=await fetcher(endpoint,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{accept:'application/json'}});
 if(!response.ok||!response.body)throw Error('catalog unavailable');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576)throw Error('catalog too large');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 const raw=Buffer.concat(chunks),parsed=JSON.parse(raw.toString('utf8'));
 if(!Array.isArray(parsed.results))throw Error('catalog schema mismatch');
 const records=parsed.results.slice(0,20).map(x=>({id:String(x.resource?.id||'').slice(0,100),name:String(x.resource?.name||'').slice(0,300),permalink:String(x.permalink||'').slice(0,500)})).filter(x=>x.id&&x.name);
 const receipt={schema:'evercraft.cemetery.catalog-evidence.v1',source:endpoint,retrieved_at:new Date().toISOString(),raw_sha256:sha(raw),records,rights_review:'pending',burial_records_imported:0};
 save(evidence,receipt);
 return {result:'complete',receipt_ref:'sha256:'+sha(JSON.stringify(receipt)),evidence_refs:[endpoint]};
 }}]);
 const result=await executePersistedGoalWork({filePath:file,workKey:work,registry,now});executed=result.executed;
 }
 const current=await readGoalState(file);
 let count=null;
 if(current.status==='complete'){const receipt=JSON.parse(fs.readFileSync(evidence,'utf8'));if(!current.tasks[0].receipt_refs.includes('sha256:'+sha(JSON.stringify(receipt))))throw Error('evidence mismatch');count=receipt.records.length;}
 const report={schema:'evercraft.cemetery.research-cycle.v1',mission_key:mission,goal_key:key,observed_at:new Date(now).toISOString(),state:current.status,executed_this_cycle:executed,catalog_candidates:count,burial_records_imported:0,remote_saban_dispatch:false,rights_review_required:true};
 save(path.join(outDir,'latest.json'),report);return report;
}
