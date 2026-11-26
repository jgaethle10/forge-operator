#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildReviewPacket} from './public-demand-review-packet.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const flags={qualified:false,contact_authorized:false,execution_authorized:false,send_performed:false};
const months='January February March April May June July August September October November December'.split(' ');
const datePattern='('+months.join('|')+')\\s+(\\d{1,2}),\\s+(20\\d{2})';
function iso(match){
 const y=Number(match[3]),m=months.findIndex(x=>x.toLowerCase()===match[1].toLowerCase()),d=Number(match[2]);
 const date=new Date(Date.UTC(y,m,d));
 if(m<0||date.getUTCMonth()!==m||date.getUTCDate()!==d)return null;
 return date.toISOString().slice(0,10);
}
// A standalone first-page date is a header date candidate, not proof of
// publication. Only explicitly labeled proposal deadlines are considered.
export function triageReview(packet){
 if(packet?.schema!=='evercraft.public-demand.review-packet.v1'||Object.keys(flags).some(k=>packet[k]!==false))throw Error('invalid_review_packet');
 const rows=packet.evidence?.dates?.excerpts;
 if(!Array.isArray(rows)||rows.length>12)throw Error('invalid_date_evidence');
 const header=[],deadlines=[];
 for(const row of rows){
  if(!Number.isInteger(row.page)||!Number.isInteger(row.line)||typeof row.excerpt!=='string'||row.excerpt.length>900)throw Error('invalid_excerpt');
  if(row.page===1&&row.line<=3){
   for(const line of row.excerpt.split('\n')){
    const match=line.trim().match(new RegExp('^'+datePattern+'$','i'));
    if(match&&iso(match))header.push({date:iso(match),page:row.page,line:row.line});
   }
  }
  const clean=row.excerpt.replace(/\s+/g,' ');
  const match=clean.match(new RegExp('(?:proposals? from bidders must be submitted by|proposals? must be submitted by|proposal deadline\\s*[:])\\s*'+datePattern,'i'));
  if(match&&iso(match))deadlines.push({date:iso(match),page:row.page,line:row.line});
 }
 const unique=rows=>[...new Map(rows.map(x=>[x.date,x])).values()];
 const h=unique(header),d=unique(deadlines);
 let state='hold_manual_date_review',next='verify_original_document_deadline_and_status';
 if(h.length===1&&d.length===1&&h[0].date>d[0].date){
  state='hold_document_date_conflict';next='seek_authoritative_correction_via_approved_procurement_channel';
 }else if(h.length===1&&d.length===1&&!packet.evidence.dates.truncated){
  state='commercial_review_required';next='verify_current_status_eligibility_deliverables_and_payment';
 }
 return {schema:'evercraft.public-demand.triage.v1',source_url:packet.source_url,extraction_receipt_sha256:packet.extraction_receipt_sha256,pdf_sha256:packet.pdf_sha256,header_date_candidates:h,deadline_date_candidates:d,state,next_action:next,requires_human_review:true,deadline_timezone_verified:false,full_document_coverage_verified:false,payment_terms_verified:false,network_performed:false,...flags};
}
function read(file,max){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>max)throw Error('unsafe_artifact');return fs.readFileSync(fd);}
 finally{fs.closeSync(fd);}
}
function retain(file,body){
 const tmp=file+'.'+randomUUID()+'.tmp';
 try{const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,body);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 try{fs.linkSync(tmp,file);}catch(e){if(e.code!=='EEXIST'||!read(file,2000000).equals(body))throw e;}
 const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}
 }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
export function runTriage({directory,key,reviewSha}){
 if(!path.isAbsolute(directory)||!/^[a-f0-9]{64}$/.test(key)||!/^[a-f0-9]{64}$/.test(reviewSha))throw Error('invalid_triage_binding');
 const st=fs.lstatSync(directory);if(!st.isDirectory()||st.uid!==process.getuid()||(st.mode&0o077))throw Error('unsafe_directory');
 const stem=path.join(directory,key),raw=read(stem+'.review-v1.json',2000000);
 if(sha(raw)!==reviewSha)throw Error('review_receipt_mismatch');
 const packet=JSON.parse(raw);
 const rebuilt=buildReviewPacket({raw:read(stem+'.extraction-v1.json',2000000),expectedSha:packet.extraction_receipt_sha256,acquisitionRaw:read(stem+'.json',2000000),pdfBytes:read(stem+'.pdf',8*1024*1024)});
 if(!raw.equals(Buffer.from(JSON.stringify(rebuilt,null,2)+'\n')))throw Error('review_lineage_mismatch');
 const record={...triageReview(rebuilt),review_receipt_sha256:reviewSha};
 const file=stem+'.triage-v1.json',body=Buffer.from(JSON.stringify(record,null,2)+'\n');
 retain(file,body);
 return {...record,receipt:file,receipt_sha256:sha(body)};
}
function main(){
 const [directory,...pairs]=process.argv.slice(2);
 if(pairs.length<1||pairs.length>10)throw Error('invalid_batch_size');
 const results=pairs.map(pair=>{const [key,reviewSha,extra]=pair.split(':');if(extra!==undefined)throw Error('invalid_pair');return runTriage({directory,key,reviewSha});});
 console.log(JSON.stringify({schema:'evercraft.public-demand.triage-batch.v1',results,holds:results.filter(x=>x.state.startsWith('hold_')).length,qualified_count:0,network_performed:false,send_performed:false},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}
