import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {planReceiptBoundPdfs} from './public-demand-pdf-canary.mjs';
import {planDocumentCycle} from './public-demand-document-plan.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
function privateDir(dir){
 const s=fs.lstatSync(dir);
 if(!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('unsafe_directory');
}
function read(file,max=2000000){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>max)throw Error('unsafe_artifact');return fs.readFileSync(fd);}
 finally{fs.closeSync(fd);}
}
function publish(file,body,replace=false){
 const tmp=file+'.'+randomUUID()+'.tmp';
 try{
  const fd=fs.openSync(tmp,'wx',0o600);
  try{fs.writeFileSync(fd,body);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  if(replace)fs.renameSync(tmp,file);
  else{try{fs.linkSync(tmp,file);}catch(e){if(e.code!=='EEXIST'||!read(file).equals(body))throw e;}}
  const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}
 }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
export function admitCapture({root,sourceFile,expectedSha,indices}){
 if(!path.isAbsolute(root)||!path.isAbsolute(sourceFile)||!/^[a-f0-9]{64}\.json$/.test(path.basename(sourceFile))||!/^[a-f0-9]{64}$/.test(expectedSha)||!Array.isArray(indices)||indices.length<1||indices.length>3||new Set(indices).size!==indices.length)throw Error('invalid_admission');
 privateDir(root);const captures=path.join(root,'captures');privateDir(captures);
 const key=path.basename(sourceFile,'.json'),raw=read(sourceFile);
 const jobs=planReceiptBoundPdfs(raw,expectedSha,indices);
 const lock=path.join(root,'inbox-admission.lock');fs.mkdirSync(lock,{mode:0o700});
 try{
  const inbox=path.join(root,'document-inbox.json'),before=read(inbox,65536);
  const oldJobs=planDocumentCycle({root,manifestRaw:before});
  const m=JSON.parse(before);
  const existing=m.captures.find(c=>c.key===key);
  if(existing&&existing.sha256!==expectedSha)throw Error('capture_identity_conflict');
  const oldUrls=new Set(oldJobs.map(x=>x.job.url));
  const admitted=indices.filter((i,n)=>!oldUrls.has(jobs[n].url));
  if(!admitted.length)return {state:'unchanged',added:0,inbox_sha256:sha(before),qualified:false,contact_authorized:false,execution_authorized:false,send_performed:false};
  if(existing){existing.indices=[...new Set([...existing.indices,...admitted])];}
  else m.captures.push({key,sha256:expectedSha,indices:admitted});
  if(m.captures.length>20||m.captures.some(c=>c.indices.length>20))throw Error('inbox_capacity');
  const dest=path.join(captures,key+'.json');publish(dest,raw);
  const after=Buffer.from(JSON.stringify(m,null,2)+'\n');
  const next=planDocumentCycle({root,manifestRaw:after});
  if(next.length!==oldJobs.length+admitted.length)throw Error('admission_count_mismatch');
  if(!read(inbox,65536).equals(before))throw Error('inbox_changed');
  publish(inbox,after,true);
  return {state:'admitted',added:admitted.length,total:next.length,source_urls:jobs.filter((x,n)=>admitted.includes(indices[n])).map(x=>x.url),prior_inbox_sha256:sha(before),inbox_sha256:sha(after),qualified:false,contact_authorized:false,execution_authorized:false,send_performed:false};
 }finally{fs.rmdirSync(lock);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [root,sourceFile,expectedSha,...args]=process.argv.slice(2);if(!args.every(x=>/^\d+$/.test(x)))throw Error('invalid_indices');console.log(JSON.stringify(admitCapture({root,sourceFile,expectedSha,indices:args.map(Number)}),null,2));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
