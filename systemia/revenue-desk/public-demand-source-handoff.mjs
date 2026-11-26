import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {planPublicDemandResearch} from './public-demand-intake.mjs';
import {runPublicDemandGoal} from './public-demand-durable.mjs';
import {planDocumentCycle} from './public-demand-document-plan.mjs';
import {admitCapture} from './public-demand-inbox-admit.mjs';
import {startNativeBrowserRuntime} from '../evercraft-web/browser-worker/native-runtime.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const sources={
 yvl:{url:'https://www.yvl.org/about-us/finance-and-purchasing/',title:'YVL procurement index document-link observation v3',lane:'software'},
 susta:{url:'https://www.susta.org/contact/rfp/',title:'SUSTA procurement index document-link observation v3',lane:'research'}
};
const flags={qualified:false,contact_authorized:false,execution_authorized:false,send_performed:false};
function read(file,max=2000000){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>max)throw Error('unsafe_artifact');return fs.readFileSync(fd);}
 finally{fs.closeSync(fd);}
}
export function selectNewSolicitations({capture,knownUrls,limit=3}){
 if(!Number.isInteger(limit)||limit<1||limit>3||!(knownUrls instanceof Set)||capture?.state!=='captured_requires_research'||!Array.isArray(capture.document_pointers)||capture.document_pointers.length>20)throw Error('invalid_selection_input');
 const selected=[],seen=new Set(knownUrls);
 for(const [i,p] of capture.document_pointers.entries()){
  if(p.research_priority!==0||p.status!=='unverified_document_pointer')continue;
  const u=new URL(p.url);
  if(u.origin!==new URL(capture.source_url).origin||u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!u.pathname.toLowerCase().endsWith('.pdf')||seen.has(u.href))continue;
  seen.add(u.href);selected.push(i);
  if(selected.length===limit)break;
 }
 return selected;
}
export async function captureAndAdmit({root,sourceKey,browse,observationSlot=null}){
 if(observationSlot!==null&&(!Number.isSafeInteger(observationSlot)||observationSlot<0))throw Error('invalid_observation_slot');
 if(!path.isAbsolute(root)||!Object.hasOwn(sources,sourceKey)||typeof browse!=='function')throw Error('invalid_registered_source');
 const inbox=path.join(root,'document-inbox.json');
 const before=read(inbox,65536);
 const knownUrls=new Set(planDocumentCycle({root,manifestRaw:before}).map(x=>x.job.url));
 const source=sources[sourceKey];
 const hit=observationSlot===null?source:{...source,title:source.title+' slot '+observationSlot};
 const job=planPublicDemandResearch({hits:[hit]}).jobs[0];
 const result=await runPublicDemandGoal({directory:root,job,browse});
 const base={schema:'evercraft.public-demand.source-handoff.v1',source_key:sourceKey,goal_key:result.goal_key,capture_state:result.capture_state,source_url:job.source_url,...flags};
 if(!result.local_receipt_verified||result.goal_state!=='complete'||result.capture_state!=='captured_requires_research')return {...base,state:'hold_capture_not_verified',added:0};
 const key=result.goal_key.slice('public-demand-'.length);
 if(!/^[a-f0-9]{64}$/.test(key))throw Error('invalid_goal_key');
 const artifact=path.join(root,'captures',key+'.json');
 if(result.artifact!==artifact)throw Error('artifact_binding_mismatch');
 const raw=read(artifact),record=JSON.parse(raw),digest=sha(raw);
 const goal=JSON.parse(read(path.join(root,'goals',result.goal_key+'.json')));
 const task=goal.tasks?.[0];
 if(goal.schema!=='evercraft.goal.state.v1'||goal.goal_key!==result.goal_key||goal.mission_key!=='kaidance-public-demand-research'||goal.tasks?.length!==1||task?.status!=='complete'||task.work_key!=='capture-original-public-source'||task.attempt_key!==record.attempt_key||record.assignment_ref!=='sha256:'+key||!task.receipt_refs?.includes('sha256:'+digest)||record.capture?.job_ref!==job.job_ref||record.capture?.source_url!==job.source_url||record.capture?.state!=='captured_requires_research'||Object.keys(flags).some(k=>record.capture[k]!==false))throw Error('capture_goal_lineage_mismatch');
 if(observationSlot!==null&&!record.capture.document_link_coverage)return {...base,state:'hold_unbound_document_links',added:0,capture_sha256:digest};
 // YVL's page includes a large closed-bid archive. For this approved
 // canary only admit the currently identified solicitation family, not
 // archived bids merely because they contain RFP or RFQ in their names.
 const selectedCapture=sourceKey==='yvl'?{...record.capture,document_pointers:record.capture.document_pointers.map(p=>/\bRFP[- ]26[- ]002\b/i.test(decodeURIComponent(new URL(p.url).pathname)+' '+(p.label||''))?p:{...p,research_priority:2})}:record.capture;
 const indices=selectNewSolicitations({capture:selectedCapture,knownUrls});
 if(!indices.length)return {...base,state:'no_new_solicitation_pointers',added:0,capture_sha256:digest,document_pointer_count:record.capture.document_pointer_count??null,document_pointers_truncated:record.capture.document_pointers_truncated??null,document_link_coverage:record.capture.document_link_coverage??null};
 const admission=admitCapture({root,sourceFile:artifact,expectedSha:digest,indices});
 return {...base,state:admission.state,added:admission.added,capture_sha256:digest,admission};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [root,sourceKey,sourceDir,browsersPath]=process.argv.slice(2);
 let runtime;
 try{
  if(process.argv.length!==6||![root,sourceDir,browsersPath].every(x=>x&&path.isAbsolute(x))||!Object.hasOwn(sources,sourceKey))throw Error('usage: absolute_root registered_source absolute_browser_source absolute_browser_cache');
  runtime=await startNativeBrowserRuntime({sourceDir,browsersPath,maxConcurrency:1});
  console.log(JSON.stringify(await captureAndAdmit({root,sourceKey,browse:r=>runtime.browse(r)}),null,2));
 }catch(e){console.error(String(e.message).slice(0,160));process.exitCode=1;}
 finally{if(runtime)await runtime.close();}
}
