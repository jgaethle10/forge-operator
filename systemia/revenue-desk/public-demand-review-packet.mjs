#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const sha=x=>createHash('sha256').update(x).digest('hex');
const flags=['qualified','contact_authorized','execution_authorized','send_performed'];
const categories={
 dates:/\b(?:deadline|due date|submission date|submit(?:ted)? (?:by|no later)|issued|issue date|closing date|20[2-3][0-9])\b/i,
 scope:/\b(?:scope|deliverables?|objectives?|services required|requirements?|tasks|work plan)\b/i,
 eligibility:/\b(?:eligib|qualifications?|experience|references?|subcontract|mandatory|minimum|certification|insurance|must)\w*/i,
 payment:/\b(?:budget|payment|pricing|cost|fees?|invoice|compensation|reimbursement)\b/i,
 response:/\b(?:proposal|submission|submit|contact|questions|evaluation criteria|selection criteria)\b/i
};
function read(file,max){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>max)throw Error('unsafe_artifact');return fs.readFileSync(fd);}
 finally{fs.closeSync(fd);}
}
export function buildReviewPacket({raw,expectedSha,acquisitionRaw,pdfBytes}={}){
 if(!Buffer.isBuffer(raw)||sha(raw)!==expectedSha||raw.length>2000000)throw Error('extraction_receipt_mismatch');
 const e=JSON.parse(raw);
 if(e.schema!=='evercraft.public-demand.pdf-extraction.v1'||e.state!=='extracted_requires_research'||flags.some(k=>e[k]!==false)||typeof e.text!=='string'||sha(e.text)!==e.text_sha256)throw Error('invalid_extraction');
 if(!Buffer.isBuffer(acquisitionRaw)||sha(acquisitionRaw)!==e.acquisition_receipt_sha256)throw Error('acquisition_receipt_mismatch');
 const a=JSON.parse(acquisitionRaw);
 if(a.schema!=='evercraft.public-demand.pdf-evidence.v1'||flags.some(k=>a[k]!==false)||a.url!==e.url||a.pdf_sha256!==e.pdf_sha256||!Buffer.isBuffer(pdfBytes)||pdfBytes.length!==a.pdf_bytes||sha(pdfBytes)!==a.pdf_sha256)throw Error('document_lineage_mismatch');
 const pages=e.text.split('\f'),hits={};
 for(const [kind,regex] of Object.entries(categories)){
  const rows=[];let matches=0;
  for(let p=0;p<pages.length;p++){
   const lines=pages[p].split(/\r?\n/);
   for(let i=0;i<lines.length;i++){
    if(!regex.test(lines[i]))continue;
    matches++;
    if(rows.length>=12)continue;
    const start=Math.max(0,i-1),end=Math.min(lines.length,i+3);
    rows.push({page:p+1,line:i+1,excerpt:lines.slice(start,end).join('\n').slice(0,900)});
   }
  }
  hits[kind]={matches,excerpts:rows,truncated:matches>rows.length};
 }
 return {schema:'evercraft.public-demand.review-packet.v1',source_url:e.url,pdf_sha256:e.pdf_sha256,extraction_receipt_sha256:expectedSha,acquisition_receipt_sha256:e.acquisition_receipt_sha256,parent_source:a.parent_source,parent_receipt_sha256:a.parent_receipt_sha256,full_document_coverage_verified:false,state:'commercial_review_required',excerpt_policy:'keyword_navigation_only_not_verified_claims',evidence:hits,required_review:['current_deadline_and_conflicts','buyer_identity','specific_deliverable','regional_and_subcontract_eligibility','fulfillment','payment_terms','approved_response_channel','contact_history_and_suppression'],qualified:false,contact_authorized:false,execution_authorized:false,send_performed:false};
}
function main(){
 const [file,expectedSha]=process.argv.slice(2);
 if(process.argv.length!==4||!path.isAbsolute(file)||!/[a-f0-9]{64}\.extraction-v1\.json$/.test(path.basename(file))||!/^[a-f0-9]{64}$/.test(expectedSha))throw Error('usage: absolute_extraction_receipt expected_sha');
 const stem=file.slice(0,-'.extraction-v1.json'.length);
 const dir=path.dirname(file),st=fs.lstatSync(dir);
 if(!st.isDirectory()||st.uid!==process.getuid()||(st.mode&0o077))throw Error('unsafe_directory');
 const packet=buildReviewPacket({raw:read(file,2000000),expectedSha,acquisitionRaw:read(stem+'.json',2000000),pdfBytes:read(stem+'.pdf',8*1024*1024)});
 const body=Buffer.from(JSON.stringify(packet,null,2)+'\n'),dest=stem+'.review-v1.json',tmp=dest+'.'+randomUUID()+'.tmp';
 try{
  const fd=fs.openSync(tmp,'wx',0o600);
  try{fs.writeFileSync(fd,body);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  try{fs.linkSync(tmp,dest);}catch(e){if(e.code!=='EEXIST'||!read(dest,2000000).equals(body))throw e;}
  const d=fs.openSync(dir,'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}
 }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
 console.log(JSON.stringify({receipt:dest,receipt_sha256:sha(body),source_url:packet.source_url,dates:packet.evidence.dates,scope:packet.evidence.scope.excerpts.slice(0,3),eligibility:packet.evidence.eligibility.excerpts.slice(0,3),payment:packet.evidence.payment.excerpts.slice(0,3),qualified:false,network_performed:false,send_performed:false},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
