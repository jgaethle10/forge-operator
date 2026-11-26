import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {planDocumentCycle} from './public-demand-document-plan.mjs';
import {buildReviewPacket} from './public-demand-review-packet.mjs';
import {triageReview} from './public-demand-triage.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const flags={qualified:false,contact_authorized:false,execution_authorized:false,send_performed:false};
const noAuthority=x=>Object.keys(flags).every(k=>x?.[k]===false);
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const bytes=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
function privateDir(dir){
 const s=fs.lstatSync(dir);if(!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('unsafe_audit_directory');
}
function read(file,max=2000000){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>max)throw Error('unsafe_audit_artifact');return fs.readFileSync(fd);}
 finally{fs.closeSync(fd);}
}
function verifyResult({j,docs,cycles}){
 const file=path.join(cycles,j.key+'.json');
 let raw;
 try{raw=read(file);}catch(e){if(e.code==='ENOENT')return {state:'pending',next_action:'await_document_worker'};throw e;}
 const r=JSON.parse(raw);
 if(r.schema!=='evercraft.public-demand.document-cycle-receipt.v1'||r.document_key!==j.key||r.source_url!==j.job.url||r.parent_receipt_sha256!==j.parent_sha256||!hex(r.inbox_sha256)||!Number.isFinite(Date.parse(r.observed_at))||!noAuthority(r))throw Error('cycle_receipt_binding_mismatch');
 const base={cycle_receipt_sha256:sha(raw),observed_at:r.observed_at};
 // A recorded failure is not a verified document result.
 if(r.state==='hold_document_cycle'){
  if(r.next_action!=='operator_reconcile_before_retry'||!['acquisition','extraction','review','triage'].includes(r.stage)||typeof r.reason!=='string')throw Error('invalid_failure_receipt');
  return {...base,state:'worker_hold',stage:r.stage,next_action:r.next_action};
 }
 if(!hex(r.review_receipt_sha256)||!hex(r.triage_receipt_sha256))throw Error('missing_review_lineage');
 const stem=path.join(docs,j.key),reviewRaw=read(stem+'.review-v1.json'),triageRaw=read(stem+'.triage-v1.json');
 if(sha(reviewRaw)!==r.review_receipt_sha256||sha(triageRaw)!==r.triage_receipt_sha256)throw Error('review_or_triage_digest_mismatch');
 const review=JSON.parse(reviewRaw),acquisitionRaw=read(stem+'.json'),a=JSON.parse(acquisitionRaw);
 if(a.url!==j.job.url||a.parent_source!==j.job.parent_source||a.parent_receipt_sha256!==j.parent_sha256||!noAuthority(a))throw Error('acquisition_assignment_mismatch');
 const rebuilt=buildReviewPacket({raw:read(stem+'.extraction-v1.json'),expectedSha:review.extraction_receipt_sha256,acquisitionRaw,pdfBytes:read(stem+'.pdf',8*1024*1024)});
 if(!reviewRaw.equals(bytes(rebuilt)))throw Error('review_rebuild_mismatch');
 const triage={...triageReview(rebuilt),review_receipt_sha256:r.review_receipt_sha256};
 if(!triageRaw.equals(bytes(triage))||r.state!==triage.state||r.next_action!==triage.next_action||JSON.stringify(r.deadline_date_candidates)!==JSON.stringify(triage.deadline_date_candidates))throw Error('triage_rebuild_mismatch');
 return {...base,state:triage.state,next_action:triage.next_action,review_receipt_sha256:r.review_receipt_sha256,triage_receipt_sha256:r.triage_receipt_sha256,deadline_date_candidates:triage.deadline_date_candidates,required_review:rebuilt.required_review,evidence_chain_reconstructed:true,deadline_timezone_verified:false,full_document_coverage_verified:false,payment_terms_verified:false};
}
export function auditCommercialQueue({root,now=new Date()}){
 if(!path.isAbsolute(root)||!Number.isFinite(+now))throw Error('invalid_audit_input');
 privateDir(root);
 const captures=path.join(root,'captures'),docs=path.join(root,'documents'),cycles=path.join(root,'document-cycle-receipts');
 for(const dir of [captures,docs,cycles])privateDir(dir);
 const inbox=path.join(root,'document-inbox.json'),manifestRaw=read(inbox,65536);
 const jobs=planDocumentCycle({root,manifestRaw}),rows=[];
 for(const j of jobs){
  const base={document_key:j.key,source_url:j.job.url,parent_receipt_sha256:j.parent_sha256,...flags};
  try{rows.push({...base,...verifyResult({j,docs,cycles})});}
  catch(e){rows.push({...base,state:'hold_evidence_integrity',reason:String(e.message).slice(0,160),next_action:'reconcile_artifacts_before_commercial_review'});}
 }
 if(!read(inbox,65536).equals(manifestRaw))throw Error('inbox_changed_during_audit_retry');
 const reviewQueue=rows.filter(x=>x.state==='commercial_review_required'&&x.evidence_chain_reconstructed===true).sort((a,b)=>(a.deadline_date_candidates?.[0]?.date||'9999').localeCompare(b.deadline_date_candidates?.[0]?.date||'9999')||a.document_key.localeCompare(b.document_key));
 return {schema:'evercraft.public-demand.commercial-queue-audit.v1',observed_at:now.toISOString(),inbox_sha256:sha(manifestRaw),counts:{admitted:rows.length,pending:rows.filter(x=>x.state==='pending').length,verified_document_results:rows.filter(x=>x.evidence_chain_reconstructed).length,commercial_review_required:reviewQueue.length,worker_holds:rows.filter(x=>x.state==='worker_hold').length,evidence_integrity_holds:rows.filter(x=>x.state==='hold_evidence_integrity').length,date_review_holds:rows.filter(x=>x.evidence_chain_reconstructed&&x.state.startsWith('hold_')).length,qualified:0},review_queue:reviewQueue.map(x=>x.document_key),assignments:rows,network_performed:false,write_performed:false,...flags};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==3)throw Error('usage: absolute_research_root');console.log(JSON.stringify(auditCommercialQueue({root:process.argv[2]}),null,2));}
 catch(e){console.error(String(e.message).slice(0,160));process.exitCode=1;}
}
