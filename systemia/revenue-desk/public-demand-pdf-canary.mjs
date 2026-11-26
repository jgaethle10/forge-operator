#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolvePublicHost} from '../evercraft-web/browser-worker/policy.mjs';
const MAX=8*1024*1024;
const sha=x=>createHash('sha256').update(x).digest('hex');
const allowedOrigins=new Set(['https://www.susta.org','https://www.yvl.org']);
function privateDir(dir){
 if(!path.isAbsolute(dir))throw Error('absolute_directory_required');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const s=fs.lstatSync(dir);
 if(!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('unsafe_directory');
}
function read(file,max){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>max)throw Error('unsafe_artifact');return fs.readFileSync(fd);}
 finally{fs.closeSync(fd);}
}
function retain(file,bytes){
 const tmp=file+'.'+randomUUID()+'.tmp';
 try{
  const fd=fs.openSync(tmp,'wx',0o600);
  try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  try{fs.linkSync(tmp,file);}catch(e){if(e.code!=='EEXIST'||!read(file,MAX).equals(bytes))throw e;}
  const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}
 }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
export function planReceiptBoundPdfs(raw,expectedSha,indices){
 if(!Buffer.isBuffer(raw)||raw.length>2000000||!/^[a-f0-9]{64}$/.test(expectedSha)||sha(raw)!==expectedSha)throw Error('parent_receipt_mismatch');
 const c=JSON.parse(raw).capture;
 if(c?.state!=='captured_requires_research'||c.qualified!==false||c.contact_authorized!==false||c.execution_authorized!==false||typeof c.text!=='string'||sha(c.text)!==c.text_sha256||!Array.isArray(c.document_pointers))throw Error('invalid_parent_capture');
 const origin=new URL(c.source_url).origin;
 if(!allowedOrigins.has(origin)||!Array.isArray(indices)||indices.length<1||indices.length>3||new Set(indices).size!==indices.length)throw Error('invalid_selection');
 return indices.map(i=>{
  if(!Number.isInteger(i)||i<0||i>=c.document_pointers.length)throw Error('invalid_pointer_index');
  const p=c.document_pointers[i],u=new URL(p.url);
  if(p.status!=='unverified_document_pointer'||u.origin!==origin||u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!u.pathname.toLowerCase().endsWith('.pdf'))throw Error('invalid_pdf_pointer');
  return {url:u.href,parent_receipt_sha256:expectedSha,parent_source:c.source_url};
 });
}
async function fetchPdf(url){
 const u=new URL(url);
 if(!allowedOrigins.has(u.origin)||u.search||u.hash||u.username||u.password)throw Error('source_not_allowed');
 const addresses=await resolvePublicHost(u.hostname);
 const ip=addresses.find(x=>x.family===4);
 if(!ip)throw Error('public_ipv4_required');
 return await new Promise((resolve,reject)=>{
  const req=https.get(u,{agent:false,family:4,autoSelectFamily:false,lookup:(_host,_opts,cb)=>cb(null,ip.address,4),rejectUnauthorized:true,signal:AbortSignal.timeout(25000),headers:{'User-Agent':'Evercraft-Public-Research/1.0','Accept':'application/pdf'}},res=>{
   if(res.statusCode!==200){res.destroy();reject(Error('http_'+res.statusCode));return;}
   const mime=String(res.headers['content-type']||'').split(';')[0].trim().toLowerCase();
   if(!['application/pdf','application/octet-stream'].includes(mime)||Number(res.headers['content-length']||0)>MAX){res.destroy();reject(Error('content_type_or_size_hold'));return;}
   const chunks=[];let size=0;
   res.on('data',chunk=>{size+=chunk.length;if(size>MAX){res.destroy(Error('size_limit'));return;}chunks.push(chunk);});
   res.on('error',reject);
   res.on('aborted',()=>reject(Error('response_aborted')));
   res.on('end',()=>{const bytes=Buffer.concat(chunks);if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))reject(Error('pdf_magic_mismatch'));else resolve(bytes);});
  });
  req.on('error',reject);
 });
}
function extract(file){
 if(!fs.existsSync('/usr/bin/bwrap')||!fs.existsSync('/usr/bin/pdftotext')||!fs.existsSync('/usr/bin/prlimit'))return {state:'hold_isolated_parser_unavailable'};
 const args=['--unshare-all','--die-with-parent','--new-session','--clearenv','--ro-bind','/usr','/usr','--ro-bind-try','/lib','/lib','--ro-bind-try','/lib64','/lib64','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--setenv','HOME','/tmp','--setenv','LANG','C.UTF-8','--ro-bind',file,'/input.pdf','/usr/bin/prlimit','--as=536870912','--cpu=15','--nofile=64','--','/usr/bin/pdftotext','-f','1','-l','40','-layout','-enc','UTF-8','/input.pdf','-'];
 const r=spawnSync('/usr/bin/bwrap',args,{timeout:22000,maxBuffer:1024*1024,encoding:'utf8',env:{PATH:'/usr/bin'}});
 if(r.status!==0||r.error)return {state:'hold_isolated_parser_failed'};
 const text=r.stdout;
 if(!text.trim())return {state:'hold_no_extractable_text'};
 return {state:'extracted_requires_research',text,text_sha256:sha(text),page_limit:40,full_document_coverage_verified:false};
}
// Resume extraction from an explicitly pinned acquisition receipt. Never
// download again or overwrite the original evidence/hold.
export function resumePdfExtraction({receipt,expectedSha}={}){
 if(!path.isAbsolute(receipt)||!/^([a-f0-9]{64})\.json$/.test(path.basename(receipt))||!/^[a-f0-9]{64}$/.test(expectedSha))throw Error('invalid_resume_binding');
 const dir=path.dirname(receipt);privateDir(dir);
 const raw=read(receipt,2000000);
 if(sha(raw)!==expectedSha)throw Error('acquisition_receipt_mismatch');
 const prior=JSON.parse(raw);
 if(prior.schema!=='evercraft.public-demand.pdf-evidence.v1'||!['hold_isolated_parser_unavailable','hold_isolated_parser_failed'].includes(prior.state)||prior.qualified!==false||prior.contact_authorized!==false||prior.execution_authorized!==false||prior.send_performed!==false)throw Error('invalid_acquisition_hold');
 const u=new URL(prior.url);
 if(!allowedOrigins.has(u.origin)||u.origin!==new URL(prior.parent_source).origin||u.search||u.hash||u.username||u.password||!u.pathname.toLowerCase().endsWith('.pdf')||!/^[a-f0-9]{64}$/.test(prior.parent_receipt_sha256))throw Error('invalid_document_source');
 const key=sha(JSON.stringify({url:prior.url,parent_receipt_sha256:prior.parent_receipt_sha256,parent_source:prior.parent_source}));
 if(path.basename(receipt)!==key+'.json')throw Error('acquisition_identity_mismatch');
 const pdf=path.join(dir,key+'.pdf'),bytes=read(pdf,MAX);
 if(bytes.length!==prior.pdf_bytes||sha(bytes)!==prior.pdf_sha256||!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('retained_pdf_mismatch');
 const dest=path.join(dir,key+'.extraction-v1.json');
 if(fs.existsSync(dest)){
  const saved=read(dest,2000000),record=JSON.parse(saved);
  if(record.acquisition_receipt_sha256!==expectedSha||record.pdf_sha256!==prior.pdf_sha256||record.state!=='extracted_requires_research'||typeof record.text!=='string'||sha(record.text)!==record.text_sha256)throw Error('stored_extraction_mismatch');
  const {text,...summary}=record;
  return {...summary,receipt:dest,receipt_sha256:sha(saved),reused:true,network_performed:false};
 }
 const parsed=extract(pdf);
 if(parsed.state!=='extracted_requires_research')return {url:prior.url,pdf_sha256:prior.pdf_sha256,acquisition_receipt_sha256:expectedSha,state:parsed.state,qualified:false,network_performed:false,send_performed:false};
 const record={schema:'evercraft.public-demand.pdf-extraction.v1',url:prior.url,acquisition_receipt_sha256:expectedSha,pdf_sha256:prior.pdf_sha256,observed_at:new Date().toISOString(),...parsed,qualified:false,contact_authorized:false,execution_authorized:false,send_performed:false};
 const body=Buffer.from(JSON.stringify(record));
 retain(dest,body);
 const {text,...summary}=record;
 return {...summary,receipt:dest,receipt_sha256:sha(body),reused:false,network_performed:false};
}
async function main(){
 if(process.argv[2]==='--resume'){
  if(process.argv.length!==5)throw Error('usage: --resume absolute_receipt expected_sha');
  console.log(JSON.stringify(resumePdfExtraction({receipt:process.argv[3],expectedSha:process.argv[4]}),null,2));
  return;
 }
 const [parent,expected,dir,...rest]=process.argv.slice(2);
 if(!parent||!path.isAbsolute(parent)||!dir||!rest.every(x=>/^\d+$/.test(x)))throw Error('usage: parent expected_sha absolute_output_dir pointer_indices');
 const plan=planReceiptBoundPdfs(read(parent,2000000),expected,rest.map(Number));
 privateDir(dir);
 const results=[];
 for(const job of plan){
  const key=sha(JSON.stringify(job)),pdf=path.join(dir,key+'.pdf'),receipt=path.join(dir,key+'.json');
  try{
   const bytes=fs.existsSync(pdf)?read(pdf,MAX):await fetchPdf(job.url);
   if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('pdf_magic_mismatch');
   retain(pdf,bytes);
   let record;
   if(fs.existsSync(receipt)){
    record=JSON.parse(read(receipt,2000000));
    if(record.url!==job.url||record.parent_receipt_sha256!==expected||record.pdf_sha256!==sha(bytes)|| (record.text&&record.text_sha256!==sha(record.text)))throw Error('stored_receipt_mismatch');
   }else{
    record={schema:'evercraft.public-demand.pdf-evidence.v1',...job,pdf_sha256:sha(bytes),pdf_bytes:bytes.length,observed_at:new Date().toISOString(),...extract(pdf),qualified:false,contact_authorized:false,execution_authorized:false,send_performed:false};
    retain(receipt,Buffer.from(JSON.stringify(record)));
   }
   const {text,...summary}=record;results.push({...summary,receipt,receipt_sha256:sha(read(receipt,2000000))});
  }catch(e){results.push({...job,state:'hold_document_ingestion',reason:String(e.message).slice(0,160),qualified:false,send_performed:false});}
 }
 console.log(JSON.stringify({schema:'evercraft.public-demand.pdf-canary.v1',results,qualified_count:0,send_performed:false},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
