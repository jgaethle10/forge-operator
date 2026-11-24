import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
function save(file,obj){const tmp=file+'.'+randomUUID();try{fs.writeFileSync(tmp,JSON.stringify(obj,null,2),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file)}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}}
function read(file){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)||s.size>2097152)throw Error('untrusted private evidence');return JSON.parse(fs.readFileSync(file,'utf8'))}
export function sourceId(url){const m=/^https:\/\/www\.data\.va\.gov\/d\/([a-z0-9]{4}-[a-z0-9]{4})\/?$/.exec(url);return m?.[1]||null}
export function classifyMetadata(meta,id){
 if(meta.id!==id)throw Error('source identity mismatch');
 const columns=(Array.isArray(meta.columns)?meta.columns:[]).slice(0,250).map(c=>({name:String(c.fieldName||'').slice(0,100),type:String(c.dataTypeName||'').slice(0,60)})).filter(c=>c.name);
 const tabular=meta.viewType==='tabular'&&columns.length>0;
 return {asset_type:String(meta.assetType||meta.viewType||'unknown').slice(0,80),tabular_metadata:tabular,columns,
 possible_burial_fields:columns.filter(c=>/grave|interment|burial|deceased|last_name|first_name/i.test(c.name)).map(c=>c.name),
 possible_location_fields:columns.filter(c=>/latitude|longitude|location|address|geometry/i.test(c.name)).map(c=>c.name),
 declared_license:String(meta.licenseId||meta.metadata?.license||'').slice(0,200)||null,
 reuse_status:'review_required',download_verified:false,record_count:null,coordinate_precision:'unverified',ingestion_authorized:false};
}
export async function classifyNext({outDir,fetcher=fetch,now=new Date()}={}){
 if(!outDir||!path.isAbsolute(outDir))throw Error('absolute private directory required');
 const st=fs.lstatSync(outDir);if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077))throw Error('private directory required');
 const candidates=new Map();
 for(const name of fs.readdirSync(outDir).filter(n=>/^va-catalog-\d{4}-\d{2}-\d{2}\.evidence\.json$/.test(n)).sort().slice(-30)){
 const evidence=read(path.join(outDir,name)),goal=read(path.join(outDir,name.replace('.evidence.','.goal.')));
 if(goal.status!=='complete'||goal.mission_key!=='evermaps-national-cemetery-atlas'||!goal.tasks?.[0]?.receipt_refs?.includes('sha256:'+sha(JSON.stringify(evidence))))throw Error('catalog evidence mismatch');
 for(const row of evidence.records){const id=sourceId(row.permalink);if(id)candidates.set(id,{id,name:row.name,source:row.permalink,catalog_evidence_sha256:sha(JSON.stringify(evidence))});}
 }
 const dir=path.join(outDir,'classification');fs.mkdirSync(dir,{mode:0o700,recursive:true});
 const ds=fs.lstatSync(dir);if(!ds.isDirectory()||ds.isSymbolicLink()||(ds.mode&0o077))throw Error('private classification directory required');
 const ordered=[...candidates.values()].sort((a,b)=>Number(!/grave|burial|locations|address/i.test(a.name))-Number(!/grave|burial|locations|address/i.test(b.name))||a.id.localeCompare(b.id));
 const pending=ordered.find(c=>!fs.existsSync(path.join(dir,c.id+'.json')));
 let attempted=false;
 if(pending){
 const file=path.join(dir,pending.id+'.json');
 const claim=file+'.claim';fs.writeFileSync(claim,'claimed',{flag:'wx',mode:0o600});
 try{
 attempted=true;const url='https://www.data.va.gov/api/views/'+pending.id+'.json';
 let receipt={...pending,schema:'evercraft.cemetery.source-classification.v1',observed_at:now.toISOString(),metadata_url:url,status:'held',reuse_status:'review_required',ingestion_authorized:false};
 try{
 const res=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{accept:'application/json'}});
 if(!res.ok||!res.body)throw Error('metadata unavailable');
 const reader=res.body.getReader(),parts=[];let bytes=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1048576)throw Error('metadata too large');parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 const raw=Buffer.concat(parts);receipt={...receipt,...classifyMetadata(JSON.parse(raw.toString('utf8')),pending.id),status:'metadata_observed',metadata_sha256:sha(raw)};
 }catch{receipt.reason='metadata_request_or_schema_failed';}
 save(file,receipt);
 }finally{fs.unlinkSync(claim);}
 }
 const rows=ordered.filter(c=>fs.existsSync(path.join(dir,c.id+'.json'))).map(c=>read(path.join(dir,c.id+'.json')));
 const report={schema:'evercraft.cemetery.classification-summary.v1',observed_at:now.toISOString(),candidate_count:ordered.length,classified:rows.filter(r=>r.status==='metadata_observed').length,held:rows.filter(r=>r.status==='held').length,pending:ordered.length-rows.length,attempted_this_cycle:attempted,burial_records_imported:0,ingestion_authorized:false};
 save(path.join(dir,'latest.json'),report);return report;
}
