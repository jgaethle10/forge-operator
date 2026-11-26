import {createHash} from 'node:crypto';
import {planPublicDemandResearch} from './public-demand-intake.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
// Local read-only evidence capture. No interpretation of page instructions,
// contact discovery, message sending, credential use or qualification.
export async function capturePublicDemand({job,browse,now=new Date()}={}){
 if(!Number.isFinite(+now)||typeof browse!=='function'||job?.stage!=='source_research_required'||job.qualified!==false||job.contact_authorized!==false||job.execution_authorized!==false)throw Error('invalid_capture_assignment');
 const expected=planPublicDemandResearch({hits:[{url:job.source_url,title:job.title,lane:job.lane}],now}).jobs[0];
 if(!expected||expected.job_ref!==job.job_ref||expected.source_url!==job.source_url)throw Error('assignment_identity_mismatch');
 const source=new URL(job.source_url);
 if(source.search)throw Error('query_url_requires_separate_binding_review');
 const base={schema:'evercraft.public-demand.capture.v1',job_ref:job.job_ref,source_url:source.href,observed_at:now.toISOString(),qualification_performed:false,qualified:false,contact_authorized:false,execution_authorized:false,send_performed:false};
 let r;
 try{r=await browse({url:source.href,actions:[],timeout_ms:25000,max_text_chars:40000,include_screenshot:false,include_screenshot_base64:false})}catch{return {...base,state:'hold_browser_failure'};}
 const status=r?.http_status;
 const hold=reason=>({...base,state:reason,http_status:Number.isInteger(status)?status:null});
 if(r?.ok!==true||r.engine!=='evercraft-owned-browser-worker-v1'||r.mode!=='public_read_only')return hold('hold_untrusted_response');
 if(!Number.isInteger(status)||status<200||status>=300)return hold('hold_http_status');
 const {snapshot,screenshot,ok,evidence_receipt_sha256,...evidence}=r;
 if(typeof evidence_receipt_sha256!=='string'||hash(JSON.stringify(evidence))!==evidence_receipt_sha256)return hold('hold_receipt_mismatch');
 if(r.requested_url!==source.href||r.final_url!==source.href)return hold('hold_url_binding');
 const b=r.boundaries;
 if(!b||b.fresh_context_per_job!==true||b.private_and_reserved_targets_blocked!==true||b.dns_pinned_outbound_proxy!==true||b.persisted_cookies!==false||b.downloads_allowed!==false||b.form_submit_action_supported!==false||!Array.isArray(r.actions)||r.actions.length!==0)return hold('hold_boundary_mismatch');
 const text=snapshot?.text;
 if(typeof text!=='string'||!text.trim()||text.length>40000||hash(text)!==r.text_sha256)return hold('hold_text_integrity');
 const start=Date.parse(r.started_at),end=Date.parse(r.finished_at);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<+now-60000||end<start||end>Math.max(+now,Date.now())+60000)return hold('hold_capture_clock');
 // Snapshot links are local navigation hints, not authenticated document evidence.
 // Do not follow them here. Keep only same-origin, query-free public document pointers.
 const {pointers:document_pointers,eligible_count:document_pointer_count,truncated:document_pointers_truncated}=rankDocumentPointers(source,snapshot.links);
 return {...base,document_pointers,document_pointer_count,document_pointers_truncated,state:'captured_requires_research',http_status:status,captured_at:r.finished_at,title:String(snapshot.title||'').slice(0,500),text,text_sha256:r.text_sha256,browser_receipt_sha256:evidence_receipt_sha256,capture_verification:'local_browser_response_integrity_only',required_evidence:expected.required_evidence};
}

// Rank navigation hints BEFORE limiting output. A relevant solicitation late
// in a directory must not be displaced by historical budget documents.
export function rankDocumentPointers(source,links){
 const origin=new URL(source).origin, candidates=[],seen=new Set();
 for(const link of (Array.isArray(links)?links.slice(0,150):[])){
  let u;try{u=new URL(link?.href)}catch{continue;}
  if(u.origin!==origin||u.protocol!=='https:'||u.username||u.password||u.search||!/(?:\.pdf|\.docx)$/i.test(u.pathname))continue;
  u.hash='';
  if(seen.has(u.href))continue;seen.add(u.href);
  let filename;try{filename=decodeURIComponent(u.pathname.split('/').pop())}catch{filename=u.pathname;}
  const label=String(link.text||'').slice(0,200);
  const words=(filename+' '+label).toLowerCase().replace(/[^a-z0-9]+/g,' ');
  const solicitation=/\b(?:rfp|rfq|rfi|solicitation|tender|addendum|addenda|invitation to bid|request for proposals?|request for qualifications?|request for quotations?)\b/.test(words);
  const budget=/\b(?:budget|resolution|financial statement|audit report)\b/.test(words);
  const rank=solicitation?0:budget?2:1;
  candidates.push({url:u.href,label,status:'unverified_document_pointer',research_priority:rank});
 }
 candidates.sort((a,b)=>a.research_priority-b.research_priority);
 return {pointers:candidates.slice(0,20),eligible_count:candidates.length,truncated:candidates.length>20};
}
