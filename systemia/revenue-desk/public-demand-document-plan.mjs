import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {planReceiptBoundPdfs} from './public-demand-pdf-canary.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
function read(file,max=2000000){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>max)throw Error('unsafe_artifact');return fs.readFileSync(fd);}
 finally{fs.closeSync(fd);}
}
export function planDocumentCycle({root,manifestRaw}){
 if(!path.isAbsolute(root)||!Buffer.isBuffer(manifestRaw)||manifestRaw.length>65536)throw Error('invalid_cycle_input');
 const m=JSON.parse(manifestRaw);
 if(m.schema!=='evercraft.public-demand.document-inbox.v1'||!Array.isArray(m.captures)||m.captures.length>20)throw Error('invalid_inbox');
 const jobs=[],seen=new Set();
 for(const c of m.captures){
  if(!/^[a-f0-9]{64}$/.test(c.key)||!/^[a-f0-9]{64}$/.test(c.sha256)||!Array.isArray(c.indices)||c.indices.length<1||c.indices.length>20||new Set(c.indices).size!==c.indices.length)throw Error('invalid_capture_entry');
  const parent=path.join(root,'captures',c.key+'.json'),raw=read(parent);
  for(const index of c.indices){
   const job=planReceiptBoundPdfs(raw,c.sha256,[index])[0],key=sha(JSON.stringify(job));
   if(seen.has(key))continue;seen.add(key);
   jobs.push({key,parent,parent_sha256:c.sha256,index,job});
  }
 }
 return jobs;
}
